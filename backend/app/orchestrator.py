"""Run lifecycle orchestrator for executing agent trials and persisting traces."""

from datetime import datetime, timezone
import json
import logging
import uuid
from typing import Any, Optional
from pydantic import BaseModel, Field
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.agent.agent import ScriptedAgent
from app.agent.ollama import OllamaAgent, check_ollama_available
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

logger = logging.getLogger(__name__)

SUPPORTED_DEFENSES = {"none", "hardening", "prompt_hardening", "gateway", "both"}
SUPPORTED_BACKENDS = {"scripted", "ollama", "http_agent", "external", "http"}


class SimulatedTrial(BaseModel):
    events: list[TraceEvent]
    env_state: dict[str, Any]
    status: str
    error: str | None
    evaluation: Evaluation
    model_replies: list[dict[str, Any]] = Field(default_factory=list)


def simulate_trial(
    task: TaskSpec,
    defense: str,
    run_id: str,
    trial_id: str,
    backend: str = "scripted",
    backend_config: Optional[dict[str, Any]] = None,
    saved_replies: Optional[list[dict[str, Any]]] = None,
) -> SimulatedTrial:
    env = ToolEnvironment(documents_overlay=task.documents)
    direct = DirectExecutor(env)
    recorder = TraceRecorder(run_id=run_id, trial_id=trial_id)

    is_hardening = defense in ("hardening", "prompt_hardening", "both")
    is_gateway = defense in ("gateway", "both")

    if is_gateway:
        policy = GatewayPolicy.from_task(task)
        gateway = SecurityGateway(policy)
        executor = GatewayExecutor(inner=direct, gateway=gateway, recorder=recorder)
    else:
        executor = direct

    # Instantiate chosen agent backend
    if backend == "ollama":
        cfg = backend_config or {}
        agent = OllamaAgent(
            task=task,
            executor=executor,
            recorder=recorder,
            url=cfg.get("url", "http://localhost:11434"),
            model=cfg.get("model", "qwen2.5:7b"),
            temperature=cfg.get("temperature", 0.0),
            seed=cfg.get("seed", 42),
            timeout=cfg.get("timeout", 60.0),
            max_steps=cfg.get("max_steps", 10),
            saved_replies=saved_replies,
            prompt_hardening=is_hardening,
        )
    elif backend in ("http_agent", "http", "external", "connector"):
        from app.agent.adapter import HttpAgentAdapter
        cfg = backend_config or {}
        http_adapter = HttpAgentAdapter(
            endpoint_url=cfg.get("url", "http://localhost:9000/agent"),
            timeout=cfg.get("timeout", 10.0),
            saved_replies=saved_replies,
        )
        http_adapter.run(task=task, executor=executor, recorder=recorder, defense=defense)
        if getattr(http_adapter, "inconclusive", False):
            trial_status = "inconclusive"
            trial_error = getattr(http_adapter, "inconclusive_reason", "External agent communication error")
        elif getattr(http_adapter, "error", None):
            trial_status = "failed"
            trial_error = http_adapter.error
        else:
            trial_status = "completed"
            trial_error = None
        agent = None  # HttpAgentAdapter handles its own run loop
    else:
        agent = ScriptedAgent(
            task=task,
            executor=executor,
            recorder=recorder,
            prompt_hardening=is_hardening,
        )

    if agent is not None:
        trial_status = "completed"
        trial_error = None
        try:
            agent.run()
            if backend == "ollama" and getattr(agent, "inconclusive", False):
                trial_status = "inconclusive"
                trial_error = getattr(agent, "inconclusive_reason", "Inconclusive Ollama response")
        except Exception as exc:
            trial_status = "failed"
            trial_error = str(exc)


    env_state = {"outbox": [dict(m) for m in env.outbox]}

    try:
        if trial_status == "inconclusive":
            evaluation = Evaluation(
                trial_id=trial_id,
                verdict=Verdict.INCONCLUSIVE,
                invariants=[],
                task_completed=False,
                false_blocks=0,
                notes=[trial_error or "Inconclusive Ollama trial (timeout or parse error)."],
            )
        else:
            evaluation = evaluate_trial(
                trial_id=trial_id,
                trial_status=trial_status,
                task=task,
                events=recorder.events,
                env_state=env_state,
            )
            if backend == "ollama" and getattr(agent, "inconclusive", False):
                evaluation.verdict = Verdict.INCONCLUSIVE
            elif backend in ("http_agent", "http", "external", "connector") and getattr(http_adapter, "inconclusive", False):
                evaluation.verdict = Verdict.INCONCLUSIVE
    except Exception as eval_exc:
        evaluation = Evaluation(
            trial_id=trial_id,
            verdict=Verdict.INCONCLUSIVE,
            invariants=[],
            task_completed=False,
            false_blocks=0,
            notes=[f"Evaluator error: {str(eval_exc)}"],
        )

    model_replies: list[dict[str, Any]] = []
    if backend == "ollama":
        if getattr(agent, "is_replay", False):
            model_replies = getattr(agent, "saved_replies", [])
        else:
            model_replies = getattr(agent, "recorded_replies", [])
    elif backend in ("http_agent", "http", "external", "connector"):
        model_replies = getattr(http_adapter, "saved_replies", [])

    return SimulatedTrial(
        events=recorder.events,
        env_state=env_state,
        status=trial_status,
        error=trial_error,
        evaluation=evaluation,
        model_replies=model_replies,
    )


def execute_run(
    db: Session,
    task_id: str,
    defense: str = "none",
    backend: str = "scripted",
    backend_config: Optional[dict[str, Any]] = None,
    n_runs: Optional[int] = None,
) -> RunRow:
    """Execute a task trial run synchronously, capturing traces and evaluation."""
    if defense not in SUPPORTED_DEFENSES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported defense '{defense}'. Supported defense values are: "
                f"{sorted(SUPPORTED_DEFENSES)}."
            ),
        )

    if backend not in SUPPORTED_BACKENDS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported backend '{backend}'. Supported backends are: {sorted(SUPPORTED_BACKENDS)}.",
        )

    if defense == "hardening":
        defense = "prompt_hardening"

    task = get_task(task_id, db=db)
    if task is None:
        raise HTTPException(
            status_code=404,
            detail=f"Task '{task_id}' not found.",
        )

    # Check Ollama availability if requested; fallback clearly to scripted if unavailable
    effective_backend = backend
    fallback_notice = None
    if backend == "ollama":
        cfg = backend_config or {}
        url = cfg.get("url", "http://localhost:11434")
        model = cfg.get("model", "qwen2.5:7b")
        available, err_msg = check_ollama_available(url=url, model=model)
        if not available:
            effective_backend = "scripted"
            fallback_notice = f"Ollama is unavailable ({err_msg}). Fell back to scripted mode."
            logger.warning(fallback_notice)

    # Multi-run count for live models (default 3, max 5, min 1)
    if effective_backend == "ollama":
        runs_count = n_runs if n_runs is not None else 10
        runs_count = max(1, min(runs_count, 20))
    else:
        runs_count = 1

    run_id = f"run_{uuid.uuid4().hex[:8]}"
    now_utc = datetime.now(timezone.utc)

    run_row = RunRow(
        run_id=run_id,
        task_id=task_id,
        defense=defense,
        backend=effective_backend,
        status="running",
        created_at=now_utc,
    )
    db.add(run_row)
    db.commit()

    from app.db.session import SessionLocal

    for idx in range(runs_count):
        with SessionLocal() as trial_db:
            trial_id = f"trial_{uuid.uuid4().hex[:8]}"
            trial_row = TrialRow(
                trial_id=trial_id,
                run_id=run_id,
                task_id=task_id,
                backend=effective_backend,
                status="running",
                started_at=datetime.now(timezone.utc),
            )
            trial_db.add(trial_row)
            trial_db.commit()
    
            simulated = simulate_trial(
                task=task.model_copy(deep=True),
                defense=defense,
                run_id=run_id,
                trial_id=trial_id,
                backend=effective_backend,
                backend_config=backend_config,
            )
    
            # Persist all recorded events
            for seq, event in enumerate(simulated.events, start=1):
                event_row = EventRow(
                    trial_id=trial_id,
                    seq=seq,
                    payload=event.model_dump_json(),
                )
                trial_db.add(event_row)
    
            env_state_row = TrialEnvStateRow(
                trial_id=trial_id,
                state_json=json.dumps(simulated.env_state),
            )
            trial_db.add(env_state_row)
    
            eval_row = EvaluationRow(
                trial_id=trial_id,
                verdict=simulated.evaluation.verdict.value,
                result_json=simulated.evaluation.model_dump_json(),
            )
            trial_db.add(eval_row)
    
            trial_row.status = simulated.status
            trial_row.error = simulated.error
            trial_row.finished_at = datetime.now(timezone.utc)
            if simulated.model_replies:
                trial_row.model_replies_json = json.dumps(simulated.model_replies)
            trial_db.commit()

    db.refresh(run_row)
    run_row.status = "completed" if all(t.status in ("completed", "inconclusive") for t in run_row.trials) else "failed"
    setattr(run_row, "fallback_notice", fallback_notice)

    db.commit()
    db.refresh(run_row)
    return run_row
