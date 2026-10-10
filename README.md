# AgentBreak

**AgentBreak** is a reproducible security-testing harness for tool-using AI agents. It evaluates agents against prompt injection and unauthorized tool execution in a controlled, mock-tool testing environment with a security gateway, independent evaluation engine, and defense comparison analytics (7 of 8 attacks prevented, 1 documented residual).

> **Note:** This is a controlled mock-tool harness, deterministic scripted agent. Not an OS-level sandbox, not a measure of real LLM behavior.

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
- Compare Metrics: `http://localhost:8000/api/compare`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

---

### 2. Frontend Setup & Run

Open a second terminal in the repository root:

```zsh
cd frontend
npm install
npm run build
export VITE_API_BASE_URL="http://localhost:8000"
npm run dev
```

The frontend dashboard will run at `http://localhost:5173`.
- Overview: `http://localhost:5173/`
- Compare Defenses: `http://localhost:5173/compare`
- Scenarios: `http://localhost:5173/scenarios`

---

## 12 Security Scenarios & Deterministic Benchmark

AgentBreak comes loaded with 12 deterministic JSON-based test scenarios in `backend/scenarios/`. These include a mix of benign workflows and direct/indirect prompt injections (`canary_in_authorized_email`, `excessive_access_broad_query`, `multi_step_injection`, etc.).

**How to run the full matrix:**
```bash
cd backend
.venv/bin/python scripts/run_matrix.py
```

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
