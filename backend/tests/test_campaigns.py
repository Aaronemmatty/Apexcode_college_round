"""Tests for STAGE B: Autonomous Attack Discovery, mutator, feedback loop, and campaign API."""

import json
from pathlib import Path
import pytest

from app.agent.tasks import get_task, list_tasks
from app.attacks.loader import load_scenarios
from app.db.models import EvaluationRow, GeneratedTaskRow
from app.discovery.campaign import run_discovery_campaign
from app.reports.metrics import get_compare_metrics


def test_campaign_same_seed_identical(test_db):
    """Same seed gives identical attempts and verdicts in the same order."""
    res1 = run_discovery_campaign(
        db=test_db,
        budget=8,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )
    res2 = run_discovery_campaign(
        db=test_db,
        budget=8,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )

    assert len(res1["attempts"]) == len(res2["attempts"])
    assert res1["bypasses_found"] == res2["bypasses_found"]
    assert res1["valid"] == res2["valid"]
    assert res1["invalid"] == res2["invalid"]
    assert res1["blocked"] == res2["blocked"]

    for a1, a2 in zip(res1["attempts"], res2["attempts"]):
        assert a1["operator"] == a2["operator"]
        assert a1["verdict"] == a2["verdict"]
        assert a1["description"] == a2["description"]
        assert a1["is_bypass"] == a2["is_bypass"]
        assert a1["blocked_rules"] == a2["blocked_rules"]


def test_campaign_different_seed_differs(test_db):
    """A different seed produces different mutation sequences."""
    res1 = run_discovery_campaign(
        db=test_db,
        budget=10,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )
    res2 = run_discovery_campaign(
        db=test_db,
        budget=10,
        seed=999,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )

    ops1 = [a["operator"] for a in res1["attempts"]]
    ops2 = [a["operator"] for a in res2["attempts"]]
    descs1 = [a["description"] for a in res1["attempts"]]
    descs2 = [a["description"] for a in res2["attempts"]]

    assert (ops1 != ops2) or (descs1 != descs2)


def test_campaign_budget_respected(test_db):
    """Budget is strictly respected and capped at 200."""
    res = run_discovery_campaign(
        db=test_db,
        budget=7,
        seed=101,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )
    assert res["trials_executed"] <= 7
    assert len(res["attempts"]) <= 7
    assert res["budget"] == 7

    # Cap test: requesting budget > 200 must be hard-capped at 200
    res_cap = run_discovery_campaign(
        db=test_db,
        budget=250,
        seed=101,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
        stop_after_bypasses=1,
    )
    assert res_cap["budget"] <= 200


def test_campaign_no_duplicate_attempts(test_db):
    """Campaign loop skips duplicate mutations (hash of plan and documents)."""
    res = run_discovery_campaign(
        db=test_db,
        budget=20,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )

    seen_fingerprints = set()
    for att in res["attempts"]:
        task_id = att["task_id"]
        task = get_task(task_id, db=test_db)
        assert task is not None
        plan_str = repr([(s.tool, sorted(s.arguments.items())) for s in task.plan])
        docs_str = repr(sorted((k, v.get("content", "")) for k, v in task.documents.items()))
        fp = f"{plan_str}::{docs_str}"
        assert fp not in seen_fingerprints, f"Duplicate mutant executed: {task_id}"
        seen_fingerprints.add(fp)


def test_campaign_invalid_mutants_not_counted_as_blocked(test_db):
    """Mutants failing validity check under 'none' are marked invalid_mutant and not counted as blocked."""
    res = run_discovery_campaign(
        db=test_db,
        budget=25,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )

    invalid_attempts = [a for a in res["attempts"] if a["verdict"] == "invalid_mutant"]
    assert len(invalid_attempts) > 0, "Expected at least one invalid mutant in 25 attempts"

    for inv in invalid_attempts:
        assert inv["is_valid"] is False
        assert inv["is_bypass"] is False
        assert "invalid" in inv["description"].lower()

    assert res["invalid"] == len(invalid_attempts)
    assert res["valid"] + res["invalid"] == res["trials_executed"]
    # Blocked must strictly equal valid attempts that ended in 'held'
    blocked_attempts = [a for a in res["attempts"] if a["is_valid"] and a["verdict"] == "held"]
    assert res["blocked"] == len(blocked_attempts)


def test_generated_tasks_isolated_from_scenarios(client, test_db):
    """Generated tasks must never enter backend/scenarios, never enter scenario cache, and never appear in scenario list."""
    scenarios_dir = Path(__file__).resolve().parent.parent / "scenarios"
    files_before = set(p.name for p in scenarios_dir.glob("*.json"))

    res = run_discovery_campaign(
        db=test_db,
        budget=5,
        seed=12,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )
    assert res["trials_executed"] >= 1

    # 1. No files written to backend/scenarios
    files_after = set(p.name for p in scenarios_dir.glob("*.json"))
    assert files_before == files_after
    for f in files_after:
        assert not f.startswith("gen_")

    # 2. Never in load_scenarios() cache
    cached_scenarios = load_scenarios()
    for task_id in cached_scenarios:
        assert not task_id.startswith("gen_")

    # 3. Never in list_tasks()
    for task in list_tasks():
        assert not task.task_id.startswith("gen_")

    # 4. Never in GET /api/scenarios
    resp = client.get("/api/scenarios")
    assert resp.status_code == 200
    for sc in resp.json():
        assert not sc["task_id"].startswith("gen_")


def test_campaign_replay_consistent(client, test_db):
    """Replay of a discovered bypass via POST /api/trials/{id}/replay is consistent."""
    res = run_discovery_campaign(
        db=test_db,
        budget=15,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )
    bypasses = [a for a in res["attempts"] if a["is_bypass"]]
    assert len(bypasses) > 0, "Expected at least one bypass"

    bypass_trial_id = bypasses[0]["trial_id"]
    resp = client.post(f"/api/trials/{bypass_trial_id}/replay")
    assert resp.status_code == 200
    data = resp.json()
    assert data["consistent"] is True
    assert data["original_trial_id"] == bypass_trial_id
    report = data.get("report") or {}
    assert len(report.get("differences", [])) == 0


def test_benchmark_metrics_unchanged_by_campaign(test_db):
    """Campaign and custom runs must NOT change existing benchmark metrics."""
    metrics_before = get_compare_metrics(test_db)
    total_before = len(metrics_before["per_scenario"])
    assert total_before == 23

    # Run discovery campaign
    run_discovery_campaign(
        db=test_db,
        budget=10,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )

    metrics_after = get_compare_metrics(test_db)
    assert len(metrics_after["per_scenario"]) == total_before
    assert metrics_after["attack_violated_none"] == metrics_before["attack_violated_none"]
    assert metrics_after["attack_violated_gateway"] == metrics_before["attack_violated_gateway"]
    assert metrics_after["benign_held_gateway"] == metrics_before["benign_held_gateway"]

    for item in metrics_after["per_scenario"]:
        assert not item["task_id"].startswith("gen_")


def test_discovery_campaign_finds_bypass_violating_scope(test_db):
    """Discovery test: seeded from excessive_access_wildcard against gateway, seed=42, budget=60.
    Must find at least one bypass violating customer_data_access_within_scope.
    """
    res = run_discovery_campaign(
        db=test_db,
        budget=60,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )

    assert res["status"] == "completed"
    assert res["bypasses_found"] >= 1

    bypasses = [a for a in res["attempts"] if a["is_bypass"]]
    assert len(bypasses) >= 1

    found_scope_violation = False
    for bp in bypasses:
        trial_id = bp["trial_id"]
        ev = test_db.query(EvaluationRow).filter(EvaluationRow.trial_id == trial_id).first()
        assert ev is not None
        assert ev.verdict == "violated"
        res_json = json.loads(ev.result_json) if isinstance(ev.result_json, str) else ev.result_json
        for inv in res_json.get("invariants", []):
            if inv.get("invariant_id") == "customer_data_access_within_scope" and inv.get("status") == "violated":
                found_scope_violation = True
                assert bp["severity"] in ("HIGH", "CRITICAL", "MEDIUM")
                break

    assert found_scope_violation, "Campaign did not find any bypass violating customer_data_access_within_scope"


def test_campaign_api_endpoints(client, test_db):
    """API endpoints for campaign lifecycle and rerun-bypasses."""
    create_resp = client.post("/api/campaigns", json={
        "budget": 10,
        "seed": 42,
        "defense": "gateway",
        "seed_scenarios": ["excessive_access_wildcard"],
    })
    assert create_resp.status_code == 200
    data = create_resp.json()
    cid = data["campaign_id"]
    assert "attempts" in data
    assert "bypasses" in data

    # GET /api/campaigns
    list_resp = client.get("/api/campaigns")
    assert list_resp.status_code == 200
    c_list = list_resp.json()
    assert any(c["campaign_id"] == cid for c in c_list)

    # GET /api/campaigns/{id}
    detail_resp = client.get(f"/api/campaigns/{cid}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["campaign_id"] == cid
    assert "attempts" in detail
    assert "bypasses_by_operator" in detail

    # POST /api/campaigns/{id}/rerun-bypasses?defense=gateway
    rerun_resp = client.post(f"/api/campaigns/{cid}/rerun-bypasses?defense=gateway")
    assert rerun_resp.status_code == 200
    rerun_data = rerun_resp.json()
    assert rerun_data["campaign_id"] == cid
    assert rerun_data["defense"] == "gateway"
    assert "total_bypasses" in rerun_data
    assert "fixed_count" in rerun_data
    assert "still_violated_count" in rerun_data
    assert rerun_data["still_violated_count"] == len(detail["bypasses"])
