# AgentBreak

**AgentBreak** is a reproducible security-testing harness for tool-using AI agents. It evaluates agents against prompt injection and unauthorized tool execution in a controlled, mock-tool testing environment with a security gateway, independent evaluation engine, and defense comparison analytics (7 of 8 attacks prevented, 1 documented residual).

> **Note:** Controlled mock-tool harness, deterministic scripted agent. Not an OS-level sandbox, not a measure of real LLM behavior.

---

## Pre-Demo Checklist

Before presenting or running a live demonstration, ensure each item is verified:

- [ ] **Backend up:** FastAPI server listening on `http://localhost:8000` (`GET /api/health` returns status `ok`).
- [ ] **Frontend up:** Vite development server running on `http://localhost:5173` (sidebar shows green `Backend connected` indicator).
- [ ] **DB state prepared:** Either fresh database reset or pre-populated via **Run Full Matrix** (24 total trials recorded).
- [ ] **Replay check verified:** Click **Add replay check** on `/compare` to verify 24 / 24 trials replay consistently.
- [ ] **Report export working:** Download buttons for **JSON** and **Markdown** successfully trigger file downloads.
- [ ] **Browser zoom:** Browser zoom level set to 100% for optimal layout and table rendering.

---

## Project Structure

```
Apexcode_college_round/
├── backend/
│   ├── app/
│   │   ├── api/          # API route handlers (/api/health, /api/scenarios, /api/runs, /api/trials, /api/compare, /api/report)
│   │   ├── agent/        # ScriptedAgent, ToolExecutor, TraceRecorder, Tasks
│   │   ├── sandbox/      # Mock ToolEnvironment & synthetic customer/document data
│   │   ├── gateway/      # Security gateway & policy evaluation
│   │   ├── evaluator/    # Independent verdict evaluation & scoring
│   │   ├── reports/      # Phase 6 metrics and comparison engine
│   │   ├── db/           # SQLite persistence models & sessions
│   │   ├── config.py     # Environment variable configuration
│   │   ├── events.py     # Canonical TraceEvent contract models & enums
│   │   ├── orchestrator.py# Run lifecycle orchestration
│   │   ├── schemas.py    # Pydantic schemas (Health, Scenarios, Runs, Trials, Evaluations, Replays)
│   │   └── main.py       # FastAPI application & error handling
│   ├── scenarios/        # 12 Deterministic test scenarios
│   ├── scripts/          # Benchmark runner scripts (run_matrix.py)
│   ├── tests/            # Pytest test suite (tools, agent, API, gateway, evaluator, metrics)
│   ├── requirements.txt  # Pinned backend dependencies
│   └── pytest.ini        # Pytest configuration
├── frontend/
│   ├── src/
│   │   ├── api/          # Frontend API client and report download helpers
│   │   ├── pages/        # Overview, Scenarios, TrialViewer, Compare
│   │   ├── components/   # UI components and RunMatrixLauncher
│   │   └── types/        # TypeScript interfaces (events, evaluation, api)
│   ├── package.json
│   └── vite.config.ts    # Vite configuration
├── docs/
│   ├── architecture.md   # System architecture overview
│   ├── demo-script.md    # 4-minute guided demonstration script
│   ├── event-contract.md # Canonical event contract documentation & examples
│   ├── gateway.md        # Security gateway rules and redaction
│   ├── evaluator.md      # Evaluator invariants and verdict logic
│   ├── metrics.md        # Phase 6 metrics engine and comparison formulas
│   ├── frontend.md       # Frontend UI architecture and page routes
│   ├── threat-model.md   # Threat model taxonomy
│   ├── limitations.md    # Mock harness boundaries & limitations
│   └── api-samples/      # Sample API JSON responses (including compare.json)
└── README.md             # Project documentation & startup instructions
```

---

## Quick Start

### Option A: Windows (PowerShell)

#### 1. Backend Setup & Run
In a PowerShell terminal:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pytest -v
python scripts\run_matrix.py
python -m uvicorn app.main:app --port 8000
```

The backend API will run at `http://localhost:8000`.

#### 2. Frontend Setup & Run
In a second PowerShell terminal:

```powershell
cd frontend
npm install
$env:VITE_API_BASE_URL="http://localhost:8000"
npm run dev
```

The frontend dashboard will run at `http://localhost:5173`.

---

### Option B: macOS / Linux (zsh or bash)

#### 1. Backend Setup & Run
In a terminal:

```zsh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -v
python scripts/run_matrix.py
uvicorn app.main:app --port 8000
```

The backend API will run at `http://localhost:8000`.

#### 2. Frontend Setup & Run
In a second terminal:

```zsh
cd frontend
npm install
export VITE_API_BASE_URL="http://localhost:8000"
npm run dev
```

The frontend dashboard will run at `http://localhost:5173`.

---

### Production Build Check (Optional)

To verify the production frontend bundle and type checking:

```bash
cd frontend
npm run build
npx tsc --noEmit -p .
```

---

## How to Reset the Demo

To clear all recorded runs, trials, evaluations, and replays and return to a clean baseline:

1. Stop the backend server process (`Ctrl+C`).
2. Delete the SQLite database file:
   - **PowerShell:** `Remove-Item backend\agentbreak.db -ErrorAction SilentlyContinue`
   - **macOS / Linux:** `rm -f backend/agentbreak.db`
3. Restart the backend server (`uvicorn app.main:app --port 8000`).
4. On startup, the application recreates empty database tables automatically.

---

## Demo Flow Summary

See [docs/demo-script.md](docs/demo-script.md) for the complete 4-minute click path:

1. **The Problem:** Prompt injection and untrusted content trick tool-using agents into executing unvalidated tool calls or exfiltrating private data.
2. **Baseline Attack (No Defense):** Run an injection attack (`canary_in_authorized_email`) with `No defense`. Inspect the trace timeline showing the unauthorized email dispatch and highlighted synthetic canary leak (**VIOLATED**).
3. **Attack Blocked (Gateway):** Run the same scenario with `Gateway` defense. Observe the `gateway_decision: blocked` event, the aborted tool execution, and the independent evaluator scoring (**HELD**).
4. **Benign Workflow Preservation:** Run a benign scenario (`benign_customer_lookup`) with `Gateway`. Confirm normal tool execution, customer note redaction, `0` false blocks, and target task completion (**HELD**).
5. **Matrix Comparison & Export:** On `/compare`, click **Run Full Matrix** to execute all 12 scenarios x 2 defenses. Run **Add replay check** (24/24 consistent), and click **Markdown** to export `agentbreak-report.md`.
6. **Honest Limitations:** Note that **7 of 8 attacks are prevented with 1 documented residual miss** (`excessive_access_broad_query` bypasses syntactic pattern rules).

---

## Phase 6 Comparison & Report Endpoints

When the backend server is running on `http://localhost:8000`:

### Compare Defenses (Read-Only)
```bash
curl -s http://localhost:8000/api/compare
```

### Run Full Matrix Replay Check
```bash
curl -s -X POST http://localhost:8000/api/replays/run-all
```

### Export Evaluation Reports
```bash
# JSON Report
curl -s "http://localhost:8000/api/report?format=json"

# Markdown Report
curl -s "http://localhost:8000/api/report?format=md"
```
