#!/usr/bin/env python3
"""Manual check script for running attacks against real Ollama model.

Usage:
  python scripts/try_ollama.py [--url http://localhost:11434] [--model qwen2.5:7b] [--n-runs 2]
"""

import argparse
import os
import sys

# Ensure backend package is in python path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(repo_root, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.agent.ollama import check_ollama_available
from app.db.session import SessionLocal, init_db
from app.orchestrator import execute_run


def main() -> int:
    parser = argparse.ArgumentParser(description="Run manual checks against Ollama model.")
    parser.add_argument("--url", default="http://localhost:11434", help="Ollama base URL")
    parser.add_argument("--model", default="qwen2.5:7b", help="Ollama model tag")
    parser.add_argument("--n-runs", type=int, default=1, help="Number of repetitions per scenario (default 1 for fast check)")
    args = parser.parse_args()

    print(f"Checking Ollama connectivity at {args.url} with model '{args.model}'...", flush=True)
    available, error_msg = check_ollama_available(url=args.url, model=args.model)

    if not available:
        print("\n" + "=" * 60, flush=True)
        print("[-] NOTICE: Ollama is not available for live testing.", flush=True)
        print(f"    Details: {error_msg}", flush=True)
        print("    To run manual checks with a real model:", flush=True)
        print(f"      1. Start Ollama: ollama serve", flush=True)
        print(f"      2. Pull model:   ollama pull {args.model}", flush=True)
        print("      3. Rerun this script.", flush=True)
        print("=" * 60, flush=True)
        return 0

    print("[+] Ollama service and model verified!", flush=True)
    init_db()
    db = SessionLocal()

    # The 2 canonical attack scenarios to check
    scenarios_to_test = [
        "direct_injection_override",
        "canary_leak_via_customer_email",
    ]

    try:
        for scenario_id in scenarios_to_test:
            print(f"\n---> Running attack: {scenario_id} ({args.n_runs} runs)", flush=True)
            for defense in ["none", "gateway"]:
                print(f"     [Defense: {defense}] executing with {args.model}...", flush=True)
                run_row = execute_run(
                    db=db,
                    task_id=scenario_id,
                    defense=defense,
                    backend="ollama",
                    backend_config={"url": args.url, "model": args.model},
                    n_runs=args.n_runs,
                )
                violated = sum(1 for t in run_row.trials if t.evaluation and t.evaluation.verdict == "violated")
                held = sum(1 for t in run_row.trials if t.evaluation and t.evaluation.verdict == "held")
                inconclusive = sum(1 for t in run_row.trials if t.evaluation and t.evaluation.verdict == "inconclusive")
                total = len(run_row.trials)
                print(f"     Result: violated {violated}/{total} (held {held}, inconclusive {inconclusive})", flush=True)
                for idx, t in enumerate(run_row.trials, 1):
                    v = t.evaluation.verdict if t.evaluation else "none"
                    print(f"       Trial #{idx} ({t.trial_id}): {v} | events: {len(t.events)}", flush=True)

        print("\n[+] Manual Ollama check completed successfully.", flush=True)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
