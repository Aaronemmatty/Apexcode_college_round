# AgentBreak

**AgentBreak** is a reproducible security-testing harness for tool-using AI agents. It evaluates agents against prompt injection and unauthorized tool execution in a controlled, mock-tool testing environment with a security gateway and independent evaluation engine.

> **Note:** This is a controlled mock-tool harness, not an OS-level sandbox.

---

## Project Structure

```
Apexcode_college_round/
├── backend/
│   ├── app/
│   │   ├── api/          # API route handlers (/api/health, /api/scenarios, /api/runs, /api/trials)
│   │   ├── agent/        # ScriptedAgent, ToolExecutor, TraceRecorder, Tasks
│   │   ├── sandbox/      # Mock ToolEnvironment & synthetic customer/document data
│   │   ├── gateway/      # Security gateway & policy evaluation (Phase 3)
│   │   ├── evaluator/    # Independent verdict evaluation & scoring (Phase 3)
│   │   ├── db/           # SQLite persistence models & sessions
│   │   ├── config.py     # Environment variable configuration
│   │   ├── events.py     # Canonical TraceEvent contract models & enums
│   │   ├── orchestrator.py# Run lifecycle orchestration
│   │   ├── schemas.py    # Pydantic schemas (Health, Scenarios, Runs, Trials, Evaluations)
│   │   └── main.py       # FastAPI application & error handling
│   ├── tests/            # Pytest test suite (tools, agent, API, gateway, evaluator, pipeline)
│   ├── requirements.txt  # Pinned backend dependencies
│   └── pytest.ini        # Pytest configuration
├── frontend/
│   ├── src/
│   │   ├── types/        # TypeScript interfaces (events, evaluation, runs)
│   │   ├── App.tsx       # Dark security status dashboard
│   └── vite.config.ts    # Vite configuration
├── docs/
│   ├── architecture.md   # System architecture overview
│   ├── event-contract.md # Canonical event contract documentation & examples
│   ├── gateway.md        # Security gateway rules and redaction
│   ├── evaluator.md      # Evaluator invariants and verdict logic
│   ├── threat-model.md   # Threat model taxonomy
│   └── limitations.md    # Mock harness boundaries & limitations
└── README.md             # Project documentation & startup instructions
```

---

## Quick Start (macOS / zsh)

### 1. Backend Setup & Run

Open a terminal in the repository root:

```zsh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -v
uvicorn app.main:app --reload --port 8000
```

The backend API will run at `http://localhost:8000`.
- Health Check: `http://localhost:8000/api/health`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

---

### 2. Frontend Setup & Run

Open a second terminal in the repository root:

```zsh
cd frontend
npm install
npm run build
# Set the backend URL explicitly if running on a different port/host
export VITE_API_BASE_URL="http://localhost:8000"
npm run dev
```

The frontend dashboard will run at `http://localhost:5173`.

---

## 12 Security Scenarios & Deterministic Benchmark

AgentBreak comes loaded with 12 deterministic JSON-based test scenarios located in `backend/scenarios/`. These include a mix of benign workflows and sophisticated indirect/direct prompt injections (e.g., `excessive_access_broad_query`, `canary_in_authorized_email`, `multi_step_injection`).

**How to add a scenario:**
Simply drop a new JSON file following the `ScenarioDef` schema (see `app/attacks/models.py`) into the `backend/scenarios/` directory. The application will automatically discover and load it. Be sure to specify `max_customer_records` explicitly.

**How to run the full matrix:**
Run the `run_matrix.py` script to simulate every scenario across all defenses (`none`, `gateway`) and verify expected outcomes:
```bash
cd backend
.venv/bin/python scripts/run_matrix.py
```

---

## Run a Task (PowerShell Examples)

When the backend server is running on `http://localhost:8000`:

### Execute an Attack Scenario with Gateway Defense

```powershell
# Run the indirect injection attack scenario protected by the security gateway
$r = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/runs `
  -ContentType "application/json" `
  -Body '{"task_id":"indirect_injection_email_leak","defense":"gateway"}'

$trialId = $r.trials[0].trial_id

# Fetch the independent security evaluation
$eval = Invoke-RestMethod -Uri "http://localhost:8000/api/trials/$trialId/evaluation"
$eval | ConvertTo-Json -Depth 4

# Fetch the chronological event trace for the trial
$trace = Invoke-RestMethod -Uri "http://localhost:8000/api/trials/$trialId/trace"
$trace.events | Format-Table -Property step, type, tool, decision, rule_id, execution_status
```

### Execute a Baseline Attack (No Defense)

```powershell
# Run the attack without defense to observe compromise
$r = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/runs `
  -ContentType "application/json" `
  -Body '{"task_id":"indirect_injection_email_leak","defense":"none"}'

$trialId = $r.trials[0].trial_id
$eval = Invoke-RestMethod -Uri "http://localhost:8000/api/trials/$trialId/evaluation"
$eval | ConvertTo-Json -Depth 4
```
