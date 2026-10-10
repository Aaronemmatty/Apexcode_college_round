from pathlib import Path
"""Tests for autonomous attack discovery mutator and campaigns."""

import pytest
from app.attacks.mutator import run_discovery_campaign


def test_campaign_budget_respected(test_db):
    res = run_discovery_campaign(
        db=test_db,
        budget=4,
        seed=100,
        defense="gateway",
        seed_scenarios=["direct_injection_override"],
    )
    assert res["status"] == "completed"
    assert res["budget"] == 4
    assert res["trials_executed"] == 4
    assert len(res["attempts"]) == 4


def test_campaign_deterministic_reproducibility(test_db):
    res1 = run_discovery_campaign(
        db=test_db,
        budget=5,
        seed=777,
        defense="gateway",
        seed_scenarios=["unauthorized_recipient_injection", "excessive_access_wildcard"],
    )
    res2 = run_discovery_campaign(
        db=test_db,
        budget=5,
        seed=777,
        defense="gateway",
        seed_scenarios=["unauthorized_recipient_injection", "excessive_access_wildcard"],
    )

    assert res1["trials_executed"] == res2["trials_executed"]
    assert res1["bypasses_found"] == res2["bypasses_found"]

    for a1, a2 in zip(res1["attempts"], res2["attempts"]):
        assert a1["mutation_operator"] == a2["mutation_operator"]
        assert a1["description"] == a2["description"]
        assert a1["verdict"] == a2["verdict"]
        assert a1["is_bypass"] == a2["is_bypass"]


def test_campaign_finds_known_weakness(test_db):
    """Seed with wildcard search; feedback detects excessive_data_access, mutates query, and discovers bypass."""
    res = run_discovery_campaign(
        db=test_db,
        budget=4,
        seed=42,
        defense="gateway",
        seed_scenarios=["excessive_access_wildcard"],
    )
    assert res["trials_executed"] <= 4
    assert res["bypasses_found"] >= 1
    # Check that at least one attempt achieved a bypass
    bypass_attempts = [a for a in res["attempts"] if a["is_bypass"]]
    assert len(bypass_attempts) >= 1
    assert any("evade syntax filter" in a["description"] for a in bypass_attempts)

    # D. Every bypass found by a campaign is saved as a regression scenario and rerun automatically against each defense
    for bp in bypass_attempts:
        assert "regression_scenario_file" in bp
        assert "regression_runs" in bp
        assert "none" in bp["regression_runs"]
        assert "hardening" in bp["regression_runs"]
        assert "gateway" in bp["regression_runs"]
        # Verify regression scenario file exists
        reg_file = Path(bp["regression_scenario_file"])
        assert reg_file.exists()


def test_campaign_api_endpoints(client, test_db):
    payload = {
        "budget": 3,
        "seed": 42,
        "defense": "gateway",
        "seed_scenarios": ["excessive_access_wildcard"],
    }
    create_resp = client.post("/api/campaigns", json=payload)
    assert create_resp.status_code == 200
    data = create_resp.json()
    assert "campaign_id" in data
    assert data["trials_executed"] == 3
    cid = data["campaign_id"]

    list_resp = client.get("/api/campaigns")
    assert list_resp.status_code == 200
    campaigns = list_resp.json()
    assert any(c["campaign_id"] == cid for c in campaigns)

    detail_resp = client.get(f"/api/campaigns/{cid}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["campaign_id"] == cid
    assert len(detail["attempts"]) == 3
