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

## Quick Start (Windows PowerShell)

### 1. Backend Setup & Run

Open a Windows PowerShell terminal in the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -v
uvicorn app.main:app --reload --port 8000
```

The backend API will run at `http://localhost:8000`.
- Health Check: `http://localhost:8000/api/health`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

---

### 2. Frontend Setup & Run

Open a second Windows PowerShell terminal in the repository root:

```powershell
cd frontend
npm install
npm run build
npm run dev
```

The frontend dashboard will run at `http://localhost:5173`.

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
