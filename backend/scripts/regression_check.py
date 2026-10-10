"""Regression CLI for AgentBreak.

Verifies that security defenses do not regress previously held attacks
or break benign tasks.
"""

import argparse
from datetime import datetime, timezone
import json
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.tasks import list_tasks, get_task
from app.db.session import init_db, SessionLocal
from app.orchestrator import execute_run


def build_baseline(db, baseline_path: str, defenses: list[str]) -> dict:
    """Generate and save baseline file of held attacks and passing benign tasks."""
    tasks = list_tasks()
    entries = []

    print(f"Generating regression baseline across {len(tasks)} tasks and defenses {defenses}...")

    for task in tasks:
        for defense in defenses:
            try:
                run = execute_run(db, task.task_id, defense=defense, backend="scripted")
                trial = run.trials[0]
                ev = trial.evaluation
                if not ev:
                    continue

                actual_verdict = ev.verdict
                eval_data = json.loads(ev.result_json) if ev.result_json else {}
                task_comp = eval_data.get("task_completed", True)
                false_blocks = eval_data.get("false_blocks", 0)

                # Include:
                # 1. Attacks that were HELD under this defense
                # 2. Benign tasks that completed successfully without false blocks
                if task.kind == "attack" and actual_verdict == "held":
                    entries.append({
                        "task_id": task.task_id,
                        "title": task.title,
                        "kind": "attack",
                        "defense": defense,
                        "baseline_verdict": "held",
                        "task_completed": task_comp,
                        "false_blocks": false_blocks,
                    })
                elif task.kind == "benign" and actual_verdict == "held":
                    entries.append({
                        "task_id": task.task_id,
                        "title": task.title,
                        "kind": "benign",
                        "defense": defense,
                        "baseline_verdict": "held",
                        "task_completed": task_comp,
                        "false_blocks": false_blocks,
                    })
            except Exception as exc:
                print(f"Error evaluating {task.task_id} under {defense}: {exc}")

    baseline_data = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "total_baseline_checks": len(entries),
        "defenses": defenses,
        "entries": entries,
    }

    with open(baseline_path, "w", encoding="utf-8") as f:
        json.dump(baseline_data, f, indent=2)

    print(f"Successfully saved {len(entries)} baseline verification entries to '{baseline_path}'.")
    return baseline_data


def run_regression_check(db, baseline_path: str) -> int:
    """Check current state against baseline file. Return exit code (0 = success, 1 = regression)."""
    if not os.path.exists(baseline_path):
        print(f"ERROR: Baseline file '{baseline_path}' not found. Run with --save first.")
        return 1

    with open(baseline_path, "r", encoding="utf-8") as f:
        baseline_data = json.load(f)

    entries = baseline_data.get("entries", [])
    print(f"Loaded {len(entries)} baseline checks from '{baseline_path}'. Rerunning verification...")

    regressions = []
    passed_checks = []

    for item in entries:
        tid = item["task_id"]
        defense = item["defense"]
        kind = item["kind"]
        expected_verdict = item["baseline_verdict"]

        try:
            run = execute_run(db, tid, defense=defense, backend="scripted")
            trial = run.trials[0]
            ev = trial.evaluation
            if not ev:
                regressions.append({
                    "task_id": tid,
                    "defense": defense,
                    "kind": kind,
                    "expected": expected_verdict,
                    "actual": "NO_EVALUATION",
                    "reason": "Trial failed to produce an evaluation row",
                })
                continue

            actual_verdict = ev.verdict
            eval_data = json.loads(ev.result_json) if ev.result_json else {}
            task_comp = eval_data.get("task_completed", True)
            false_blocks = eval_data.get("false_blocks", 0)

            # Check regression rules:
            # 1. Attack previously held is now violated
            # 2. Benign task fails (verdict != held, task not completed, or false blocks detected)
            has_regression = False
            reasons = []

            if kind == "attack":
                if actual_verdict != "held":
                    has_regression = True
                    reasons.append(f"Attack regressed to '{actual_verdict}' (expected 'held')")
            else:
                if actual_verdict != "held":
                    has_regression = True
                    reasons.append(f"Benign verdict regressed to '{actual_verdict}'")
                if not task_comp:
                    has_regression = True
                    reasons.append("Benign task_completed was False")
                if false_blocks > 0:
                    has_regression = True
                    reasons.append(f"Benign task incurred {false_blocks} false block(s)")

            if has_regression:
                regressions.append({
                    "task_id": tid,
                    "defense": defense,
                    "kind": kind,
                    "expected": expected_verdict,
                    "actual": actual_verdict,
                    "reason": "; ".join(reasons),
                })
            else:
                passed_checks.append({
                    "task_id": tid,
                    "defense": defense,
                    "kind": kind,
                    "verdict": actual_verdict,
                })

        except Exception as exc:
            regressions.append({
                "task_id": tid,
                "defense": defense,
                "kind": kind,
                "expected": expected_verdict,
                "actual": "CRASH",
                "reason": str(exc),
            })

    print("\n" + "=" * 90)
    print(f"REGRESSION CHECK RESULTS: {len(passed_checks)} PASSED, {len(regressions)} REGRESSED")
    print("=" * 90)

    if regressions:
        print("\nREGRESSION TABLE (DEFECTS DETECTED):")
        print(f"{'Task ID':<35} | {'Defense':<16} | {'Kind':<8} | {'Expected':<10} | {'Actual':<10} | {'Reason'}")
        print("-" * 110)
        for r in regressions:
            print(f"{r['task_id']:<35} | {r['defense']:<16} | {r['kind']:<8} | {r['expected']:<10} | {r['actual']:<10} | {r['reason']}")

        print(f"\nFAILURE: {len(regressions)} regressions detected. Exit code 1.")
        return 1
    else:
        print(f"\nSUCCESS: All {len(passed_checks)} baseline security invariants held across defenses.")
        return 0


def main():
    parser = argparse.ArgumentParser(description="AgentBreak Regression Check CLI")
    parser.add_argument("--save", action="store_true", help="Generate and save baseline file from current runs")
    parser.add_argument("--baseline", default="regression_baseline.json", help="Path to baseline file")
    parser.add_argument(
        "--defenses",
        nargs="+",
        default=["prompt_hardening", "gateway", "both"],
        help="Defenses to include when saving baseline (default: prompt_hardening gateway both)",
    )

    args = parser.parse_args()

    init_db()
    db = SessionLocal()

    if args.save:
        build_baseline(db, args.baseline, args.defenses)
        sys.exit(0)
    else:
        code = run_regression_check(db, args.baseline)
        sys.exit(code)


if __name__ == "__main__":
    main()
