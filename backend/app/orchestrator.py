"""Run lifecycle orchestrator for executing agent trials and persisting traces."""

from datetime import datetime, timezone
import json
import uuid
from typing import Any
from pydantic import BaseModel
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.agent.agent import ScriptedAgent
from app.agent.executor import DirectExecutor
from app.agent.recorder import TraceRecorder
from app.agent.tasks import get_task, TaskSpec
from app.db.models import EvaluationRow, EventRow, RunRow, TrialEnvStateRow, TrialRow
from app.evaluator.evaluator import evaluate_trial
from app.evaluator.models import Evaluation, Verdict
from app.gateway.executor import GatewayExecutor
from app.gateway.gateway import SecurityGateway
from app.gateway.policy import GatewayPolicy
from app.sandbox.tools import ToolEnvironment
from app.events import TraceEvent

SUPPORTED_DEFENSES = {"none", "hardening", "prompt_hardening", "gateway"}

class SimulatedTrial(BaseModel):
    events: list[TraceEvent]
    env_state: dict[str, Any]
    status: str
    error: str | None
    evaluation: Evaluation

def simulate_trial(task: TaskSpec, defense: str, run_id: str, trial_id: str) -> SimulatedTrial:
    env = ToolEnvironment(documents_overlay=task.documents)
    direct = DirectExecutor(env)
    recorder = TraceRecorder(run_id=run_id, trial_id=trial_id)

    defense_mode = "hardening" if defense in ("hardening", "prompt_hardening") else defense

    if defense_mode == "gateway":
        policy = GatewayPolicy.from_task(task)
        gateway = SecurityGateway(policy)
        executor = GatewayExecutor(inner=direct, gateway=gateway, recorder=recorder)
        agent = ScriptedAgent(task=task, executor=executor, recorder=recorder)
    elif defense_mode == "hardening":
        executor = direct
        agent = ScriptedAgent(
            task=task,
            executor=executor,
            recorder=recorder,
            follow_embedded_instructions=False,
            filter_prompt_injection=True,
        )
    else:
        executor = direct
        agent = ScriptedAgent(task=task, executor=executor, recorder=recorder)

    trial_status = "completed"
    trial_error = None
    try:
        agent.run()
    except Exception as exc:
        trial_status = "failed"
        trial_error = str(exc)

    env_state = {"outbox": [dict(m) for m in env.outbox]}

    try:
        evaluation = evaluate_trial(
            trial_id=trial_id,
            trial_status=trial_status,
            task=task,
            events=recorder.events,
            env_state=env_state,
        )
    except Exception as eval_exc:
        evaluation = Evaluation(
            trial_id=trial_id,
            verdict=Verdict.INCONCLUSIVE,
            invariants=[],
            task_completed=False,
            false_blocks=0,
            notes=[f"Evaluator error: {str(eval_exc)}"],
        )

    return SimulatedTrial(
        events=recorder.events,
        env_state=env_state,
        status=trial_status,
        error=trial_error,
        evaluation=evaluation
    )

def execute_run(db: Session, task_id: str, defense: str = "none") -> RunRow:
    """Execute a task trial run synchronously, capturing traces and evaluation."""
    if defense not in SUPPORTED_DEFENSES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported defense '{defense}'. Supported defense values are: "
                f"{sorted(SUPPORTED_DEFENSES)}."
            ),
        )

    if defense == "prompt_hardening":
        defense = "hardening" 

    task = get_task(task_id, db=db)
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

    simulated = simulate_trial(task, defense, run_id, trial_id)

    # Persist all recorded events
    for seq, event in enumerate(simulated.events, start=1):
        event_row = EventRow(
            trial_id=trial_id,
            seq=seq,
            payload=event.model_dump_json(),
        )
        db.add(event_row)

    env_state_row = TrialEnvStateRow(
        trial_id=trial_id,
        state_json=json.dumps(simulated.env_state),
    )
    db.add(env_state_row)

    eval_row = EvaluationRow(
        trial_id=trial_id,
        verdict=simulated.evaluation.verdict.value,
        result_json=simulated.evaluation.model_dump_json(),
    )
    db.add(eval_row)

    trial_row.status = simulated.status
    trial_row.error = simulated.error
    trial_row.finished_at = datetime.now(timezone.utc)

    run_row.status = "completed" if simulated.status == "completed" else "failed"

    db.commit()
    db.refresh(run_row)
    return run_row
