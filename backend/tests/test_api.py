"""Integration tests for scenarios, runs, and trials API endpoints."""

def test_list_scenarios(client):
    response = client.get("/api/scenarios")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    ids = {item["task_id"] for item in data}
    assert ids == {
        "benign_customer_lookup",
        "benign_valid_email",
        "indirect_injection_email_leak",
    }


def test_get_scenario_detail(client):
    response = client.get("/api/scenarios/benign_customer_lookup")
    assert response.status_code == 200
    data = response.json()
    assert data["task_id"] == "benign_customer_lookup"
    assert data["kind"] == "benign"
    assert len(data["plan"]) == 1
    assert data["plan"][0]["tool"] == "search_customers"


def test_get_scenario_not_found(client):
    response = client.get("/api/scenarios/does_not_exist")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"
    assert "not found" in data["error"]["message"].lower()


def test_create_run_and_get_trace_for_all_tasks(client):
    for task_id in ("benign_customer_lookup", "benign_valid_email", "indirect_injection_email_leak"):
        post_resp = client.post("/api/runs", json={"task_id": task_id, "defense": "none"})
        assert post_resp.status_code == 200
        run_data = post_resp.json()
        assert run_data["task_id"] == task_id
        assert run_data["defense"] == "none"
        assert run_data["status"] == "completed"
        assert len(run_data["trials"]) == 1

        trial = run_data["trials"][0]
        assert trial["status"] == "completed"
        assert trial["event_count"] > 0

        # Retrieve trial trace
        trace_resp = client.get(f"/api/trials/{trial['trial_id']}/trace")
        assert trace_resp.status_code == 200
        trace_data = trace_resp.json()
        assert trace_data["trial_id"] == trial["trial_id"]
        assert trace_data["run_id"] == run_data["run_id"]
        assert trace_data["status"] == "completed"
        assert len(trace_data["events"]) == trial["event_count"]


def test_create_run_unknown_task_returns_404(client):
    response = client.post("/api/runs", json={"task_id": "unknown_task", "defense": "none"})
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"
    assert "not found" in data["error"]["message"].lower()


def test_create_run_unsupported_defense_returns_422(client):
    response = client.post("/api/runs", json={"task_id": "benign_customer_lookup", "defense": "gateway"})
    assert response.status_code == 422
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_422"
    assert "Phase 3" in data["error"]["message"]


def test_list_runs_and_get_run_detail(client):
    # Execute a run
    post_resp = client.post("/api/runs", json={"task_id": "benign_customer_lookup", "defense": "none"})
    assert post_resp.status_code == 200
    created = post_resp.json()
    run_id = created["run_id"]

    # List runs
    list_resp = client.get("/api/runs")
    assert list_resp.status_code == 200
    runs = list_resp.json()
    assert len(runs) >= 1
    assert runs[0]["run_id"] == run_id

    # Get single run
    detail_resp = client.get(f"/api/runs/{run_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["run_id"] == run_id
    assert detail["task_id"] == "benign_customer_lookup"
    assert len(detail["trials"]) == 1


def test_get_run_not_found(client):
    response = client.get("/api/runs/run_nonexistent")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"


def test_get_trial_trace_not_found(client):
    response = client.get("/api/trials/trial_nonexistent/trace")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"