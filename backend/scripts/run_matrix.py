"""Run deterministic benchmark matrix."""

import sys
import os
import json

# Add backend dir to path so we can run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import sessionmaker
from app.db.models import Base
from app.db.session import engine, SessionLocal, init_db
from app.agent.tasks import list_tasks
from app.orchestrator import execute_run

def main():
    init_db()
    db = SessionLocal()

    tasks = list_tasks()
    defenses = ["none", "gateway"]

    all_passed = True
    results = []

    for task in tasks:
        print(f"\nRunning {task.task_id}...")
        for defense in defenses:
            try:
                run = execute_run(db, task.task_id, defense)
                trial = run.trials[0]
                eval_row = trial.evaluation
                if not eval_row:
                    print(f"  [{defense}] ERROR: No evaluation produced")
                    all_passed = False
                    continue
                
                actual_verdict = eval_row.verdict
                
                expected = task.expected
                expected_verdict = expected[defense]["verdict"]
                
                if actual_verdict != expected_verdict:
                    print(f"  [{defense}] FAIL: Expected {expected_verdict}, got {actual_verdict}")
                    all_passed = False
                else:
                    print(f"  [{defense}] PASS: {actual_verdict}")
                from app.db.models import EventRow
                from app.events import TraceEvent, EventType, Decision
                event_rows = db.query(EventRow).filter(EventRow.trial_id == trial.trial_id).all()
                blocked_rule_ids = set()
                for r in event_rows:
                    e = TraceEvent.model_validate_json(r.payload)
                    if e.type == EventType.GATEWAY_DECISION and getattr(e, 'decision', None) == Decision.BLOCKED:
                        if getattr(e, 'rule_id', None):
                            blocked_rule_ids.add(e.rule_id)
                blocked_rules_str = ",".join(sorted(blocked_rule_ids)) if blocked_rule_ids else "none"

                results.append({
                    "task_id": task.task_id,
                    "defense": defense,
                    "expected": expected_verdict,
                    "actual": actual_verdict,
                    "blocked_rules": blocked_rules_str,
                    "task_completed": eval_row.task_completed if hasattr(eval_row, 'task_completed') else json.loads(eval_row.result_json).get("task_completed", False),
                    "false_blocks": eval_row.false_blocks if hasattr(eval_row, 'false_blocks') else json.loads(eval_row.result_json).get("false_blocks", 0),
                    "passed": actual_verdict == expected_verdict
                })
            except Exception as e:
                print(f"  [{defense}] CRASH: {str(e)}")
                all_passed = False
                results.append({
                    "task_id": task.task_id,
                    "defense": defense,
                    "expected": task.expected[defense]["verdict"],
                    "actual": "CRASH",
                    "blocked_rules": "CRASH",
                    "task_completed": False,
                    "false_blocks": 0,
                    "passed": False
                })

    print("\nSummary:")
    print(f"{'scenario_id':<35} | {'defense':<10} | {'verdict':<15} | {'blocked_rules':<15} | {'task_completed':<15} | {'false_blocks':<15} | {'OK/MISMATCH'}")
    print("-" * 130)
    for r in results:
        status = "OK" if r["passed"] else "MISMATCH"
        print(f"{r['task_id']:<35} | {r['defense']:<10} | {r['actual']:<15} | {str(r['blocked_rules']):<15} | {str(r['task_completed']):<15} | {str(r['false_blocks']):<15} | {status}")

    if not all_passed:
        print("\nNot all tests passed.")
        sys.exit(1)
    else:
        print("\nAll tests passed successfully.")
        sys.exit(0)

if __name__ == "__main__":
    main()
