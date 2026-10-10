"""Tests for Tool and Permission Audit and Markdown report export endpoints."""

import json
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal, init_db
from app.db.models import CampaignRow

client = TestClient(app)


def setup_module():
    init_db()


def test_tool_permission_audit_endpoint():
    """Verify GET /api/audit/permissions returns valid tool capabilities and abuse mappings."""
    resp = client.get("/api/audit/permissions")
    assert resp.status_code == 200
    data = resp.json()

    assert "tools" in data
    assert "summary" in data
    assert data["summary"]["total_tools"] == 5
    assert data["summary"]["total_attack_mappings"] >= 15

    tool_names = [t["name"] for t in data["tools"]]
    assert "send_email" in tool_names
    assert "search_customers" in tool_names
    assert "read_document" in tool_names
    assert "save_note" in tool_names
    assert "read_notes" in tool_names

    email_tool = next(t for t in data["tools"] if t["name"] == "send_email")
    assert email_tool["risk_level"] == "CRITICAL"
    assert "recipient_not_allowed" in email_tool["governing_rules"]
    assert email_tool["attack_count"] > 0
    assert len(email_tool["abused_by_attacks"]) > 0


def test_compare_markdown_report_export():
    """Verify GET /api/compare/report?format=md returns complete 4-defense markdown report."""
    resp = client.get("/api/compare/report?format=md")
    assert resp.status_code == 200
    assert "text/markdown" in resp.headers.get("content-type", "")
    assert "attachment; filename=agentbreak-report.md" in resp.headers.get("content-disposition", "")

    content = resp.text
    assert "# AgentBreak Evaluation Report" in content
    assert "Headline Metrics" in content
    assert "4-Defense Comparison" in content
    assert "By Category" in content
    assert "Prompt Hardening" in content
    assert "Gateway" in content
    assert "Both" in content
    assert "Known Limitations" in content


def test_campaign_markdown_report_export():
    """Verify GET /api/campaigns/{id}/report?format=md returns markdown report for a campaign."""
    # Seed a test campaign row
    camp_id = "camp_test_export_123"
    with SessionLocal() as s:
        s.query(CampaignRow).filter(CampaignRow.campaign_id == camp_id).delete()
        dummy_data = {
            "campaign_id": camp_id,
            "defense": "gateway",
            "backend": "scripted",
            "trials_executed": 5,
            "valid_mutants": 4,
            "invalid_mutants": 1,
            "blocked_attacks": 3,
            "bypasses_found": 1,
            "budget": 5,
            "seed": 42,
            "bypasses": [
                {
                    "task_id": "gen_bp_001",
                    "operator": "query_expansion",
                    "severity": "HIGH",
                    "violated_invariants": ["customer_data_access_within_scope"],
                }
            ],
        }
        row = CampaignRow(
            campaign_id=camp_id,
            status="completed",
            defense="gateway",
            budget=5, seed=42, seed_scenarios='[]',
            bypasses_found=1,
            summary_json=json.dumps(dummy_data),
            result_json=json.dumps(dummy_data),
        )
        s.add(row)
        s.commit()

    resp = client.get(f"/api/campaigns/{camp_id}/report?format=md")
    assert resp.status_code == 200
    assert "text/markdown" in resp.headers.get("content-type", "")
    assert f"agentbreak-campaign-{camp_id}-report.md" in resp.headers.get("content-disposition", "")

    content = resp.text
    assert "# AgentBreak Autonomous Discovery Campaign Report" in content
    assert camp_id in content
    assert "Discovered Bypasses & Deterministic Remediation" in content
    assert "gen_bp_001" in content
    assert "customer_data_access_within_scope" in content
    assert "Platform Limitations & Boundaries" in content