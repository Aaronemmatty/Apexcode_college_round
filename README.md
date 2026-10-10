# AgentBreak 🛡️💥

**AgentBreak** is a reproducible security-testing harness for tool-using AI agents. It evaluates agents against prompt injection and unauthorized tool execution in a controlled, mock-tool testing environment.

> **Note:** This is a controlled mock-tool harness, not an OS-level sandbox.

---

## 📁 Project Structure

```
Apexcode_college_round/
├── backend/
│   ├── app/
│   │   ├── api/          # API route handlers (/api/health, /api/scenarios, /api/runs, /api/trials)
│   │   ├── agent/        # ScriptedAgent, ToolExecutor, TraceRecorder, Tasks
│   │   ├── sandbox/      # Mock ToolEnvironment & synthetic customer/document data
│   │   ├── gateway/      # Security gateway & policy evaluation (Phase 3)
│   │   ├── evaluator/    # Verdict evaluation & scoring (Phase 3)
│   │   ├── attacks/      # Attack payloads & generation (Phase 4)
│   │   ├── replay/       # Event trace replay engine
│   │   ├── reports/      # Benchmark reporting
│   │   ├── db/           # SQLite persistence models & sessions
│   │   ├── config.py     # Environment variable configuration
│   │   ├── events.py     # Canonical TraceEvent contract models & enums
│   │   ├── orchestrator.py# Run lifecycle orchestration
│   │   ├── schemas.py    # Pydantic schemas (Health, Scenarios, Runs, Trials)
│   │   └── main.py       # FastAPI application & error handling
│   ├── scenarios/        # Scenario JSON files (.gitkeep)
│   ├── tests/            # Pytest test suite (tools, agent, API, health)
│   ├── requirements.txt  # Pinned backend dependencies
│   └── pytest.ini        # Pytest configuration
├── frontend/
│   ├── src/
│   │   ├── api/          # Fetch client wrapper
│   │   ├── types/        # TypeScript interfaces (HealthResponse, TraceEvent)
│   │   ├── App.tsx       # Dark security status dashboard
│   │   └── index.css     # Tailwind CSS v4 entry
│   ├── .env.example      # Frontend environment variables
│   └── vite.config.ts    # Vite configuration with Tailwind v4 plugin
├── data/
│   └── cassettes/        # Mock interaction recordings (.gitkeep)
├── docs/
│   ├── architecture.md   # System architecture overview
│   ├── event-contract.md # Canonical event contract documentation & examples
│   ├── threat-model.md   # Threat model taxonomy
│   └── limitations.md    # Mock harness boundaries & limitations
├── .env.example          # Root environment template
├── .gitignore            # Git ignore rules
└── README.md             # Project documentation & startup instructions
```

---

## 🚀 Quick Start (Windows PowerShell)

### 1. Backend Setup & Run

Open a Windows PowerShell terminal in the repository root:

```powershell
# Navigate to the backend directory
cd backend

# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
# NOTE: If script activation is blocked by Windows execution policy, run:
# Set-ExecutionPolicy -Scope Process Bypass
.\.venv\Scripts\Activate.ps1

# Install backend dependencies
pip install -r requirements.txt

# Run the test suite
pytest -v

# Start the development server
uvicorn app.main:app --reload --port 8000
```

The backend API will run at `http://localhost:8000`.
- Health Check: `http://localhost:8000/api/health`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

---

### 2. Frontend Setup & Run

Open a second Windows PowerShell terminal in the repository root:

```powershell
# Navigate to the frontend directory
cd frontend

# Install Node dependencies
npm install

# Build for production (type-check + bundle)
npm run build

# Start the Vite development server
npm run dev
```

The frontend dashboard will run at `http://localhost:5173`.

---

## 🧪 Run a Task (PowerShell Examples)

When the backend server is running on `http://localhost:8000`:

### Execute an Attack Scenario (Indirect Prompt Injection)

```powershell
# Execute the indirect injection attack task
$r = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/runs `
  -ContentType "application/json" `
  -Body '{"task_id":"indirect_injection_email_leak","defense":"none"}'

# Inspect the created run and trial ID
$r | ConvertTo-Json

# Fetch the chronological event trace for the trial
$trialId = $r.trials[0].trial_id
$trace = Invoke-RestMethod -Uri "http://localhost:8000/api/trials/$trialId/trace"
$trace.events | Format-Table -Property step, type, tool, source, execution_status
```

### Execute a Benign Task

```powershell
# Execute the benign email task
$r = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/runs `
  -ContentType "application/json" `
  -Body '{"task_id":"benign_valid_email","defense":"none"}'

# Fetch and inspect the trace
$trialId = $r.trials[0].trial_id
$trace = Invoke-RestMethod -Uri "http://localhost:8000/api/trials/$trialId/trace"
$trace.events | Format-Table -Property step, type, tool, source, execution_status
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` as needed:

| Variable | Default | Purpose |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed CORS origins (comma-separated) |
| `APP_NAME` | `AgentBreak` | Application name returned by health check |
| `DATABASE_URL` | `sqlite:///./agentbreak.db` | SQLite database connection string |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API base URL for frontend |