"""Runs API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import RunRow
from app.db.session import get_db
from app.orchestrator import execute_run
from app.schemas import RunCreateRequest, RunResponse, TrialSummary

router = APIRouter(prefix="/runs", tags=["runs"])


def _to_run_response(run: RunRow) -> RunResponse:
    return RunResponse(
        run_id=run.run_id,
        task_id=run.task_id,
        defense=run.defense,
        status=run.status,
        trials=[
            TrialSummary(
                trial_id=trial.trial_id,
                status=trial.status,
                event_count=len(trial.events),
                verdict=trial.evaluation.verdict if trial.evaluation else None,
            )
            for trial in run.trials
        ],
    )


@router.post("", response_model=RunResponse, status_code=200)
def create_run(
    body: RunCreateRequest,
    db: Session = Depends(get_db),
) -> RunResponse:
    """Execute a task trial run synchronously and return the run record."""
    run_row = execute_run(db=db, task_id=body.task_id, defense=body.defense)
    return _to_run_response(run_row)


@router.get("", response_model=list[RunResponse])
def list_runs(db: Session = Depends(get_db)) -> list[RunResponse]:
    """List all executed runs, newest first."""
    runs = db.query(RunRow).order_by(desc(RunRow.created_at)).all()
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
