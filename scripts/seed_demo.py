#!/usr/bin/env python3
"""Seed Demo script for AgentBreak.

Prepopulates the AgentBreak database with complete telemetry before a demo:
1. Runs the full benchmark matrix (defenses: none and gateway) across all scenarios.
2. Executes an autonomous discovery campaign with fixed seed=42 and budget=60,
   seeded from the attacks that the Security Gateway blocks.
3. Provides a --reset flag to drop and recreate the database schema for clean re-demos.

Usage:
  python scripts/seed_demo.py [--reset] [--budget 60] [--seed 42]
"""

import argparse
import os
import sys

# Ensure backend package is in python path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(repo_root, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.agent.tasks import list_tasks
from app.db.models import Base
from app.db.session import SessionLocal, engine, init_db
from app.discovery.campaign import run_discovery_campaign
from app.orchestrator import execute_run


def reset_database() -> None:
    """Drop and recreate all tables cleanly."""
    print("[*] Resetting AgentBreak database...", flush=True)
    Base.metadata.drop_all(bind=engine)
    init_db()
    print("[+] Database schema successfully reset and initialized.", flush=True)


def seed_matrix(db) -> list[str]:
    """Execute the full benchmark matrix across none and gateway defenses.

    Returns the list of attack scenario IDs blocked by the gateway.
    """
    print("\n" + "=" * 60, flush=True)
    print("[1/2] Seeding benchmark matrix (defenses: none, gateway)...", flush=True)
    print("=" * 60, flush=True)

    tasks = list_tasks()
    defenses = ["none", "gateway"]
    gateway_blocked_attacks: list[str] = []

    for task in tasks:
        task_id = task.task_id
        for defense in defenses:
            run_row = execute_run(db, task_id=task_id, defense=defense, backend="scripted")
            trial = run_row.trials[0]
            verdict = trial.evaluation.verdict if trial.evaluation else "unknown"

            if task.kind == "attack" and defense == "gateway" and verdict == "held":
                gateway_blocked_attacks.append(task_id)

            status_char = "PASS" if verdict == task.expected.get(defense, {}).get("verdict") else "WARN"
            print(f"  [{status_char}] {task_id:<36} | {defense:<8} -> {verdict}", flush=True)

    print(f"\n[+] Matrix seeding finished: {len(tasks) * len(defenses)} runs recorded.", flush=True)
    print(f"[+] Found {len(gateway_blocked_attacks)} attacks blocked by Security Gateway.", flush=True)
    return gateway_blocked_attacks


def seed_campaign(db, seed_scenarios: list[str], budget: int = 60, seed: int = 42) -> dict:
    """Run discovery campaign against the gateway defense."""
    print("\n" + "=" * 60, flush=True)
    print(f"[2/2] Running autonomous discovery campaign (budget={budget}, seed={seed})...", flush=True)
    print(f"      Seeded from {len(seed_scenarios)} gateway-blocked attacks.", flush=True)
    print("=" * 60, flush=True)

    camp_res = run_discovery_campaign(
        db=db,
        budget=budget,
        seed=seed,
        defense="gateway",
        seed_scenarios=seed_scenarios,
        backend="scripted",
    )

    bypasses = camp_res.get("bypasses_found", 0)
    trials = camp_res.get("trials_executed", 0)
    by_op = camp_res.get("bypasses_by_operator", {})

    print(f"\n[+] Discovery campaign finished!", flush=True)
    print(f"    Campaign ID:    {camp_res.get('campaign_id')}", flush=True)
    print(f"    Total Trials:   {trials}", flush=True)
    print(f"    Valid Exploits: {camp_res.get('valid', 0)}", flush=True)
    print(f"    Blocked Count:  {camp_res.get('blocked', 0)}", flush=True)
    print(f"    Bypasses Found: {bypasses}", flush=True)
    if by_op:
        print("    Bypasses by Operator:", flush=True)
        for op, cnt in by_op.items():
            print(f"      - {op:<16}: {cnt}", flush=True)

    return camp_res


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepopulate AgentBreak database for demo.")
    parser.add_argument("--reset", action="store_true", help="Recreate database from scratch")
    parser.add_argument("--budget", type=int, default=60, help="Campaign search budget (default: 60)")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic PRNG seed (default: 42)")
    args = parser.parse_args()

    if args.reset:
        reset_database()
    else:
        init_db()

    db = SessionLocal()
    try:
        gateway_blocked = seed_matrix(db)
        if not gateway_blocked:
            gateway_blocked = [t.task_id for t in list_tasks() if t.kind == "attack"]

        seed_campaign(db, seed_scenarios=gateway_blocked, budget=args.budget, seed=args.seed)

        print("\n" + "=" * 60, flush=True)
        print("[SUCCESS] AgentBreak demo environment is fully populated and ready!", flush=True)
        print("=" * 60, flush=True)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
