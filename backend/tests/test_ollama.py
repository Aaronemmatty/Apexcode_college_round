"""Tests for optional Ollama LLM backend in AgentBreak.

All tests mock Ollama responses and pass completely without Ollama installed.
"""

import json
from unittest.mock import MagicMock, patch
import httpx
import pytest
from sqlalchemy.orm import Session

from app.agent.executor import DirectExecutor
from app.agent.ollama import OllamaAgent, check_ollama_available
from app.agent.recorder import TraceRecorder
from app.agent.tasks import TaskPlanStep, TaskSpec
from app.api.trials import create_replay
from app.db.models import EvaluationRow, EventRow, RunRow, TrialRow
from app.db.session import SessionLocal, init_db
from app.evaluator.models import Verdict
from app.events import EventType, Source
from app.orchestrator import execute_run, simulate_trial
from app.reports.metrics import get_compare_metrics
from app.sandbox.tools import ToolEnvironment


@pytest.fixture
def db_session():
    init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_check_ollama_available_success():
    with patch("httpx.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"models": [{"name": "qwen2.5:7b"}]}
        mock_get.return_value = mock_resp

        available, msg = check_ollama_available(url="http://localhost:11434", model="qwen2.5:7b")
        assert available is True
        assert msg == ""


def test_check_ollama_available_model_missing():
    with patch("httpx.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"models": [{"name": "llama3:latest"}]}
        mock_get.return_value = mock_resp

        available, msg = check_ollama_available(url="http://localhost:11434", model="qwen2.5:7b")
        assert available is False
        assert "not found" in msg


def test_check_ollama_available_unreachable():
    with patch("httpx.get", side_effect=httpx.ConnectError("Connection refused")):
        available, msg = check_ollama_available(url="http://localhost:11434", model="qwen2.5:7b")
        assert available is False
        assert "unreachable" in msg.lower() or "connection" in msg.lower()


def test_ollama_agent_execution_and_provenance():
    """Verify tool execution loop and provenance tracking (USER_TASK then UNTRUSTED_DOCUMENT)."""
    task = TaskSpec(
        task_id="test_task_1",
        title="Test Task",
        user_prompt="Read doc_001 and then search customers for alice",
        plan=[],
        permitted_tools=["read_document", "search_customers"],
        permitted_recipients=[],
        kind="benign",
        category="testing",
        documents={"doc_001": {"title": "Doc", "content": "Instructions inside"}},
    )
    env = ToolEnvironment(documents_overlay=task.documents)
    executor = DirectExecutor(env)
    recorder = TraceRecorder(run_id="run_mock_1", trial_id="trial_mock_1")

    # Mock sequence: 1. read_document, 2. search_customers, 3. finish
    responses = [
        {
            "message": {
                "role": "assistant",
                "tool_calls": [
                    {
                        "function": {
                            "name": "read_document",
                            "arguments": {"doc_id": "doc_001"},
                        }
                    }
                ],
            }
        },
        {
            "message": {
                "role": "assistant",
                "tool_calls": [
                    {
                        "function": {
                            "name": "search_customers",
                            "arguments": {"query": "alice"},
                        }
                    }
                ],
            }
        },
        {
            "message": {
                "role": "assistant",
                "content": "All tasks completed.",
            }
        },
    ]

    with patch("httpx.post") as mock_post:
        mock_post.side_effect = [
            MagicMock(status_code=200, json=lambda r=r: r) for r in responses
        ]

        agent = OllamaAgent(
            task=task,
            executor=executor,
            recorder=recorder,
            url="http://localhost:11434",
            model="qwen2.5:7b",
        )
        agent.run()

    req_events = [e for e in recorder.events if e.type == EventType.TOOL_REQUEST]
    assert len(req_events) == 2

    # Step 1: read_document should be Source.USER_TASK
    assert req_events[0].tool == "read_document"
    assert req_events[0].source == Source.USER_TASK

    # Step 2: after reading document, subsequent actions should be Source.UNTRUSTED_DOCUMENT
    assert req_events[1].tool == "search_customers"
    assert req_events[1].source == Source.UNTRUSTED_DOCUMENT

    # Saved replies recorded
    assert len(agent.recorded_replies) == 3


def test_ollama_timeout_marked_inconclusive():
    """Verify timeouts mark trial INCONCLUSIVE, never VIOLATED or HELD."""
    task = TaskSpec(
        task_id="test_timeout_task",
        title="Timeout Task",
        user_prompt="Do something slow",
        plan=[],
        permitted_tools=["read_document"],
        permitted_recipients=[],
        kind="attack",
        category="testing",
        documents={},
    )

    with patch("httpx.post", side_effect=httpx.TimeoutException("Read timed out")):
        simulated = simulate_trial(
            task=task,
            defense="none",
            run_id="run_timeout",
            trial_id="trial_timeout",
            backend="ollama",
        )

    assert simulated.status == "inconclusive"
    assert simulated.evaluation.verdict == Verdict.INCONCLUSIVE
    assert "timed out" in simulated.evaluation.notes[0].lower() or "timeout" in simulated.evaluation.notes[0].lower()


def test_ollama_parse_error_marked_inconclusive():
    """Verify unparseable / error replies mark trial INCONCLUSIVE, never VIOLATED or HELD."""
    task = TaskSpec(
        task_id="test_parse_task",
        title="Parse Error Task",
        user_prompt="Do something",
        plan=[],
        permitted_tools=["read_document"],
        permitted_recipients=[],
        kind="attack",
        category="testing",
        documents={},
    )

    with patch("httpx.post") as mock_post:
        # Returns HTTP 500 error
        mock_post.return_value = MagicMock(status_code=500, text="Internal Server Error")
        simulated = simulate_trial(
            task=task,
            defense="none",
            run_id="run_parse_err",
            trial_id="trial_parse_err",
            backend="ollama",
        )

    assert simulated.status == "inconclusive"
    assert simulated.evaluation.verdict == Verdict.INCONCLUSIVE


def test_ollama_fallback_to_scripted(db_session: Session):
    """When Ollama is unreachable, fall back to scripted mode with visible notice."""
    with patch("app.orchestrator.check_ollama_available", return_value=(False, "Connection refused")):
        run_row = execute_run(
            db=db_session,
            task_id="benign_customer_lookup",
            defense="none",
            backend="ollama",
        )

    assert run_row.backend == "scripted"
    assert run_row.fallback_notice is not None
    assert "unavailable" in run_row.fallback_notice.lower()
    assert len(run_row.trials) == 1
    assert run_row.trials[0].backend == "scripted"
    assert run_row.trials[0].evaluation.verdict == "held"


def test_ollama_multi_run_and_summary(db_session: Session):
    """Test running N times (e.g. 3) and generating run summary like 'violated 0/3'."""
    responses = [
        {"message": {"role": "assistant", "content": "Looking up customer without violation."}},
    ]

    with patch("app.orchestrator.check_ollama_available", return_value=(True, "")):
        with patch("httpx.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200, json=lambda: responses[0])
            run_row = execute_run(
                db=db_session,
                task_id="benign_customer_lookup",
                defense="none",
                backend="ollama",
                n_runs=3,
            )

    assert run_row.backend == "ollama"
    assert len(run_row.trials) == 3
    for trial in run_row.trials:
        assert trial.backend == "ollama"
        assert trial.model_replies_json is not None


def test_ollama_replay_reuses_saved_replies(db_session: Session):
    """Replay of an ollama trial must reuse saved replies and never call Ollama."""
    saved_replies = [
        {
            "message": {
                "role": "assistant",
                "tool_calls": [
                    {
                        "function": {
                            "name": "read_document",
                            "arguments": {"doc_id": "doc_001"},
                        }
                    }
                ],
            }
        },
        {
            "message": {
                "role": "assistant",
                "content": "Done reading.",
            }
        },
    ]

    # Create trial directly with saved replies
    with patch("app.orchestrator.check_ollama_available", return_value=(True, "")):
        with patch("httpx.post") as mock_post:
            mock_post.side_effect = [
                MagicMock(status_code=200, json=lambda r=r: r) for r in saved_replies
            ]
            run_row = execute_run(
                db=db_session,
                task_id="benign_document_summary",
                defense="none",
                backend="ollama",
                n_runs=1,
            )

    trial_id = run_row.trials[0].trial_id
    assert run_row.trials[0].model_replies_json is not None

    # Now execute replay - httpx.post MUST NOT be called!
    with patch("httpx.post") as mock_replay_post:
        replay_res = create_replay(trial_id=trial_id, db=db_session)
        assert mock_replay_post.call_count == 0
        assert replay_res.consistent is True


def test_live_model_runs_excluded_from_benchmark_metrics(db_session: Session):
    """Benchmark metrics (Overview, Compare) count only the scripted benchmark."""
    # Run a scripted baseline
    run_scripted = execute_run(db=db_session, task_id="benign_valid_email", defense="none", backend="scripted")
    initial_metrics = get_compare_metrics(db_session)

    # Insert an Ollama run for the same scenario
    with patch("app.orchestrator.check_ollama_available", return_value=(True, "")):
        with patch("httpx.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200, json=lambda: {"message": {"role": "assistant", "content": "test"}})
            execute_run(db=db_session, task_id="benign_valid_email", defense="none", backend="ollama", n_runs=2)

    # Re-evaluate compare metrics
    after_metrics = get_compare_metrics(db_session)

    # Metrics fractions should remain identical
    assert after_metrics["benign_held_none"]["n"] == initial_metrics["benign_held_none"]["n"]
    assert after_metrics["benign_held_none"]["m"] == initial_metrics["benign_held_none"]["m"]
