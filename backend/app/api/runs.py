"""Runs API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import RunRow
from app.db.session import get_db
from app.orchestrator import execute_run
from app.schemas import RunCreateRequest, RunResponse, TrialSummary

router = APIRouter(prefix="/runs", tags=["runs"])


def _to_run_response(run: RunRow) -> RunResponse:
    trials_summaries = [
        TrialSummary(
            trial_id=trial.trial_id,
            status=trial.status,
            event_count=len(trial.events),
            verdict=trial.evaluation.verdict if trial.evaluation else None,
            backend=getattr(trial, "backend", "scripted"),
        )
        for trial in run.trials
    ]

    summary_str = None
    if run.trials:
        violated_n = sum(1 for t in run.trials if t.evaluation and t.evaluation.verdict == "violated")
        total_n = len(run.trials)
        if total_n > 1 or getattr(run, "backend", "scripted") == "ollama":
            summary_str = f"violated {violated_n}/{total_n}"

    return RunResponse(
        run_id=run.run_id,
        task_id=run.task_id,
        defense=run.defense,
        status=run.status,
        backend=getattr(run, "backend", "scripted"),
        summary=summary_str,
        fallback_notice=getattr(run, "fallback_notice", None),
        trials=trials_summaries,
    )


@router.post("", response_model=RunResponse, status_code=200)
def create_run(
    body: RunCreateRequest,
    db: Session = Depends(get_db),
) -> RunResponse:
    """Execute a task trial run synchronously and return the run record."""
    run_row = execute_run(
        db=db,
        task_id=body.task_id,
        defense=body.defense,
        backend=body.backend,
        backend_config=body.backend_config,
        n_runs=body.n_runs,
    )
    return _to_run_response(run_row)


@router.get("", response_model=list[RunResponse])
def list_runs(
    backend: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[RunResponse]:
    """List all executed runs, newest first."""
    query = db.query(RunRow).order_by(desc(RunRow.created_at))
    if backend:
        query = query.filter(RunRow.backend == backend)
    runs = query.all()
    return [_to_run_response(r) for r in runs]


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: str, db: Session = Depends(get_db)) -> RunResponse:
    """Retrieve details and trials for a specific run."""
    run = db.query(RunRow).filter(RunRow.run_id == run_id).first()
    if run is None:
        raise HTTPException(
            status_code=404,
            detail=f"Run '{run_id}' not found.",
        )
    return _to_run_response(run)
