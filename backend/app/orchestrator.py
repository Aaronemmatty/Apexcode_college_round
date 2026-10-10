"""Run lifecycle orchestrator for executing agent trials and persisting traces."""

from datetime import datetime, timezone
import uuid
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.agent.agent import ScriptedAgent
from app.agent.executor import DirectExecutor
from app.agent.recorder import TraceRecorder
from app.agent.tasks import get_task
from app.db.models import EventRow, RunRow, TrialRow
from app.sandbox.tools import ToolEnvironment


def execute_run(db: Session, task_id: str, defense: str = "none") -> RunRow:
    """Execute a task trial run synchronously, capturing traces into the database."""
    if defense != "none":
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported defense '{defense}'. Only defense='none' is supported "
                "in Phase 2; security gateway defenses arrive in Phase 3."
            ),
        )

    task = get_task(task_id)
    if task is None:
        raise HTTPException(
            status_code=404,
            detail=f"Task '{task_id}' not found.",
        )

    run_id = f"run_{uuid.uuid4().hex[:8]}"
    trial_id = f"trial_{uuid.uuid4().hex[:8]}"
    now_utc = datetime.now(timezone.utc)

    run_row = RunRow(
        run_id=run_id,
        task_id=task_id,
        defense=defense,
        status="running",
        created_at=now_utc,
    )
    trial_row = TrialRow(
        trial_id=trial_id,
        run_id=run_id,
        task_id=task_id,
        status="running",
        started_at=now_utc,
    )
    db.add(run_row)
    db.add(trial_row)
    db.flush()

    # Create fresh per-trial sandbox environment and recorder
    env = ToolEnvironment()
    executor = DirectExecutor(env)
    recorder = TraceRecorder(run_id=run_id, trial_id=trial_id)
    agent = ScriptedAgent(task=task, executor=executor, recorder=recorder)

    trial_status = "completed"
    trial_error = None
    try:
        agent.run()
    except Exception as exc:
        trial_status = "failed"
        trial_error = str(exc)

    # Persist all events recorded so far
    for seq, event in enumerate(recorder.events, start=1):
        event_row = EventRow(
            trial_id=trial_id,
            seq=seq,
            payload=event.model_dump_json(),
        )
        db.add(event_row)

    trial_row.status = trial_status
    trial_row.error = trial_error
    trial_row.finished_at = datetime.now(timezone.utc)

    run_row.status = "completed" if trial_status == "completed" else "failed"

    db.commit()
    db.refresh(run_row)
    return run_row