#!/usr/bin/env python3
"""CLI runner for Autonomous Attack Discovery campaigns."""

import argparse
import json
import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.db.session import SessionLocal, init_db
from app.discovery.campaign import run_discovery_campaign


def main():
    parser = argparse.ArgumentParser(description="Run autonomous attack discovery campaign.")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic seed integer (default: 42)")
    parser.add_argument("--budget", type=int, default=10, help="Attempt budget (1-200, default: 10)")
    parser.add_argument("--defense", type=str, default="gateway", help="Target defense: none | gateway | hardening (default: gateway)")
    parser.add_argument("--scenarios", type=str, default=None, help="Comma-separated seed scenario IDs")
    parser.add_argument("--stop-after-bypasses", type=int, default=None, help="Early stop after N bypasses found")

    args = parser.parse_args()

    seed_scenarios = [s.strip() for s in args.scenarios.split(",") if s.strip()] if args.scenarios else None

    init_db()
    with SessionLocal() as db:
        print(f"=== Starting Discovery Campaign (Seed={args.seed}, Budget={args.budget}, Defense={args.defense}) ===")
        res = run_discovery_campaign(
            db=db,
            budget=args.budget,
            seed=args.seed,
            defense=args.defense,
            seed_scenarios=seed_scenarios,
            stop_after_bypasses=args.stop_after_bypasses,
        )

        print(f"Campaign ID: {res['campaign_id']}")
        print(f"Status: {res['status']}")
        print(f"Attempts: {res['trials_executed']} (Valid: {res['valid']}, Invalid: {res['invalid']}, Blocked: {res['blocked']})")
        print(f"Bypasses Found: {res['bypasses_found']}")
        print()

        print("Attempts Log:")
        print(f"{'#':<4} | {'Operator':<12} | {'Verdict':<15} | {'Bypass':<7} | {'Severity':<9} | Description")
        print("-" * 90)
        for a in res["attempts"]:
            bp_str = "YES" if a["is_bypass"] else "no"
            print(f"{a['attempt_number']:<4} | {a['operator']:<12} | {a['verdict']:<15} | {bp_str:<7} | {a.get('severity') or 'N/A':<9} | {a['description']}")

        print()
        print("Summary:")
        print(f"  Bypasses by operator: {res['bypasses_by_operator']}")
        print(f"  Rules that blocked most: {res['rules_that_blocked_most']}")


if __name__ == "__main__":
    main()
