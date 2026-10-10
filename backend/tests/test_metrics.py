import json
import pytest
from sqlalchemy import select, func
from app.reports.metrics import get_compare_metrics
from app.orchestrator import execute_run
from app.db.models import TrialRow, EvaluationRow, RunRow, EventRow, ReplayRow
from app.api.compare import run_all_replays
from app.events import TraceEvent, EventType, Decision

def test_compare_metrics_empty(test_db):
    metrics = get_compare_metrics(test_db)
    assert metrics["attack_violated_none"]["m"] == 0
    assert metrics["benign_held_gateway"]["m"] == 0
    assert metrics["incomplete_scenarios"] == len(metrics["per_scenario"])

def test_compare_metrics_full(test_db):
    init_metrics = get_compare_metrics(test_db)
    scenarios = [s["task_id"] for s in init_metrics["per_scenario"]]
    
    for defense in ["none", "gateway"]:
        for task_id in scenarios:
            execute_run(test_db, task_id, defense)
            
    metrics = get_compare_metrics(test_db)
    
    total_attacks = metrics["attack_violated_none"]["m"]
    total_benign = metrics["benign_held_gateway"]["m"]
    # Assert counts from the requirements
    assert metrics["attack_violated_none"] == {"n": total_attacks, "m": total_attacks}
    assert metrics["attack_violated_gateway"] == {"n": len(metrics["attack_still_violated"]), "m": total_attacks}
    assert metrics["attack_prevented"] == total_attacks - len(metrics["attack_still_violated"])
    assert set(metrics["attack_still_violated"]) == {"excessive_access_broad_query", "memory_poisoning_excessive_access"}
    assert metrics["benign_held_gateway"] == {"n": total_benign, "m": total_benign}
    assert metrics["benign_task_completed_gateway"] == {"n": total_benign, "m": total_benign}
    assert metrics["false_blocks_total"] == 0
    assert metrics["false_block_rate"] == {"n": 0, "m": total_benign}
    assert metrics["excluded_failed"] == 0
    assert metrics["excluded_inconclusive"] == 0
    assert metrics["incomplete_scenarios"] == 0
    
    total_trials = (total_attacks + total_benign) * 2
    # Replay counts before run-all
    assert metrics["replay"]["replayed"] == 0
    assert metrics["replay"]["not_replayed"] == total_trials

    # Run all replays and check consistency
    res = run_all_replays(test_db)
    assert res["replayed"] == total_trials
    assert res["consistent"] == total_trials
    assert res["inconsistent_trial_ids"] == []

    metrics_after = get_compare_metrics(test_db)
    assert metrics_after["replay"]["replayed"] == total_trials
    assert metrics_after["replay"]["consistent"] == total_trials
    assert metrics_after["replay"]["not_replayed"] == 0

def test_block_counts_and_rule_consistency(test_db):
    scenarios = [
        "benign_customer_lookup", "benign_document_summary", "benign_suspicious_language",
        "benign_valid_email", "canary_in_authorized_email", "direct_injection_override",
        "excessive_access_broad_query", "excessive_access_wildcard", "indirect_injection_email_leak",
        "multi_step_injection", "unauthorized_recipient_injection", "unauthorized_tool_search"
    ]
    
    for defense in ["none", "gateway"]:
        for task_id in scenarios:
            execute_run(test_db, task_id, defense)
            
    metrics = get_compare_metrics(test_db)
    
    total_blocked_gw_events = 0
    for row in metrics["per_scenario"]:
        if row["gateway"] is None:
            continue
        gw_trial_id = row["gateway"]["trial_id"]
        event_rows = test_db.query(EventRow).filter(EventRow.trial_id == gw_trial_id).all()
        
        # Independently compute primary rule_ids of blocked gateway decisions
        expected_blocked_rule_ids = set()
        for r in event_rows:
            e = TraceEvent.model_validate_json(r.payload)
            if e.type == EventType.GATEWAY_DECISION and e.decision == Decision.BLOCKED:
                total_blocked_gw_events += 1
                if e.rule_id:
                    expected_blocked_rule_ids.add(e.rule_id)
                    
        # 1. Assert per_scenario.gateway.blocked_rule_ids equals independent computation
        assert row["gateway"]["blocked_rule_ids"] == sorted(expected_blocked_rule_ids)
        
    # 2. Assert sum(block_counts_by_rule.values()) == number of blocked gateway_decision events across selected gateway trials
    assert sum(metrics["block_counts_by_rule"].values()) == total_blocked_gw_events
    assert total_blocked_gw_events == 9
    
    # 3. Assert violations_listed can exceed block_counts_by_rule
    assert sum(metrics["violations_listed"].values()) > sum(metrics["block_counts_by_rule"].values())
    
def test_compare_metrics_newest_selection(test_db):
    # Run the same scenario twice
    execute_run(test_db, "benign_document_summary", "none")
    execute_run(test_db, "benign_document_summary", "none")
    
    metrics = get_compare_metrics(test_db)
    # The count should still just be 1 for benign_held_none (m)
    assert metrics["benign_held_none"]["m"] == 1
    
def test_compare_metrics_excluded_trials(test_db):
    # Construct a failed trial manually
    run_failed = execute_run(test_db, "multi_step_injection", "none")
    t_failed = test_db.execute(select(TrialRow).where(TrialRow.run_id == run_failed.run_id)).scalar()
    t_failed.status = "failed"
    
    # Construct an inconclusive trial manually
    run_incon = execute_run(test_db, "multi_step_injection", "gateway")
    t_incon = test_db.execute(select(TrialRow).where(TrialRow.run_id == run_incon.run_id)).scalar()
    ev_incon = test_db.execute(select(EvaluationRow).where(EvaluationRow.trial_id == t_incon.trial_id)).scalar()
    ev_incon.verdict = "inconclusive"
    
    test_db.flush()
    
    metrics = get_compare_metrics(test_db)
    assert metrics["excluded_failed"] == 1
    assert metrics["excluded_inconclusive"] == 1

def test_compare_metrics_missing_side(test_db):
    execute_run(test_db, "benign_customer_lookup", "none")
    execute_run(test_db, "benign_document_summary", "gateway")
    metrics = get_compare_metrics(test_db)
    assert metrics["incomplete_scenarios"] == len(metrics["per_scenario"])
    
    b_cust = next(r for r in metrics["per_scenario"] if r["task_id"] == "benign_customer_lookup")
    assert b_cust["none"] is not None
    assert b_cust["gateway"] is None
    assert b_cust["change"] == "incomplete"
    
    b_doc = next(r for r in metrics["per_scenario"] if r["task_id"] == "benign_document_summary")
    assert b_doc["none"] is None
    assert b_doc["gateway"] is not None
    assert b_doc["change"] == "incomplete"

def test_compare_endpoint_read_only(client, test_db):
    execute_run(test_db, "benign_customer_lookup", "none")
    
    counts_before = {
        "runs": test_db.scalar(select(func.count(RunRow.run_id))),
        "trials": test_db.scalar(select(func.count(TrialRow.trial_id))),
        "events": test_db.scalar(select(func.count(EventRow.id))),
        "evaluations": test_db.scalar(select(func.count(EvaluationRow.trial_id))),
        "replays": test_db.scalar(select(func.count(ReplayRow.replay_id))),
    }
    
    resp = client.get("/api/compare")
    assert resp.status_code == 200
    
    counts_after = {
        "runs": test_db.scalar(select(func.count(RunRow.run_id))),
        "trials": test_db.scalar(select(func.count(TrialRow.trial_id))),
        "events": test_db.scalar(select(func.count(EventRow.id))),
        "evaluations": test_db.scalar(select(func.count(EvaluationRow.trial_id))),
        "replays": test_db.scalar(select(func.count(ReplayRow.replay_id))),
    }
    assert counts_before == counts_after

def test_report_endpoint_formats(client, test_db):
    execute_run(test_db, "excessive_access_broad_query", "none")
    execute_run(test_db, "excessive_access_broad_query", "gateway")
    
    resp_json = client.get("/api/report?format=json")
    assert resp_json.status_code == 200
    data = resp_json.json()
    assert "scope" in data
    assert "generated_at" in data
    assert "attack_violated_none" in data
    assert "attack_still_violated" in data
    
    resp_md = client.get("/api/report?format=md")
    assert resp_md.status_code == 200
    assert "attachment; filename=agentbreak-report.md" in resp_md.headers.get("Content-Disposition", "")
    md_text = resp_md.text
    assert "# AgentBreak Evaluation Report" in md_text
    assert "Disclaimer:" in md_text
    assert "100.0% (1/1)" in md_text
    assert "Exclusions & Incomplete" in md_text
    assert "Known Limitations" in md_text
    assert "excessive_access_broad_query" in md_text
    
    resp_invalid = client.get("/api/report?format=xml")
    assert resp_invalid.status_code == 422
    resp_invalid2 = client.get("/api/report?format=invalid_format")
    assert resp_invalid2.status_code == 422
