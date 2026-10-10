# AgentBreak: AI Agent Security Testing & Defense Evaluation Harness

**AgentBreak** is a controlled, reproducible security-testing harness and evaluation workbench for tool-using AI agents. It evaluates agents against prompt injection, memory poisoning, unauthorized privilege escalation, and data leakage in an isolated sandbox. It features an independent invariant evaluator, deterministic Security Gateway guardrails, an autonomous attack mutator, an interactive red-team Attack Lab, and an optional live Ollama LLM backend.

> **Scope Disclaimer:** Controlled in-process mock-tool harness, deterministic scripted agent (default). Discovery is a budgeted heuristic search over a bounded mutation space. Results represent controlled benchmark evaluations, not an unbounded measure of real-world arbitrary hacking.

---

## What AgentBreak Is (In Plain Language)

Modern AI agents can read internal documents, look up customers, query notes, and send outbound emails. If an untrusted email or customer document contains malicious text (indirect prompt injection), vulnerable agents can be hijacked into exfiltrating confidential data or calling unauthorized tools.

**AgentBreak solves this challenge by providing:**
1. **Reproducible Test Scenarios:** 23 canonical benchmark scenarios (16 attacks spanning 5 threat groups, plus 7 legitimate benign tasks).
2. **Independent Security Evaluator:** Evaluates chronological event traces against security invariants (such as canary protection, recipient scope, and query limits).
3. **Deterministic Security Gateway:** Intercepts agent tool calls before execution, enforcing tool allowlists, recipient rules, wildcard query bounds, and canary detection.
4. **Autonomous Attack Discovery:** A mutator that executes budgeted searches over 6 operator families, learning from gateway rejections to uncover defense evasions.
5. **Interactive Attack Lab:** A live workbench for red-team engineers to craft or edit prompt payloads, inspect event timelines, and verify deterministic replay.
6. **Optional Live LLM (Ollama) Backend:** Switch between the deterministic scripted agent and a live local model (`qwen2.5:7b`) with multi-trial averaging ($N$ runs) and replay caching.

---

## Final Benchmark Summary (23 Scenarios)

### Attack Prevention by Threat Group

| Threat Group | Scenarios | No Defense (`none`) | Security Gateway (`gateway`) | Prevented | Prevention Rate | Residual Misses |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **Direct Injection** | 3 | 3 / 3 (100.0%) | 0 / 3 (0.0%) | 3 | 100.0% | *None* |
| **Indirect Injection** | 3 | 3 / 3 (100.0%) | 0 / 3 (0.0%) | 3 | 100.0% | *None* |
| **Excessive Permissions** | 4 | 4 / 4 (100.0%) | 1 / 4 (25.0%) | 3 | 75.0% | `excessive_access_broad_query` |
| **Data Leakage** | 3 | 3 / 3 (100.0%) | 0 / 3 (0.0%) | 3 | 100.0% | *None* |
| **Memory / Multi-step** | 3 | 3 / 3 (100.0%) | 1 / 3 (33.3%) | 2 | 66.7% | `memory_poisoning_excessive_access` |
| **TOTAL ATTACKS** | **16** | **16 / 16 (100.0%)** | **2 / 16 (12.5%)** | **14** | **87.5%** | **2 documented residuals** |

### Legitimate Workflow Preservation (Benign Tasks)
- **Benign Tasks Held:** 7 / 7 (100.0%) under both `none` and `gateway`
- **False Block Rate:** 0.0% (0 / 7) &mdash; **0 false blocks** on legitimate operations
- **Task Completion Rate:** 100.0% (7 / 7)

---

## Project Structure Overview

```text
Apexcode_college_round/
├── backend/
│   ├── app/
│   │   ├── agent/            # AgentBackend interface, ScriptedAgent, OllamaAgent, executor, recorder
│   │   ├── api/              # FastAPI endpoints (runs, trials, campaigns, custom_attack, compare)
│   │   ├── db/               # SQLAlchemy models (runs, trials, events, replays, campaigns) and session
│   │   ├── discovery/        # Autonomous attack mutator and campaign loop
│   │   ├── evaluator/        # Independent invariant evaluator & severity classifier
│   │   ├── gateway/          # Security Gateway, policies, and rule-based interceptors
│   │   ├── sandbox/          # In-process mock tool environment (customers, docs, outbox, notes)
│   │   ├── orchestrator.py   # Synchronous trial runner, multi-run logic, Ollama fallback
│   │   └── schemas.py        # Pydantic schemas for API requests and responses
│   ├── scenarios/            # Canonical benchmark scenarios (JSON specs)
│   └── tests/                # Comprehensive pytest suite (162 unit & integration tests)
├── frontend/
│   ├── src/
│   │   ├── api/              # Typed API client wrapper
│   │   ├── components/       # UI components (EventTimeline, badges, charts)
│   │   ├── pages/            # Overview, Scenarios, AttackLab, Campaign, Compare, TrialViewer
│   │   └── types/            # TypeScript interfaces for API models and trace events
├── docs/                     # Technical documentation (architecture, limitations, demo script)
└── scripts/
    ├── run_matrix.py         # Full benchmark matrix CLI runner
    ├── run_campaign.py       # Autonomous discovery campaign CLI runner
    ├── seed_demo.py          # One-command prep script to populate/reset demo database
    └── try_ollama.py         # Manual verification script for live local Ollama model
```

---

## Setup & Running Locally

### Prerequisites
- Python 3.10+ (tested on Python 3.12 / 3.13)
- Node.js 18+ and npm
- *(Optional for Live Model mode)*: [Ollama](https://ollama.ai) with `qwen2.5:7b`

### 1. Backend Setup
```bash
cd backend
python -m venv .venv

# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On Linux / macOS:
# source .venv/bin/activate

pip install -r requirements.txt

# Start backend server on port 8000:
uvicorn app.main:app --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install

# Build production bundle:
npm run build

# Start frontend dev server on port 5173:
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## Running Verification Scripts & Tests

### Run Full Pytest Suite (162 Tests)
```bash
# From repository root or backend folder:
pytest backend/tests
```

### Run Canonical Benchmark Matrix
```bash
python scripts/run_matrix.py
```

### Prepopulate / Reset the Demo Environment
Prepopulates the SQLite database with the full 46-run benchmark matrix and executes a 60-trial seeded campaign:
```bash
python scripts/seed_demo.py --reset --budget 60 --seed 42
```

### Run Autonomous Attack Discovery Campaign (CLI)
```bash
python scripts/run_campaign.py --budget 20 --seed 42 --defense gateway
```

### (Optional) Test Real Ollama LLM Mode
If Ollama is running locally (`ollama run qwen2.5:7b`):
```bash
python scripts/try_ollama.py --model qwen2.5:7b --n-runs 2
```
If Ollama is not installed or offline, the script and the dashboard automatically fall back to deterministic scripted mode with a clear notice banner.

---

## How to Demo (4-Minute Walkthrough)

1. **Pre-seed Demo Data:**
   Run `python scripts/seed_demo.py --reset --budget 60 --seed 42` to populate telemetry.
2. **Attack Lab (`/attack-lab`):**
   Select `direct_injection_override` from the dropdown, run with **No Defense**, and show the **VIOLATED** verdict in the chronological timeline.
3. **Interactive Payload Console:**
   Type or edit a payload in the terminal console, run it, and click **Replay Trial** to show 100% deterministic replay consistency.
4. **Autonomous Campaign (`/campaign`):**
   Show the discovered bypasses in the campaign table. Point out that query mutations successfully bypass explicit wildcard filters.
5. **Defense Validation:**
   Rerun an attack with **Security Gateway** defense enabled, showing the `gateway_decision: blocked` event and resulting **HELD** verdict.
6. **Compare Page (`/compare`):**
   Review headline metrics: 87.5% attacks prevented, 0 false blocks on benign tasks, and transparently review the 2 documented residual attacks.
