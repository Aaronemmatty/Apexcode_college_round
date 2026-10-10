import json
import os
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.models import TrialRow, RunRow, EvaluationRow, ReplayRow, EventRow

def load_scenarios():
    from app.evaluator.severity import get_attack_group
    scenarios_dir = os.path.join(os.path.dirname(__file__), "..", "..", "scenarios")
    scenarios = []
    if not os.path.exists(scenarios_dir):
        return []
    for f in sorted(os.listdir(scenarios_dir)):
        if f.endswith(".json"):
            with open(os.path.join(scenarios_dir, f), "r", encoding="utf-8") as f_in:
                data = json.load(f_in)
                kind = data.get("kind", "attack")
                category = data.get("category", "unknown")
                scenarios.append({
                    "task_id": data["scenario_id"],
                    "title": data.get("title", data["scenario_id"]),
                    "kind": kind,
                    "category": category,
                    "severity": data.get("severity"),
                    "group": get_attack_group(category) if kind == "attack" else None,
                })
    return scenarios

def get_compare_metrics(db: Session):
    scenarios = load_scenarios()
    
    trials_q = db.execute(select(TrialRow, RunRow).join(RunRow, TrialRow.run_id == RunRow.run_id)).all()
    
    grouped = defaultdict(list)
    excluded_failed = 0
    excluded_inconclusive = 0
    
    for t_row, r_row in trials_q:
        if getattr(r_row, "backend", "scripted") != "scripted":
            continue
        if getattr(t_row, "backend", "scripted") != "scripted":
            continue
        if r_row.task_id.startswith("gen_") or r_row.task_id.startswith("custom_"):
            continue
        if t_row.status == "failed":
            excluded_failed += 1
            continue
        if t_row.status != "completed":
            continue
        
        ev_row = db.execute(select(EvaluationRow).where(EvaluationRow.trial_id == t_row.trial_id)).scalar()
        verdict = ev_row.verdict if ev_row else "inconclusive"
        
        if verdict == "inconclusive":
            excluded_inconclusive += 1
            continue
            
        grouped[(r_row.task_id, r_row.defense)].append((t_row, ev_row))
    
    selected_trials = {}
    for k, lst in grouped.items():
        lst.sort(key=lambda x: (x[0].started_at, x[0].trial_id), reverse=True)
        selected_trials[k] = lst[0]
        
    attack_violated_none_n = 0
    attack_violated_none_m = 0
    attack_violated_hardening_n = 0
    attack_violated_hardening_m = 0
    attack_violated_gateway_n = 0
    attack_violated_gateway_m = 0
    attack_prevented = 0
    attack_still_violated = []
    
    benign_held_none_n = 0
    benign_held_none_m = 0
    benign_held_hardening_n = 0
    benign_held_hardening_m = 0
    benign_held_gateway_n = 0
    benign_held_gateway_m = 0
    
    benign_task_completed_hardening_n = 0
    benign_task_completed_hardening_m = 0
    benign_task_completed_gateway_n = 0
    benign_task_completed_gateway_m = 0
    
    false_blocks_total = 0
    false_block_rate_n = 0
    false_block_rate_m = 0
    
    block_counts_by_rule = defaultdict(int)
    violations_listed = defaultdict(int)
    
    by_category = {}
    
    incomplete_scenarios = 0
    per_scenario = []
    
    replayed = 0
    consistent = 0
    not_replayed = 0
    
    for sc in scenarios:
        tid = sc["task_id"]
        kind = sc["kind"]
        cat = sc["category"]
        
        if kind == "attack" and cat not in by_category:
            by_category[cat] = {
                "violated_none": 0,
                "violated_hardening": 0,
                "violated_gateway": 0,
                "total": 0
            }
            
        none_tup = selected_trials.get((tid, "none"))
        hd_tup = selected_trials.get((tid, "hardening"))
        gw_tup = selected_trials.get((tid, "gateway"))
        
        if kind == "attack":
            by_category[cat]["total"] += 1
        
        none_data = None
        if none_tup:
            t, ev = none_tup
            none_data = {"trial_id": t.trial_id, "verdict": ev.verdict}
            if kind == "attack":
                attack_violated_none_m += 1
                if ev.verdict == "violated":
                    attack_violated_none_n += 1
                    by_category[cat]["violated_none"] += 1
            else:
                benign_held_none_m += 1
                if ev.verdict == "held":
                    benign_held_none_n += 1
                    
        hd_data = None
        if hd_tup:
            t, ev = hd_tup
            result_json = json.loads(ev.result_json) if ev.result_json else {}
            task_comp = result_json.get("task_completed", False)
            fb = result_json.get("false_blocks", 0)
            hd_data = {
                "trial_id": t.trial_id,
                "verdict": ev.verdict,
                "task_completed": task_comp,
                "false_blocks": fb
            }
            if kind == "attack":
                attack_violated_hardening_m += 1
                if ev.verdict == "violated":
                    attack_violated_hardening_n += 1
                    by_category[cat]["violated_hardening"] += 1
            else:
                benign_held_hardening_m += 1
                benign_task_completed_hardening_m += 1
                if task_comp:
                    benign_task_completed_hardening_n += 1
                if ev.verdict == "held":
                    benign_held_hardening_n += 1
        
        gw_data = None
        if gw_tup:
            t, ev = gw_tup
            result_json = json.loads(ev.result_json) if ev.result_json else {}
            task_comp = result_json.get("task_completed", False)
            fb = result_json.get("false_blocks", 0)
            
            blocked_rules = set()
            events = db.execute(select(EventRow).where(EventRow.trial_id == t.trial_id)).scalars().all()
            for erow in events:
                payload = json.loads(erow.payload)
                if payload.get("type") == "gateway_decision":
                    decision = payload.get("decision")
                    rule_id = payload.get("rule_id")
                    
                    if decision == "blocked" and rule_id:
                        blocked_rules.add(rule_id)
                        block_counts_by_rule[rule_id] += 1
                    
                    res = payload.get("result", {})
                    vios = res.get("violations", []) if res else []
                    for v in vios:
                        rid = v.get("rule_id") if isinstance(v, dict) else v
                        if rid:
                            violations_listed[rid] += 1
            
            gw_data = {
                "trial_id": t.trial_id,
                "verdict": ev.verdict,
                "blocked_rule_ids": sorted(blocked_rules),
                "task_completed": task_comp,
                "false_blocks": fb
            }
            
            if kind == "attack":
                attack_violated_gateway_m += 1
                if ev.verdict == "violated":
                    attack_violated_gateway_n += 1
                    by_category[cat]["violated_gateway"] += 1
            else:
                benign_held_gateway_m += 1
                benign_task_completed_gateway_m += 1
                if task_comp:
                    benign_task_completed_gateway_n += 1
                if ev.verdict == "held":
                    benign_held_gateway_n += 1
                false_blocks_total += fb
                false_block_rate_m += 1
                if fb > 0:
                    false_block_rate_n += 1
                    
        change = "incomplete"
        if not none_data or not gw_data:
            incomplete_scenarios += 1
        else:
            if kind == "attack":
                if none_data["verdict"] == "violated" and gw_data["verdict"] == "held":
                    change = "prevented"
                    attack_prevented += 1
                elif none_data["verdict"] == "violated" and gw_data["verdict"] == "violated":
                    change = "still_violated"
                    attack_still_violated.append(tid)
                else:
                    change = "no_change"
            else:
                if none_data["verdict"] == "held" and gw_data["verdict"] == "held":
                    change = "no_change"
                elif none_data["verdict"] == "held" and gw_data["verdict"] == "violated":
                    change = "still_violated"
                else:
                    change = "no_change"
                    
        per_scenario.append({
            "task_id": tid,
            "title": sc["title"],
            "kind": kind,
            "category": cat,
            "severity": sc.get("severity"),
            "group": sc.get("group"),
            "none": none_data,
            "hardening": hd_data,
            "gateway": gw_data,
            "change": change
        })
        
        for tup in (none_tup, gw_tup):
            if tup:
                rep = db.execute(select(ReplayRow).where(ReplayRow.original_trial_id == tup[0].trial_id).order_by(ReplayRow.created_at.desc())).scalars().first()
                if rep:
                    replayed += 1
                    if rep.consistent:
                        consistent += 1
                else:
                    not_replayed += 1
                    
    return {
        "excluded_failed": excluded_failed,
        "excluded_inconclusive": excluded_inconclusive,
        "attack_violated_none": {"n": attack_violated_none_n, "m": attack_violated_none_m},
        "attack_violated_hardening": {"n": attack_violated_hardening_n, "m": attack_violated_hardening_m},
        "attack_violated_gateway": {"n": attack_violated_gateway_n, "m": attack_violated_gateway_m},
        "attack_prevented": attack_prevented,
        "attack_still_violated": attack_still_violated,
        "benign_held_none": {"n": benign_held_none_n, "m": benign_held_none_m},
        "benign_held_hardening": {"n": benign_held_hardening_n, "m": benign_held_hardening_m},
        "benign_held_gateway": {"n": benign_held_gateway_n, "m": benign_held_gateway_m},
        "benign_task_completed_hardening": {"n": benign_task_completed_hardening_n, "m": benign_task_completed_hardening_m},
        "benign_task_completed_gateway": {"n": benign_task_completed_gateway_n, "m": benign_task_completed_gateway_m},
        "false_blocks_total": false_blocks_total,
        "false_block_rate": {"n": false_block_rate_n, "m": false_block_rate_m},
        "block_counts_by_rule": dict(block_counts_by_rule),
        "violations_listed": dict(violations_listed),
        "by_category": by_category,
        "replay": {
            "replayed": replayed,
            "consistent": consistent,
            "not_replayed": not_replayed
        },
        "per_scenario": per_scenario,
        "incomplete_scenarios": incomplete_scenarios
    }


def compute_regression_diff(
    db: Session,
    defense_a: str = "none",
    defense_b: str = "gateway",
    rerun: bool = False,
) -> dict:
    """Compare two defense versions across all scenarios, labeling each as fixed, still_violated, newly_violated, or held."""
    from app.agent.tasks import list_tasks
    from app.orchestrator import execute_run
    
    tasks = list_tasks()
    
    if rerun:
        for t in tasks:
            execute_run(db, t.task_id, defense_a, backend="scripted")
            execute_run(db, t.task_id, defense_b, backend="scripted")
            
    trials_q = db.execute(select(TrialRow, RunRow).join(RunRow, TrialRow.run_id == RunRow.run_id)).all()
    grouped = defaultdict(list)
    for t_row, r_row in trials_q:
        if getattr(r_row, "backend", "scripted") != "scripted":
            continue
        if getattr(t_row, "backend", "scripted") != "scripted":
            continue
        if r_row.task_id.startswith("gen_") or r_row.task_id.startswith("custom_"):
            continue
        if t_row.status != "completed":
            continue
        ev_row = db.execute(select(EvaluationRow).where(EvaluationRow.trial_id == t_row.trial_id)).scalar()
        if not ev_row or ev_row.verdict == "inconclusive":
            continue
        grouped[(r_row.task_id, r_row.defense)].append((t_row, ev_row))
        
    for k, lst in grouped.items():
        lst.sort(key=lambda x: (x[0].started_at, x[0].trial_id), reverse=True)
        
    diffs = []
    fixed = []
    still_violated = []
    newly_violated = []
    held = []
    incomplete = []
    
    for t in tasks:
        tid = t.task_id
        tup_a = grouped.get((tid, defense_a), [None])[0]
        tup_b = grouped.get((tid, defense_b), [None])[0]
        
        verdict_a = tup_a[1].verdict if tup_a else None
        verdict_b = tup_b[1].verdict if tup_b else None
        
        status = "incomplete"
        if verdict_a and verdict_b:
            if verdict_a == "violated" and verdict_b == "held":
                status = "fixed"
                fixed.append(tid)
            elif verdict_a == "violated" and verdict_b == "violated":
                status = "still_violated"
                still_violated.append(tid)
            elif verdict_a == "held" and verdict_b == "violated":
                status = "newly_violated"
                newly_violated.append(tid)
            elif verdict_a == "held" and verdict_b == "held":
                status = "held"
                held.append(tid)
        else:
            incomplete.append(tid)
            
        diffs.append({
            "task_id": tid,
            "title": t.title,
            "kind": t.kind,
            "category": t.category,
            "severity": t.severity,
            "defense_a": defense_a,
            "verdict_a": verdict_a,
            "defense_b": defense_b,
            "verdict_b": verdict_b,
            "status": status,
        })
        
    return {
        "defense_a": defense_a,
        "defense_b": defense_b,
        "summary": {
            "total": len(tasks),
            "fixed": len(fixed),
            "still_violated": len(still_violated),
            "newly_violated": len(newly_violated),
            "held": len(held),
            "incomplete": len(incomplete),
        },
        "fixed_task_ids": fixed,
        "still_violated_task_ids": still_violated,
        "newly_violated_task_ids": newly_violated,
        "held_task_ids": held,
        "diffs": diffs,
    }
