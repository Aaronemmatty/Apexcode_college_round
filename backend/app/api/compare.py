from datetime import datetime, timezone
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.reports.metrics import get_compare_metrics, compute_regression_diff
from app.db.models import TrialRow
from app.api.trials import create_replay

router = APIRouter()

class RegressionDiffRequest(BaseModel):
    defense_a: str = "none"
    defense_b: str = "gateway"
    rerun: bool = True

def format_pct(n: int, m: int) -> str:
    if m == 0:
        return "No data"
    pct = (n / m) * 100
    return f"{pct:.1f}% ({n}/{m})"

@router.get("/compare")
def get_compare(db: Session = Depends(get_db)):
    metrics = get_compare_metrics(db)
    return metrics

@router.post("/compare/regression-diff")
def post_regression_diff(req: RegressionDiffRequest, db: Session = Depends(get_db)):
    return compute_regression_diff(db, defense_a=req.defense_a, defense_b=req.defense_b, rerun=req.rerun)

@router.get("/compare/regression-diff")
def get_regression_diff(
    defense_a: str = Query("none"),
    defense_b: str = Query("gateway"),
    db: Session = Depends(get_db)
):
    return compute_regression_diff(db, defense_a=defense_a, defense_b=defense_b, rerun=False)

@router.post("/replays/run-all")
def run_all_replays(db: Session = Depends(get_db)):
    metrics = get_compare_metrics(db)
    replayed_count = 0
    consistent_count = 0
    inconsistent_ids = []
    
    for row in metrics["per_scenario"]:
        for side in ["none", "hardening", "gateway"]:
            data = row.get(side)
            if data and data.get("trial_id"):
                tid = data["trial_id"]
                trow = db.execute(select(TrialRow).where(TrialRow.trial_id == tid)).scalar()
                if not trow:
                    continue
                try:
                    res = create_replay(tid, db)
                    replayed_count += 1
                    if res.consistent:
                        consistent_count += 1
                    else:
                        inconsistent_ids.append(tid)
                except Exception as e:
                    inconsistent_ids.append(tid)
                    
    return {
        "replayed": replayed_count,
        "consistent": consistent_count,
        "inconsistent_trial_ids": inconsistent_ids
    }

@router.get("/report")
def get_report(format: str = Query("json"), db: Session = Depends(get_db)):
    if format not in ["json", "md"]:
        raise HTTPException(status_code=422, detail="Invalid format")
        
    metrics = get_compare_metrics(db)
    scope_str = "Controlled mock-tool harness, deterministic scripted agent. Not an OS-level sandbox, not a measure of real LLM behavior."
    
    if format == "json":
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scope": scope_str,
            **metrics
        }
        
    # Markdown generation
    md = f"# AgentBreak Evaluation Report\n\n"
    md += f"**Generated:** {datetime.now(timezone.utc).isoformat()}\n\n"
    md += f"> **Disclaimer:** {scope_str}\n\n"
    
    md += "## Headline Metrics\n"
    md += f"- **Attack Violated (No Defense):** {format_pct(metrics['attack_violated_none']['n'], metrics['attack_violated_none']['m'])}\n"
    if metrics.get("attack_violated_hardening", {}).get("m", 0) > 0:
        md += f"- **Residual with Hardening:** {format_pct(metrics['attack_violated_hardening']['n'], metrics['attack_violated_hardening']['m'])}\n"
    md += f"- **Residual with Gateway:** {format_pct(metrics['attack_violated_gateway']['n'], metrics['attack_violated_gateway']['m'])}\n"
    md += f"- **Benign Held (Gateway):** {format_pct(metrics['benign_held_gateway']['n'], metrics['benign_held_gateway']['m'])}\n"
    md += f"- **False Block Rate (Gateway):** {format_pct(metrics['false_block_rate']['n'], metrics['false_block_rate']['m'])}\n\n"
    
    md += "## By Category\n"
    md += "| Category | No Defense (Violated) | Hardening (Violated) | Gateway (Violated) | Total |\n"
    md += "|----------|-----------------------|----------------------|--------------------|-------|\n"
    for cat, stat in metrics["by_category"].items():
        v_hd = stat.get("violated_hardening", 0)
        md += f"| {cat} | {stat['violated_none']} | {v_hd} | {stat['violated_gateway']} | {stat['total']} |\n"
    md += "\n"
    
    md += "## Per Scenario\n"
    md += "| Task ID | Kind | No Def Verdict | Hardening Verdict | GW Verdict | Changed | Blocked Rules (GW) |\n"
    md += "|---------|------|----------------|-------------------|------------|---------|--------------------|\n"
    for row in metrics["per_scenario"]:
        none_v = row['none']['verdict'] if row['none'] else "n/a"
        hd_v = row.get('hardening', {}).get('verdict', 'n/a') if row.get('hardening') else "n/a"
        gw_v = row['gateway']['verdict'] if row['gateway'] else "n/a"
        rules = ", ".join(row['gateway']['blocked_rule_ids']) if row['gateway'] else ""
        md += f"| {row['task_id']} | {row['kind']} | {none_v} | {hd_v} | {gw_v} | {row['change']} | {rules} |\n"
    md += "\n"
    
    md += "## Block Counts by Rule\n"
    md += "| Rule ID | Block Count | Violations Listed |\n"
    md += "|---------|-------------|-------------------|\n"
    all_rules = set(metrics["block_counts_by_rule"].keys()).union(set(metrics["violations_listed"].keys()))
    for rid in sorted(all_rules):
        bc = metrics["block_counts_by_rule"].get(rid, 0)
        vl = metrics["violations_listed"].get(rid, 0)
        md += f"| {rid} | {bc} | {vl} |\n"
    md += "\n"
    
    rep = metrics["replay"]
    md += f"## Replay Consistency\n"
    md += f"Replayed: {rep['replayed']}, Consistent: {rep['consistent']}, Not Replayed: {rep['not_replayed']}\n\n"
    
    md += "## Exclusions & Incomplete\n"
    md += f"- Excluded Failed: {metrics['excluded_failed']}\n"
    md += f"- Excluded Inconclusive: {metrics['excluded_inconclusive']}\n"
    md += f"- Incomplete Scenarios: {metrics['incomplete_scenarios']}\n\n"
    
    md += "## Known Limitations\n"
    if metrics["attack_still_violated"]:
        still_v_str = ", ".join(metrics["attack_still_violated"])
        md += f"- **Still-Violated Scenarios (Gateway):** {still_v_str}\n"
    else:
        md += "- **Still-Violated Scenarios (Gateway):** None\n"
    md += "- **Residual Bypass Note:** The excessive_access_broad_query scenario bypasses syntactic pattern rules (1 documented residual miss).\n"
    
    return Response(content=md, media_type="text/markdown", headers={"Content-Disposition": "attachment; filename=agentbreak-report.md"})
