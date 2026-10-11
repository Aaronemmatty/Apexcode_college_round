"""Tests for Stage G4 AgentAdapter and HTTP connector.

Tests satisfy all requirements of Phase 4:
- hierarchy & contract compliance
- benign task passes against reference external agent (verdict HELD)
- injected attack is VIOLATED under defense "none"
- injected attack is HELD under defense "gateway"
- offline external agent returns clean error & INCONCLUSIVE without crashing
- garbage JSON returns clean error & INCONCLUSIVE without crashing
- looping agent stops cleanly at max_steps (8)
- unknown tool requests are recorded as blocked and never executed
- replay from saved replies works even when the external agent is offline
- safety: URL scheme validation and 2000-char response cap
"""

import json
import socket
import threading
import time
from typing import Generator
from unittest.mock import MagicMock, patch

import pytest
import uvicorn
from fastapi.testclient import TestClient

from app.agent.adapter import AgentAdapter, ScriptedAgentAdapter, OllamaAgentAdapter, HttpAgentAdapter
from app.agent.tasks import get_task
from app.agent.recorder import TraceRecorder
from app.agent.executor import DirectExecutor
from app.events import Decision, ExecutionStatus
from app.orchestrator import simulate_trial
from app.sandbox.tools import ToolEnvironment
from examples.external_agent import app as external_agent_app


@pytest.fixture(scope="module")
def live_external_agent_url() -> Generator[str, None, None]:
    """Spin up reference external agent in a background thread on a free port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    config = uvicorn.Config(
        app=external_agent_app,
        host="127.0.0.1",
        port=port,
        log_level="error",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # Wait for server to start
    start_time = time.time()
    while not server.started and time.time() - start_time < 5.0:
        time.sleep(0.05)

    agent_url = f"http://127.0.0.1:{port}/agent"
    yield agent_url

    server.should_exit = True


def test_agent_adapter_hierarchy():
    """Verify AgentAdapter abstract class and concrete implementations."""
    assert issubclass(ScriptedAgentAdapter, AgentAdapter)
    assert issubclass(OllamaAgentAdapter, AgentAdapter)
    assert issubclass(HttpAgentAdapter, AgentAdapter)


def test_example_external_agent_contract():
    """Verify examples/external_agent.py follows the Phase 3 contract."""
    client = TestClient(external_agent_app)

    # Step 1: Initial task turn
    resp1 = client.post(
        "/agent",
        json={"task": "Refund order 1042 for customer Alice", "tool_catalog": [], "history": [], "step": 1},
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["type"] == "tool_call"
    assert data1["tool"] == "search_customers"

    # Step 2: Benign history yields final
    resp2 = client.post(
        "/agent",
        json={
            "task": "Refund order 1042 for customer Alice",
            "tool_catalog": [],
            "history": [{"tool": "search_customers", "args": {"query": "Alice"}, "result": "Customer Alice found"}],
            "step": 2,
        },
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["type"] == "final"


def test_connector_benign_task_held(live_external_agent_url: str):
    """Connector completes a normal benign task against external agent (verdict HELD)."""
    task = get_task("benign_customer_lookup")
    res = simulate_trial(
        task=task,
        defense="none",
        run_id="run_conn_benign",
        trial_id="tr_conn_benign",
        backend="http_agent",
        backend_config={"url": live_external_agent_url},
    )
    assert res.status == "completed"
    assert res.evaluation.verdict.value == "held"
    assert res.evaluation.false_blocks == 0


def test_connector_attack_violated_under_none(live_external_agent_url: str):
    """Injected attack against external agent is VIOLATED with defense 'none'."""
    task = get_task("indirect_injection_email_leak")
    res = simulate_trial(
        task=task,
        defense="none",
        run_id="run_conn_atk_none",
        trial_id="tr_conn_atk_none",
        backend="http_agent",
        backend_config={"url": live_external_agent_url},
    )
    assert res.status == "completed"
    assert res.evaluation.verdict.value == "violated"


def test_connector_attack_held_under_gateway(live_external_agent_url: str):
    """Same attack is HELD/blocked with defense 'gateway' (proves defenses apply)."""
    task = get_task("indirect_injection_email_leak")
    res = simulate_trial(
        task=task,
        defense="gateway",
        run_id="run_conn_atk_gw",
        trial_id="tr_conn_atk_gw",
        backend="http_agent",
        backend_config={"url": live_external_agent_url},
    )
    assert res.status == "completed"
    assert res.evaluation.verdict.value == "held"
    assert res.evaluation.false_blocks == 0


def test_connector_external_agent_offline():
    """External agent offline -> clean error and INCONCLUSIVE, no crash."""
    task = get_task("benign_customer_lookup")
    # Port 59199 is not running any listener
    res = simulate_trial(
        task=task,
        defense="none",
        run_id="run_conn_offline",
        trial_id="tr_conn_offline",
        backend="http_agent",
        backend_config={"url": "http://127.0.0.1:59199/agent"},
    )
    assert res.status == "inconclusive"
    assert res.evaluation.verdict.value == "inconclusive"
    assert "Failed to communicate with external agent" in (res.error or "")


def test_connector_garbage_json():
    """External agent returns garbage JSON -> clean error, no crash."""
    task = get_task("benign_customer_lookup")
    mock_resp = MagicMock()
    mock_resp.read.return_value = b"<html>502 Bad Gateway - Not Valid JSON</html>"
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = simulate_trial(
            task=task,
            defense="none",
            run_id="run_conn_garbage",
            trial_id="tr_conn_garbage",
            backend="http_agent",
            backend_config={"url": "http://localhost:9000/agent"},
        )
    assert res.status == "inconclusive"
    assert res.evaluation.verdict.value == "inconclusive"


def test_connector_loops_forever_stops_at_max_steps():
    """Agent that returns tool_calls continuously stops at max steps (8)."""
    task = get_task("benign_customer_lookup")
    looping_reply = {
        "type": "tool_call",
        "tool": "search_customers",
        "args": {"query": "Alice"},
    }

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(looping_reply).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = simulate_trial(
            task=task,
            defense="none",
            run_id="run_conn_loop",
            trial_id="tr_conn_loop",
            backend="http_agent",
            backend_config={"url": "http://localhost:9000/agent"},
        )

    # Must complete up to max 8 steps without infinite hanging
    assert res.status == "completed"
    tool_requests = [e for e in res.events if e.type.value == "tool_request"]
    assert len(tool_requests) == 8


def test_connector_unknown_tool_recorded_not_executed():
    """Unknown tool name requested is recorded as blocked and never executed."""
    task = get_task("benign_customer_lookup")
    env = ToolEnvironment(documents_overlay=task.documents)
    direct = DirectExecutor(env)
    recorder = TraceRecorder(run_id="run_conn_unk", trial_id="tr_conn_unk")

    adapter = HttpAgentAdapter(endpoint_url="http://mock.internal/agent")

    unknown_tool_reply = {
        "type": "tool_call",
        "tool": "arbitrary_eval_shell",
        "args": {"cmd": "id"},
    }
    final_reply = {"type": "final", "message": "Done."}

    mock_resp1 = MagicMock()
    mock_resp1.read.return_value = json.dumps(unknown_tool_reply).encode("utf-8")
    mock_resp1.__enter__.return_value = mock_resp1

    mock_resp2 = MagicMock()
    mock_resp2.read.return_value = json.dumps(final_reply).encode("utf-8")
    mock_resp2.__enter__.return_value = mock_resp2

    with patch("urllib.request.urlopen", side_effect=[mock_resp1, mock_resp2]):
        events = adapter.run(task=task, executor=direct, recorder=recorder, defense="none")

    tool_reqs = [e for e in events if e.type.value == "tool_request"]
    tool_resps = [e for e in events if e.type.value == "tool_result"]
    assert len(tool_reqs) == 1
    assert tool_reqs[0].tool == "arbitrary_eval_shell"
    assert len(tool_resps) == 1
    assert tool_resps[0].tool == "arbitrary_eval_shell"
    assert tool_resps[0].execution_status == ExecutionStatus.NOT_EXECUTED
    assert tool_resps[0].decision == Decision.BLOCKED


def test_connector_replay_from_saved_replies(live_external_agent_url: str):
    """Replay of an external-agent trial works from saved replies even when agent is offline."""
    task = get_task("benign_customer_lookup")

    # Step 1: Run original trial against live agent
    orig = simulate_trial(
        task=task,
        defense="none",
        run_id="run_conn_orig",
        trial_id="tr_conn_orig",
        backend="http_agent",
        backend_config={"url": live_external_agent_url},
    )
    assert len(orig.model_replies) > 0

    # Step 2: Replay pointing to a completely dead/offline port using saved_replies
    dead_url = "http://127.0.0.1:59998/agent"
    replay = simulate_trial(
        task=task,
        defense="none",
        run_id="run_conn_orig",
        trial_id="tr_conn_orig",
        backend="http_agent",
        backend_config={"url": dead_url},
        saved_replies=orig.model_replies,
    )

    assert replay.status == "completed"
    assert replay.evaluation.verdict.value == orig.evaluation.verdict.value
    assert len(replay.events) == len(orig.events)


def test_connector_url_scheme_validation():
    """Connector blocks non-http(s) schemes like ftp:// or file://."""
    task = get_task("benign_customer_lookup")
    res = simulate_trial(
        task=task,
        defense="none",
        run_id="run_conn_file",
        trial_id="tr_conn_file",
        backend="http_agent",
        backend_config={"url": "file:///etc/passwd"},
    )
    assert res.status == "inconclusive"
    assert res.evaluation.verdict.value == "inconclusive"
    assert "Invalid URL scheme" in (res.error or "")


def test_connector_2000_char_response_cap():
    """Connector enforces 2000-char cap on external agent responses."""
    task = get_task("benign_customer_lookup")
    giant_reply = {
        "type": "final",
        "message": "A" * 3000,
    }

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(giant_reply).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = simulate_trial(
            task=task,
            defense="none",
            run_id="run_conn_giant",
            trial_id="tr_conn_giant",
            backend="http_agent",
            backend_config={"url": "http://localhost:9000/agent"},
        )
    assert res.status == "inconclusive"
    assert res.evaluation.verdict.value == "inconclusive"
    assert "2000 character limit" in (res.error or "")
