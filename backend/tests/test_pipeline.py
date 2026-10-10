"""Integration tests for the full 4-scenario defense matrix, crashing agents, and determinism."""

from app.agent.agent import ScriptedAgent


def test_matrix_attack_none(client):
    """indirect_injection_email_leak + defense='none' => VIOLATED."""
    resp = client.post("/api/runs", json={"task_id": "indirect_injection_email_leak", "defense": "none"})
    assert resp.status_code == 200
    trial_id = resp.json()["trials"][0]["trial_id"]

    eval_resp = client.get(f"/api/trials/{trial_id}/evaluation")
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["verdict"] == "violated"


def test_matrix_attack_gateway(client):
    """indirect_injection_email_leak + defense='gateway' => HELD with exactly 2 blocked requests."""
    resp = client.post("/api/runs", json={"task_id": "indirect_injection_email_leak", "defense": "gateway"})
    assert resp.status_code == 200
    trial_id = resp.json()["trials"][0]["trial_id"]

    # Check evaluation
    eval_resp = client.get(f"/api/trials/{trial_id}/evaluation")
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["verdict"] == "held"

    # Check trace has exactly 2 blocked requests
    trace_resp = client.get(f"/api/trials/{trial_id}/trace")
    assert trace_resp.status_code == 200
    events = trace_resp.json()["events"]
    blocked_results = [
        e for e in events
        if e["type"] == "tool_result" and e.get("execution_status") == "not_executed" and e.get("decision") == "blocked"
    ]
    assert len(blocked_results) == 2


def test_matrix_benign_none(client):
    """benign_valid_email + defense='none' => HELD."""
    resp = client.post("/api/runs", json={"task_id": "benign_valid_email", "defense": "none"})
    assert resp.status_code == 200
    trial_id = resp.json()["trials"][0]["trial_id"]

    eval_resp = client.get(f"/api/trials/{trial_id}/evaluation")
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["verdict"] == "held"


def test_matrix_benign_gateway(client):
    """benign_valid_email + defense='gateway' => HELD with task_completed=True and false_blocks=0."""
    resp = client.post("/api/runs", json={"task_id": "benign_valid_email", "defense": "gateway"})
    assert resp.status_code == 200
    trial_id = resp.json()["trials"][0]["trial_id"]

    eval_resp = client.get(f"/api/trials/{trial_id}/evaluation")
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["verdict"] == "held"
    assert eval_data["task_completed"] is True
    assert eval_data["false_blocks"] == 0


def test_simulated_crashing_agent_yields_inconclusive(client, monkeypatch):
    """A crashing agent produces trial status 'failed' and verdict INCONCLUSIVE, and run API still returns 200."""
    def crash_run(self):
        self.recorder.record_agent_input(self.task.user_prompt, step=0)
        raise RuntimeError("Simulated unhandled LLM/agent crash")

    monkeypatch.setattr(ScriptedAgent, "run", crash_run)

    resp = client.post("/api/runs", json={"task_id": "benign_customer_lookup", "defense": "gateway"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "failed"
    trial = data["trials"][0]
    assert trial["status"] == "failed"
    assert trial["verdict"] == "inconclusive"

    # Fetch evaluation endpoint
    eval_resp = client.get(f"/api/trials/{trial['trial_id']}/evaluation")
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["verdict"] == "inconclusive"


def test_pipeline_determinism(client):
    """Same task + defense combination produces identical gateway decisions and verdicts."""
    for defense in ("none", "gateway"):
        r1 = client.post("/api/runs", json={"task_id": "indirect_injection_email_leak", "defense": defense}).json()
        r2 = client.post("/api/runs", json={"task_id": "indirect_injection_email_leak", "defense": defense}).json()

        t1_id = r1["trials"][0]["trial_id"]
        t2_id = r2["trials"][0]["trial_id"]

        e1 = client.get(f"/api/trials/{t1_id}/evaluation").json()
        e2 = client.get(f"/api/trials/{t2_id}/evaluation").json()

        assert e1["verdict"] == e2["verdict"]
        assert [inv["status"] for inv in e1["invariants"]] == [inv["status"] for inv in e2["invariants"]]

        tr1 = client.get(f"/api/trials/{t1_id}/trace").json()["events"]
        tr2 = client.get(f"/api/trials/{t2_id}/trace").json()["events"]

        # Assert sequence of decisions and rules matches exactly
        decisions1 = [(e["type"], e.get("tool"), e.get("decision"), e.get("rule_id")) for e in tr1]
        decisions2 = [(e["type"], e.get("tool"), e.get("decision"), e.get("rule_id")) for e in tr2]
        assert decisions1 == decisions2
