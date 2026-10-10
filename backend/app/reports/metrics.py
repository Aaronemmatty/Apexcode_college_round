import json
import os
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.models import TrialRow, RunRow, EvaluationRow, ReplayRow, EventRow

def load_scenarios():
    scenarios_dir = os.path.join(os.path.dirname(__file__), "..", "..", "scenarios")
    scenarios = []
    if not os.path.exists(scenarios_dir):
        return []
    for f in sorted(os.listdir(scenarios_dir)):
        if f.endswith(".json"):
            with open(os.path.join(scenarios_dir, f), "r", encoding="utf-8") as f_in:
                data = json.load(f_in)
                scenarios.append({
                    "task_id": data["scenario_id"],
                    "title": data.get("title", data["scenario_id"]),
                    "kind": data.get("kind", "attack"),
                    "category": data.get("category", "unknown")
                })
    return scenarios

def get_compare_metrics(db: Session):
    scenarios = load_scenarios()
    
    trials_q = db.execute(select(TrialRow, RunRow).join(RunRow, TrialRow.run_id == RunRow.run_id)).all()
    
    grouped = defaultdict(list)
    excluded_failed = 0
    excluded_inconclusive = 0
    
    for t_row, r_row in trials_q:
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
    attack_violated_gateway_n = 0
    attack_violated_gateway_m = 0
    attack_prevented = 0
    attack_still_violated = []
    
    benign_held_none_n = 0
    benign_held_none_m = 0
    benign_held_gateway_n = 0
    benign_held_gateway_m = 0
    
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
            by_category[cat] = {"violated_none": 0, "violated_gateway": 0, "total": 0}
            
        none_tup = selected_trials.get((tid, "none"))
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
                    res = payload.get("result", {})
                    vios = res.get("violations", []) if res else []
                    rule_id = payload.get("rule_id")
                    if vios:
                        for v in vios:
                            rid = v.get("rule_id") if isinstance(v, dict) else v
                            if rid:
                                violations_listed[rid] += 1
                    elif rule_id and rule_id != "policy_allow":
                        violations_listed[rule_id] += 1
                    
                    if payload.get("decision") == "blocked":
                        if vios:
                            for v in vios:
                                rid = v.get("rule_id") if isinstance(v, dict) else v
                                if rid:
                                    blocked_rules.add(rid)
                                    block_counts_by_rule[rid] += 1
                        elif rule_id and rule_id != "policy_allow":
                            blocked_rules.add(rule_id)
                            block_counts_by_rule[rule_id] += 1
            
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
            "none": none_data,
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
        "attack_violated_gateway": {"n": attack_violated_gateway_n, "m": attack_violated_gateway_m},
        "attack_prevented": attack_prevented,
        "attack_still_violated": attack_still_violated,
        "benign_held_none": {"n": benign_held_none_n, "m": benign_held_none_m},
        "benign_held_gateway": {"n": benign_held_gateway_n, "m": benign_held_gateway_m},
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
