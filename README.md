# AgentBreak 🛡️💥

**AgentBreak** is a reproducible security-testing harness for tool-using AI agents. It evaluates agents against prompt injection and unauthorized tool execution in a controlled, mock-tool testing environment.

> **Note:** This is a controlled mock-tool harness, not an OS-level sandbox.

---

## 📁 Project Structure

```
Apexcode_college_round/
├── backend/
│   ├── app/
│   │   ├── api/          # API route handlers (e.g. /api/health)
│   │   ├── agent/        # Agent harness abstractions
│   │   ├── sandbox/      # Mock tool definitions & execution sandbox
│   │   ├── gateway/      # Security gateway & policy evaluation
│   │   ├── evaluator/    # Verdict evaluation & scoring
│   │   ├── attacks/      # Attack payloads & generation
│   │   ├── replay/       # Event trace replay engine
│   │   ├── reports/      # Benchmark reporting
│   │   ├── db/           # SQLite persistence models & sessions
│   │   ├── config.py     # Environment variable configuration
│   │   ├── schemas.py    # Pydantic schemas (HealthResponse, ErrorResponse)
│   │   └── main.py       # FastAPI application & error handling
│   ├── scenarios/        # Scenario JSON files (.gitkeep)
│   ├── tests/            # Pytest test suite (test_health.py)
│   ├── requirements.txt  # Pinned backend dependencies
│   └── pytest.ini        # Pytest configuration
├── frontend/
│   ├── src/
│   │   ├── api/          # Fetch client wrapper
│   │   ├── types/        # TypeScript interfaces (HealthResponse)
│   │   ├── App.tsx       # Dark security status dashboard
│   │   └── index.css     # Tailwind CSS v4 entry
│   ├── .env.example      # Frontend environment variables
│   └── vite.config.ts    # Vite configuration with Tailwind v4 plugin
├── data/
│   └── cassettes/        # Mock interaction recordings (.gitkeep)
├── docs/
│   ├── architecture.md   # System architecture overview
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

The backend API will be running at `http://localhost:8000`.
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

The frontend dashboard will be running at `http://localhost:5173`.
It connects to `http://localhost:8000/api/health` and displays the real-time connectivity status.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` as needed:

| Variable | Default | Purpose |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed CORS origins (comma-separated) |
| `APP_NAME` | `AgentBreak` | Application name returned by health check |
| `DATABASE_URL` | `sqlite:///./agentbreak.db` | SQLite database connection string |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API base URL for frontend |