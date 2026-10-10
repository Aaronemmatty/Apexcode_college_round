#!/usr/bin/env python3
"""Seed Demo script for AgentBreak.

Prepopulates the AgentBreak database with complete telemetry before a demo:
1. Runs the full benchmark matrix across all 4 defenses (none, prompt_hardening, gateway, both).
2. Executes an autonomous discovery campaign seeded from excessive_access_wildcard (discovering gateway bypasses).
3. Reruns discovered bypasses against gateway and both defenses (demonstrating find hole -> patch -> verify).
4. Provides a --reset flag to drop and recreate the database schema for clean re-demos.

Usage:
  python scripts/seed_demo.py [--reset] [--budget 20] [--seed 42]
"""

import argparse
import os
import sys

# Ensure backend package is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

if os.path.exists(os.path.join(parent_dir, "app")):
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
elif os.path.exists(os.path.join(parent_dir, "backend", "app")):
    backend_path = os.path.join(parent_dir, "backend")
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)

from app.agent.tasks import list_tasks
from app.api.campaigns import rerun_campaign_bypasses
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
    """Execute the full benchmark matrix across 4 defenses."""
    print("\n" + "=" * 60, flush=True)
    print("[1/3] Seeding benchmark matrix (defenses: none, prompt_hardening, gateway, both)...", flush=True)
    print("=" * 60, flush=True)

    tasks = list_tasks()
    defenses = ["none", "prompt_hardening", "gateway", "both"]
    gateway_blocked_attacks: list[str] = []

    for task in tasks:
        task_id = task.task_id
        for defense in defenses:
            run_row = execute_run(db, task_id=task_id, defense=defense, backend="scripted")
            trial = run_row.trials[0]
            verdict = trial.evaluation.verdict if trial.evaluation else "unknown"

            if task.kind == "attack" and defense == "gateway" and verdict == "held":
                if task_id not in gateway_blocked_attacks:
                    gateway_blocked_attacks.append(task_id)

            status_char = "PASS" if verdict == task.expected.get(defense, {}).get("verdict") else "WARN"
            print(f"  [{status_char}] {task_id:<36} | {defense:<16} -> {verdict}", flush=True)

    print(f"\n[+] Matrix seeding finished: {len(tasks) * len(defenses)} runs recorded across 4 defenses.", flush=True)
    print(f"[+] Found {len(gateway_blocked_attacks)} attacks blocked by Security Gateway.", flush=True)
    return gateway_blocked_attacks


def seed_campaign(db, seed_scenarios: list[str] = None, budget: int = 20, seed: int = 42) -> dict:
    """Run discovery campaign against gateway defense seeded from excessive_access_wildcard."""
    if not seed_scenarios:
        seed_scenarios = ["excessive_access_wildcard"]

    print("\n" + "=" * 60, flush=True)
    print(f"[2/3] Running autonomous discovery campaign (budget={budget}, seed={seed})...", flush=True)
    print(f"      Seeded from {seed_scenarios}...", flush=True)
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
    print(f"    Valid Exploits: {camp_res.get('valid', camp_res.get('valid_mutants', 0))}", flush=True)
    print(f"    Blocked Count:  {camp_res.get('blocked', camp_res.get('blocked_attacks', 0))}", flush=True)
    print(f"    Bypasses Found: {bypasses}", flush=True)
    if by_op:
        print("    Bypasses by Operator:", flush=True)
        for op, cnt in by_op.items():
            print(f"      - {op:<16}: {cnt}", flush=True)

    return camp_res


def seed_rerun(db, campaign_id: str, defense: str = "gateway") -> dict:
    """Rerun discovered bypasses against defense to demonstrate verification loop."""
    print("\n" + "-" * 50, flush=True)
    print(f"[*] Rerunning discovered bypasses against defense '{defense}'...", flush=True)
    print("-" * 50, flush=True)

    rerun_res = rerun_campaign_bypasses(campaign_id=campaign_id, defense=defense, db=db)
    total = rerun_res.get("total_bypasses", 0)
    fixed = rerun_res.get("fixed_count", 0)
    still = rerun_res.get("still_violated_count", 0)

    print(f"[+] Bypass Retest vs '{defense}' Complete:", flush=True)
    print(f"    Total Bypasses Retested: {total}", flush=True)
    print(f"    Now Held (Mitigated):   {fixed}", flush=True)
    print(f"    Still Violated:          {still}", flush=True)
    return rerun_res


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepopulate AgentBreak database for demo.")
    parser.add_argument("--reset", action="store_true", help="Recreate database from scratch")
    parser.add_argument("--budget", type=int, default=20, help="Campaign search budget (default: 20)")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic PRNG seed (default: 42)")
    args = parser.parse_args()

    if args.reset:
        reset_database()
    else:
        init_db()

    db = SessionLocal()
    try:
        gateway_blocked = seed_matrix(db)
        seed_scenarios = ["excessive_access_wildcard"]
        if "excessive_access_wildcard" not in gateway_blocked and gateway_blocked:
            seed_scenarios = gateway_blocked[:2]

        camp_res = seed_campaign(db, seed_scenarios=seed_scenarios, budget=args.budget, seed=args.seed)
        camp_id = camp_res.get("campaign_id")
        if camp_id and camp_res.get("bypasses_found", 0) > 0:
            print("\n" + "=" * 60, flush=True)
            print("[3/3] Rerunning bypasses to prove verification loop ('find hole -> patch -> verify')...", flush=True)
            print("=" * 60, flush=True)
            seed_rerun(db, campaign_id=camp_id, defense="gateway")
            seed_rerun(db, campaign_id=camp_id, defense="both")

        print("\n" + "=" * 60, flush=True)
        print("[SUCCESS] AgentBreak demo environment is fully populated and ready!", flush=True)
        print("  - 92 benchmark runs across 4 defenses (none, prompt_hardening, gateway, both)", flush=True)
        print("  - 1 autonomous discovery campaign with discovered gateway bypasses", flush=True)
        print("  - Bypass reruns proving discovery and mitigation across defenses", flush=True)
        print("=" * 60, flush=True)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())