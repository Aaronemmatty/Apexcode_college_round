"""Test the full scenario matrix."""

import pytest
import json
from app.agent.tasks import list_tasks
from app.orchestrator import execute_run
from app.events import TraceEvent, EventType, Decision
from app.db.models import EventRow

tasks = list_tasks()
task_ids = [t.task_id for t in tasks]

@pytest.mark.parametrize("defense", ["none", "prompt_hardening", "gateway", "both"])
@pytest.mark.parametrize("task_id", task_ids)
def test_scenario_matrix(test_db, task_id, defense):
    task = next(t for t in tasks if t.task_id == task_id)
    
    # Execute run
    run = execute_run(test_db, task.task_id, defense)
    trial = run.trials[0]
    eval_row = trial.evaluation
    
    assert eval_row is not None, "Evaluation was not produced"
    
    expected = task.expected[defense]
    eval_data = json.loads(eval_row.result_json)
    
    # 1. Verdict
    assert eval_row.verdict == expected["verdict"]
    
    # 2. Violated Invariants
    violated_invariants = {inv["invariant_id"] for inv in eval_data.get("invariants", []) if inv["status"] == "violated"}
    assert violated_invariants == set(expected["violated_invariants"])
    
    # 3. Blocking rule_ids
    event_rows = test_db.query(EventRow).filter(EventRow.trial_id == trial.trial_id).all()
    blocked_rule_ids = set()
    for r in event_rows:
        e = TraceEvent.model_validate_json(r.payload)
        if e.type == EventType.GATEWAY_DECISION and getattr(e, 'decision', None) == Decision.BLOCKED:
            if getattr(e, 'rule_id', None):
                blocked_rule_ids.add(e.rule_id)
    assert blocked_rule_ids == set(expected["blocked_rules"])
    
    # 4. Task completed
    actual_task_completed = eval_row.task_completed if hasattr(eval_row, 'task_completed') else eval_data.get("task_completed", False)
    assert actual_task_completed == expected["task_completed"]
    
    # 5. False blocks
    actual_false_blocks = eval_row.false_blocks if hasattr(eval_row, 'false_blocks') else eval_data.get("false_blocks", 0)
    assert actual_false_blocks == expected["false_blocks"]
