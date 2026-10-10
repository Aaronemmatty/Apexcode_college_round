"""Trials, traces, and evaluations API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import EvaluationRow, EventRow, TrialRow
from app.db.session import get_db
from app.events import TraceEvent
from app.schemas import EvaluationResponse, TrialTraceResponse

router = APIRouter(prefix="/trials", tags=["trials"])


@router.get("/{trial_id}/trace", response_model=TrialTraceResponse)
def get_trial_trace(trial_id: str, db: Session = Depends(get_db)) -> TrialTraceResponse:
    """Retrieve full chronological trace events for a trial."""
    trial = db.query(TrialRow).filter(TrialRow.trial_id == trial_id).first()
    if trial is None:
        raise HTTPException(
            status_code=404,
            detail=f"Trial '{trial_id}' not found.",
        )

    event_rows = (
        db.query(EventRow)
        .filter(EventRow.trial_id == trial_id)
        .order_by(EventRow.seq)
        .all()
    )

    events: list[TraceEvent] = [
        TraceEvent.model_validate_json(r.payload) for r in event_rows
    ]

    return TrialTraceResponse(
        trial_id=trial.trial_id,
        run_id=trial.run_id,
        status=trial.status,
        events=events,
    )


@router.get("/{trial_id}/evaluation", response_model=EvaluationResponse)
def get_trial_evaluation(trial_id: str, db: Session = Depends(get_db)) -> EvaluationResponse:
    """Retrieve the evaluation result for a completed trial."""
    trial = db.query(TrialRow).filter(TrialRow.trial_id == trial_id).first()
    if trial is None:
        raise HTTPException(
            status_code=404,
            detail=f"Trial '{trial_id}' not found.",
        )

    eval_row = db.query(EvaluationRow).filter(EvaluationRow.trial_id == trial_id).first()
    if eval_row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No evaluation found for trial '{trial_id}'.",
        )

    return EvaluationResponse.model_validate_json(eval_row.result_json)
