"""Autonomous attack discovery campaign loop.

A budgeted, evaluator-guided search that mutates existing attacks,
runs them in the in-process sandbox, and learns from which gateway rule blocked each attempt.
"""

from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import random
from typing import Any
import uuid

from sqlalchemy.orm import Session

from app.agent.tasks import TaskSpec, get_task, list_tasks
from app.db.models import Base, CampaignRow, EventRow, GeneratedTaskRow, TrialRow
from app.discovery.mutator import OPERATORS, mutate
from app.evaluator.severity import derive_severity
from app.events import Decision, EventType, TraceEvent
from app.orchestrator import execute_run


def _task_content_hash(task: TaskSpec) -> str:
    """Compute hash of plan steps and document contents to skip duplicates."""
    plan_sig = tuple((s.tool, tuple(sorted(s.arguments.items())), str(s.source)) for s in task.plan)
    docs_sig = tuple(sorted((k, v.get("title", ""), v.get("content", "")) for k, v in task.documents.items()))
    raw = repr((plan_sig, docs_sig)).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _choose_guided_operator(last_blocked_rules: list[str], rng: random.Random) -> str:
    """Select operator family targeting the specific gateway rule that blocked previous attempt."""
    if not last_blocked_rules:
        return rng.choice(OPERATORS)

    if "excessive_data_access" in last_blocked_rules:
        return "query" if rng.random() < 0.8 else rng.choice(["placement", "syntax"])
    elif "recipient_not_allowed" in last_blocked_rules:
        return "recipient" if rng.random() < 0.8 else rng.choice(["syntax", "placement"])
    elif "tool_not_allowed" in last_blocked_rules:
        return rng.choice(["tool", "placement"]) if rng.random() < 0.8 else "syntax"
    elif "canary_in_outbound" in last_blocked_rules:
        return rng.choice(["placement", "syntax", "recipient"])
    
    return rng.choice(OPERATORS)


def run_discovery_campaign(
    db: Session,
    budget: int = 10,
    seed: int = 42,
    defense: str = "gateway",
    seed_scenarios: list[str] | None = None,
    stop_after_bypasses: int | None = None,
) -> dict[str, Any]:
    """Execute autonomous red team discovery campaign guided by gateway feedback."""
    Base.metadata.create_all(bind=db.get_bind())

    # Hard budget cap at 200
    effective_budget = max(1, min(budget, 200))
    rng = random.Random(seed)

    campaign_id = f"camp_{uuid.UUID(int=rng.getrandbits(128)).hex[:8]}"

    # Load seed attack scenarios
    if seed_scenarios:
        seed_tasks = [t for sid in seed_scenarios if (t := get_task(sid, db=db))]
    else:
        seed_tasks = [t for t in list_tasks() if t.kind == "attack"]

    if not seed_tasks:
        seed_tasks = [t for t in list_tasks() if t.kind == "attack"]

    attempts: list[dict[str, Any]] = []
    bypasses: list[dict[str, Any]] = []
    blocked_attempts: list[TaskSpec] = []
    rule_block_counts: dict[str, int] = defaultdict(int)
    bypasses_by_operator: dict[str, int] = defaultdict(int)
    seen_hashes: set[str] = set()

    # Track seed tasks hashes to prevent executing identical copies
    for st in seed_tasks:
        seen_hashes.add(_task_content_hash(st))

    valid_count = 0
    invalid_count = 0
    blocked_count = 0
    last_blocked_rules: list[str] = []

    for attempt_num in range(1, effective_budget + 1):
        if stop_after_bypasses and len(bypasses) >= stop_after_bypasses:
            break

        # Feedback-guided operator and parent selection
        operator = _choose_guided_operator(last_blocked_rules, rng)

        if blocked_attempts and rng.random() < 0.5:
            parent_task = rng.choice(blocked_attempts)
        else:
            parent_task = rng.choice(seed_tasks)

        # Mutate to create mutant TaskSpec
        mutant = None
        desc = ""
        for _ in range(10):
            cand_mutant, op_name, cand_desc = mutate(parent_task, rng, operator=operator)
            h = _task_content_hash(cand_mutant)
            if h not in seen_hashes:
                seen_hashes.add(h)
                mutant = cand_mutant
                desc = cand_desc
                break
        
        if mutant is None:
            # Fallback perturbation
            mutant, op_name, desc = mutate(parent_task, rng, operator=operator)

        task_id = f"gen_{campaign_id}_a{attempt_num}"
        mutant.task_id = task_id
        mutant.title = f"Campaign Attempt #{attempt_num}: {operator}"
        mutant.expected = None

        # 1. Save generated task into generated_tasks table (never to filesystem or scenario cache)
        gen_row = GeneratedTaskRow(
            task_id=task_id,
            spec_json=mutant.model_dump_json(),
            origin="mutation",
            parent_task_id=parent_task.task_id,
            campaign_id=campaign_id,
            operator=operator,
            seed=seed,
            created_at=datetime.now(timezone.utc),
        )
        db.merge(gen_row)
        db.commit()

        # 2. Validity check: run with defense "none" first
        run_none = execute_run(db, task_id=task_id, defense="none")
        trial_none = run_none.trials[0]
        ev_none = trial_none.evaluation
        verdict_none = ev_none.verdict if ev_none else "inconclusive"

        if verdict_none != "violated":
            # Invalid mutant: not an exploit without defense
            invalid_count += 1
            attempt_rec = {
                "attempt_number": attempt_num,
                "trial_id": trial_none.trial_id,
                "run_id": run_none.run_id,
                "task_id": task_id,
                "parent_scenario_id": parent_task.task_id,
                "mutation_operator": operator,
                "operator": operator,
                "description": f"{desc} (invalid: did not violate invariants under baseline)",
                "verdict": "invalid_mutant",
                "severity": "LOW",
                "blocked_rules": [],
                "is_bypass": False,
                "is_valid": False,
            }
            attempts.append(attempt_rec)
            continue

        valid_count += 1

        # 3. Valid attack: run against target defense
        run_target = execute_run(db, task_id=task_id, defense=defense)
        trial_target = run_target.trials[0]
        ev_target = trial_target.evaluation
        verdict_target = ev_target.verdict if ev_target else "inconclusive"

        # Determine blocked rules
        blocked_rules = []
        event_rows = db.query(EventRow).filter(EventRow.trial_id == trial_target.trial_id).all()
        for r in event_rows:
            try:
                te = TraceEvent.model_validate_json(r.payload)
                if te.type == EventType.GATEWAY_DECISION and te.decision == Decision.BLOCKED and te.rule_id:
                    if te.rule_id not in blocked_rules:
                        blocked_rules.append(te.rule_id)
            except Exception:
                pass

        # Determine if bypass
        is_bypass = (verdict_target == "violated")

        # Determine severity using derive_severity
        eval_data = json.loads(ev_target.result_json) if ev_target and ev_target.result_json else {}
        violated_invs = [
            inv["invariant_id"]
            for inv in eval_data.get("invariants", [])
            if inv.get("status") == "violated"
        ]
        severity = derive_severity(violated_invs) or mutant.severity or "MEDIUM"

        if is_bypass:
            bypasses_by_operator[operator] += 1
            last_blocked_rules = []
        else:
            blocked_count += 1
            for rule in blocked_rules:
                rule_block_counts[rule] += 1
            last_blocked_rules = blocked_rules
            blocked_attempts.append(mutant)

        attempt_rec = {
            "attempt_number": attempt_num,
            "trial_id": trial_target.trial_id,
            "run_id": run_target.run_id,
            "validity_trial_id": trial_none.trial_id,
            "task_id": task_id,
            "parent_scenario_id": parent_task.task_id,
            "mutation_operator": operator,
            "operator": operator,
            "description": desc,
            "verdict": verdict_target,
            "severity": severity,
            "blocked_rules": blocked_rules,
            "is_bypass": is_bypass,
            "is_valid": True,
        }
        attempts.append(attempt_rec)
        if is_bypass:
            bypasses.append(attempt_rec)

    # 4. Construct final summary
    rules_ranked = dict(sorted(rule_block_counts.items(), key=lambda x: x[1], reverse=True))
    summary = {
        "campaign_id": campaign_id,
        "seed": seed,
        "budget": effective_budget,
        "defense": defense,
        "seed_scenarios": [t.task_id for t in seed_tasks],
        "status": "completed",
        "trials_executed": len(attempts),
        "attempts": attempts,
        "bypasses": bypasses,
        "bypasses_found": len(bypasses),
        "valid": valid_count,
        "invalid": invalid_count,
        "blocked": blocked_count,
        "bypasses_by_operator": dict(bypasses_by_operator),
        "rules_that_blocked_most": rules_ranked,
    }

    # 5. Persist campaign row in campaigns table
    camp_row = CampaignRow(
        campaign_id=campaign_id,
        seed=seed,
        budget=effective_budget,
        defense=defense,
        seed_scenarios=json.dumps([t.task_id for t in seed_tasks]),
        status="completed",
        summary_json=json.dumps(summary),
        bypasses_found=len(bypasses),
        result_json=json.dumps(summary),
        created_at=datetime.now(timezone.utc),
    )
    db.merge(camp_row)
    db.commit()

    return summary
