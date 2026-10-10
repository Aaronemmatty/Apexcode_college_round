# AgentBreak: AI Agent Security Testing & Defense Evaluation Harness

**AgentBreak** is a reproducible security-testing harness for tool-using AI agents. It evaluates agents against prompt injection, instruction override, memory poisoning, excessive permissions, and data leakage in a controlled in-process sandbox with multi-defense validation (None vs Prompt Hardening vs Security Gateway), an independent deterministic evaluator, autonomous attack discovery mutator, interactive attack lab, and live regression diff comparison.

> **Scope & Honesty Disclaimer:** Controlled mock-tool harness, deterministic scripted agent. Discovery is a budgeted heuristic search over a bounded mutation space (not general arbitrary hacking). Results are small-sample benchmark evaluations, not a measure of unconstrained stochastic LLM behavior.

---

## Benchmark Results At A Glance

Across the full benchmark matrix (**27 scenarios**: 20 attacks, 7 benign across 5 threat categories):

| Threat Category | No Defense (Violated) | Prompt Hardening (Violated) | Gateway Defense (Violated) | Status |
|---|---|---|---|---|
| **Direct Injection & Override** (5 attacks) | 5 / 5 (100.0%) | 0 / 5 (0.0%) | 0 / 5 (0.0%) | 100% Prevented |
| **Multi-Step & Memory Poisoning** (5 attacks) | 5 / 5 (100.0%) | 0 / 5 (0.0%) | 0 / 5 (0.0%) | 100% Prevented |
| **Indirect Document Injection** (3 attacks) | 3 / 3 (100.0%) | 0 / 3 (0.0%) | 0 / 3 (0.0%) | 100% Prevented |
| **Excessive Permissions** (3 attacks) | 3 / 3 (100.0%) | 0 / 3 (0.0%) | 0 / 3 (0.0%) | 100% Prevented |
| **Data Leakage** (4 attacks) | 4 / 4 (100.0%) | 0 / 4 (0.0%) | 1 / 4 (25.0%) | 3 Prevented, **1 Documented Residual** (`excessive_access_broad_query`) |
| **Total Attacks** (20 attacks) | **20 / 20 (100.0%)** | **0 / 20 (0.0%)** | **1 / 20 (5.0%)** | **19 of 20 attacks prevented (95.0%)** |
| **Benign Workflows** (7 benign) | 7 / 7 Held (100.0%) | 7 / 7 Held (100.0%) | 7 / 7 Held (100.0%) | **100% task completion, 0 false blocks** |
| **Deterministic Replay** | 54 / 54 trials | 54 / 54 consistent | 54 / 54 consistent | **100.0% reproducible** |

---

## Problem Statement Checklist & Extra Gaps Addressed

| # | Requirement | Implementation Status | Implementation Details |
|---|---|:---:|---|
| 1 | **Autonomous Attack Discovery** | ✅ **Met** | [`mutator.py`](backend/app/attacks/mutator.py) executes budgeted search campaigns with 7 mutation operators (rephrase, delimiters, authority, obfuscation, split payload, swap recipient/tool, move payload), guided by gateway feedback to discover bypasses. Visualized on `/campaign`. |
| 2 | **Multi-Stage Attack Analysis** | ✅ **Met** | Chronological event timeline recording tool requests, gateway decisions, tool results, and detections with step-by-step provenance (`user_task`, `untrusted_document`, `user_prompt_injection`). Visualized on `/trials/:id`. |
| 3 | **Tool & Permission Auditing** | ✅ **Met** | [`gateway.py`](backend/app/gateway/gateway.py) and [`rules.py`](backend/app/gateway/rules.py) enforce tool allowlists, recipient normalization, query syntax guards, and outbound canary detection. |
| 4 | **Reproducible Attack Traces** | ✅ **Met** | SQLite persistence (`runs`, `trials`, `events`, `evaluations`, `replays`). Deterministic re-simulation verified consistent. |
| 5 | **Defense Validation** | ✅ **Met** | Direct side-by-side comparison of baseline `none` vs `hardening` vs `gateway` across all scenarios, tracking prevented attacks and residuals. |
| 6 | **Security Evaluation Dashboard** | ✅ **Met** | React dashboard with Severity badges (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), category exploit charts, trace viewers with violation evidence callouts, and `/compare` matrix. |
| 7 | **Regression Testing & Diff** | ✅ **Met** | Regression Diff comparison on `/compare` allowing "Rerun All" comparing any two defense versions and labeling each scenario `fixed`, `still_violated`, `newly_violated`, or `held`. |
| A | **Memory Poisoning & Override Attacks** | ✅ **Met** | Added memory poisoning attacks (`memory_poison_customer_note`, `memory_poison_intermediate_summary`) and instruction-override/leak attacks (`direct_injection_system_override_leak`, `direct_injection_canary_jailbreak`). |
| B | **Regression Diff** | ✅ **Met** | `POST /api/compare/regression-diff` endpoint and dedicated interactive workbench on the Compare page. |
| C | **Prompt Hardening Defense** | ✅ **Met** | Agent-side `hardening` defense alongside perimeter `gateway`. Compares `none` vs `hardening` vs `gateway` on the same scenarios. |
| D | **Campaign Bypass Regression Persistence** | ✅ **Met** | Every bypass found by a campaign is saved as a persistent regression scenario (`backend/scenarios/regressions/`) and rerun automatically against `none`, `hardening`, and `gateway`. |

---

## Setup & Running Locally

### Prerequisites
- Python 3.10+ (tested on Python 3.12/3.14)
- Node.js 18+ and npm

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run all 141 tests:
pytest -v

# Run the benchmark matrix:
python scripts/run_matrix.py

# Start the API server:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd ../frontend
npm install
npm run build
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## How to Demo

1. **Dashboard Overview (`/`)**:
   - Inspect headline metrics across all 27 scenarios (20 attacks, 7 benign).
   - View 3-way defense comparison chart (No Defense vs Hardening vs Gateway).
2. **Compare Page & Regression Diff (`/compare`)**:
   - Inspect side-by-side verdicts across `None`, `Prompt Hardening`, and `Security Gateway`.
   - Use the **Defense Regression Diff** panel to select Defense Version A vs B and click **"Rerun All & Compare"**.
   - See summary counts and badges for **Fixed**, **Still Violated**, **Newly Violated**, and **Held**.
3. **Autonomous Attack Discovery (`/campaign`)**:
   - Launch a campaign with budget and seed.
   - Inspect discovered bypasses: see the saved regression scenario file and live multi-defense regression status (`None: VIOLATED`, `Hardening: HELD`, `Gateway: VIOLATED`).
4. **Attack Lab Workbench (`/attack-lab`)**:
   - Interactive payload crafting, test against None, Prompt Hardening, or Gateway with live event traces.
