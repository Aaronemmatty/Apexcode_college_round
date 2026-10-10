from datetime import datetime, timezone
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.reports.metrics import get_compare_metrics
from app.db.models import TrialRow
from app.api.trials import create_replay

router = APIRouter()

@router.get("/compare")
def get_compare(db: Session = Depends(get_db)):
    metrics = get_compare_metrics(db)
    return metrics

@router.post("/replays/run-all")
def run_all_replays(db: Session = Depends(get_db)):
    metrics = get_compare_metrics(db)
    # Replay all selected trials
    replayed_count = 0
    consistent_count = 0
    inconsistent_ids = []
    
    for row in metrics["per_scenario"]:
        for side in ["none", "gateway"]:
            data = row.get(side)
            if data and data.get("trial_id"):
                tid = data["trial_id"]
                trow = db.execute(select(TrialRow).where(TrialRow.trial_id == tid)).scalar()
                if not trow:
                    continue
                # create replay
                try:
                    res = create_replay(tid, db)
                    replayed_count += 1
                    if res.consistent:
                        consistent_count += 1
                    else:
                        inconsistent_ids.append(tid)
                except Exception as e:
                    print(e)
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
    
    n_none = metrics['attack_violated_none']['n']
    m_none = metrics['attack_violated_none']['m']
    pct_none = int(n_none / m_none * 100) if m_none > 0 else 0
    
    n_gw = metrics['attack_violated_gateway']['n']
    m_gw = metrics['attack_violated_gateway']['m']
    pct_gw = int(n_gw / m_gw * 100) if m_gw > 0 else 0
    
    md += "## Headline Metrics\n"
    md += f"- **Attack Violated (No Defense):** {pct_none}% ({n_none}/{m_none})\n"
    md += f"- **Residual with Gateway:** {pct_gw}% ({n_gw}/{m_gw})\n"
    
    n_b = metrics['benign_held_gateway']['n']
    m_b = metrics['benign_held_gateway']['m']
    pct_b = int(n_b / m_b * 100) if m_b > 0 else 0
    md += f"- **Benign Held (Gateway):** {pct_b}% ({n_b}/{m_b})\n"
    
    n_fbr = metrics['false_block_rate']['n']
    m_fbr = metrics['false_block_rate']['m']
    md += f"- **False Block Rate (Gateway):** {int(n_fbr/m_fbr*100) if m_fbr > 0 else 0}% ({n_fbr}/{m_fbr})\n\n"
    
    md += "## By Category\n"
    md += "| Category | No Defense (Violated) | Gateway (Violated) | Total |\n"
    md += "|----------|-----------------------|--------------------|-------|\n"
    for cat, stat in metrics["by_category"].items():
        md += f"| {cat} | {stat['violated_none']} | {stat['violated_gateway']} | {stat['total']} |\n"
    md += "\n"
    
    md += "## Per Scenario\n"
    md += "| Task ID | Kind | No Def Verdict | GW Verdict | Changed | Blocked Rules (GW) |\n"
    md += "|---------|------|----------------|------------|---------|--------------------|\n"
    for row in metrics["per_scenario"]:
        none_v = row['none']['verdict'] if row['none'] else "n/a"
        gw_v = row['gateway']['verdict'] if row['gateway'] else "n/a"
        rules = ", ".join(row['gateway']['blocked_rule_ids']) if row['gateway'] else ""
        md += f"| {row['task_id']} | {row['kind']} | {none_v} | {gw_v} | {row['change']} | {rules} |\n"
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
    md += "- **Residual Bypass Note:** The excessive_access_broad_query scenario bypasses syntactic pattern rules (residual miss).\n"
    
    return Response(content=md, media_type="text/markdown", headers={"Content-Disposition": "attachment; filename=agentbreak-report.md"})
