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

    from app.evaluator.severity import derive_severity
    import json
    base = EvaluationResponse.model_validate_json(eval_row.result_json)
    violated_ids = [inv.invariant_id for inv in base.invariants if inv.status == "violated"]
    base.severity = derive_severity(violated_ids)
    return base

import uuid
import json
from app.db.models import ReplayRow
from app.schemas import ReplayResponse, ReplayReport
from app.orchestrator import simulate_trial
from app.agent.tasks import get_task

@router.post("/{trial_id}/replay", response_model=ReplayResponse)
def create_replay(trial_id: str, db: Session = Depends(get_db)) -> ReplayResponse:
    trial = db.query(TrialRow).filter(TrialRow.trial_id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found.")
        
    run = trial.run
    task = get_task(trial.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    eval_row = db.query(EvaluationRow).filter(EvaluationRow.trial_id == trial_id).first()
    original_verdict = eval_row.verdict if eval_row else "unknown"

    event_rows = db.query(EventRow).filter(EventRow.trial_id == trial_id).order_by(EventRow.seq).all()
    original_events = [TraceEvent.model_validate_json(r.payload) for r in event_rows]

    simulated = simulate_trial(task, run.defense, run.run_id, trial.trial_id)
    replay_events = simulated.events
    
    differences = []
    
    def strip_varying(e: TraceEvent) -> dict:
        d = e.model_dump(exclude_none=True)
        for k in ["event_id", "run_id", "trial_id", "timestamp"]:
            d.pop(k, None)
        if "result" in d and isinstance(d["result"], dict) and "message_id" in d["result"]:
            d["result"].pop("message_id")
        return d
        
    for i, (orig, repl) in enumerate(zip(original_events, replay_events)):
        orig_d = strip_varying(orig)
        repl_d = strip_varying(repl)
        if orig_d != repl_d:
            differences.append(f"Step {orig.step}: mismatch between original and replay")

    if len(original_events) != len(replay_events):
        differences.append(f"Length mismatch: original {len(original_events)}, replay {len(replay_events)}")

    consistent = len(differences) == 0 and original_verdict == simulated.evaluation.verdict.value

    report = ReplayReport(
        differences=differences,
        original_event_count=len(original_events),
        replay_event_count=len(replay_events),
        original_verdict=original_verdict,
        replay_verdict=simulated.evaluation.verdict.value
    )

    replay_id = f"replay_{uuid.uuid4().hex[:8]}"
    replay_row = ReplayRow(
        replay_id=replay_id,
        original_trial_id=trial.trial_id,
        consistent=consistent,
        report=report.model_dump_json()
    )
    db.add(replay_row)
    db.commit()
    db.refresh(replay_row)

    return ReplayResponse(
        replay_id=replay_row.replay_id,
        original_trial_id=replay_row.original_trial_id,
        consistent=replay_row.consistent,
        report=report,
        created_at=replay_row.created_at.isoformat()
    )

@router.get("/{trial_id}/replays", response_model=list[ReplayResponse])
def get_replays(trial_id: str, db: Session = Depends(get_db)) -> list[ReplayResponse]:
    trial = db.query(TrialRow).filter(TrialRow.trial_id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found.")

    replays = db.query(ReplayRow).filter(ReplayRow.original_trial_id == trial_id).order_by(ReplayRow.created_at.desc()).all()
    
    return [
        ReplayResponse(
            replay_id=r.replay_id,
            original_trial_id=r.original_trial_id,
            consistent=r.consistent,
            report=ReplayReport.model_validate_json(r.report),
            created_at=r.created_at.isoformat()
        )
        for r in replays
    ]
