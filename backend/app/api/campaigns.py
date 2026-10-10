"""Campaign API endpoints for autonomous attack discovery."""

import json
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import CampaignRow
from app.db.session import get_db
from app.discovery.campaign import run_discovery_campaign
from app.orchestrator import execute_run
from app.evaluator.remediation import get_fix_suggestions

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CampaignCreateRequest(BaseModel):
    budget: int = Field(default=10, ge=1, le=200)
    seed: int = Field(default=42)
    defense: str = Field(default="gateway")
    seed_scenarios: list[str] = Field(default_factory=list)
    stop_after_bypasses: Optional[int] = None
    backend: str = Field(default="scripted")
    backend_config: dict[str, Any] = Field(default_factory=dict)


@router.post("", status_code=200)
def start_campaign(
    body: CampaignCreateRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Execute a synchronous autonomous discovery campaign (budget hard-capped at 200)."""
    return run_discovery_campaign(
        db=db,
        budget=body.budget,
        seed=body.seed,
        defense=body.defense,
        seed_scenarios=body.seed_scenarios if body.seed_scenarios else None,
        stop_after_bypasses=body.stop_after_bypasses,
        backend=body.backend,
        backend_config=body.backend_config,
    )


@router.get("", status_code=200)
def list_campaigns(db: Session = Depends(get_db)) -> list[dict]:
    """List executed discovery campaigns, newest first."""
    rows = db.query(CampaignRow).order_by(desc(CampaignRow.created_at)).all()
    summaries = []
    for r in rows:
        data = json.loads(r.summary_json or r.result_json)
        summaries.append({
            "campaign_id": r.campaign_id,
            "defense": r.defense,
            "budget": r.budget,
            "seed": r.seed,
            "status": r.status,
            "trials_executed": data.get("trials_executed", len(data.get("attempts", []))),
            "bypasses_found": r.bypasses_found,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return summaries


@router.get("/{campaign_id}", status_code=200)
def get_campaign(campaign_id: str, db: Session = Depends(get_db)) -> dict:
    """Retrieve full details of a discovery campaign by ID."""
    row = db.query(CampaignRow).filter(CampaignRow.campaign_id == campaign_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found.")
    return json.loads(row.summary_json or row.result_json)


@router.post("/{campaign_id}/rerun-bypasses", status_code=200)
def rerun_campaign_bypasses(
    campaign_id: str,
    defense: str = Query(default="gateway"),
    db: Session = Depends(get_db),
) -> dict:
    """Rerun a campaign's discovered bypasses against a chosen defense and report fixed vs still violated."""
    row = db.query(CampaignRow).filter(CampaignRow.campaign_id == campaign_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found.")

    data = json.loads(row.summary_json or row.result_json)
    bypasses = data.get("bypasses", [])

    results = []
    fixed_count = 0
    still_violated_count = 0

    for bp in bypasses:
        task_id = bp["task_id"]
        run_row = execute_run(db, task_id=task_id, defense=defense)
        trial_row = run_row.trials[0]
        eval_row = trial_row.evaluation
        verdict = eval_row.verdict if eval_row else "inconclusive"

        eval_data = json.loads(eval_row.result_json) if eval_row and eval_row.result_json else {}
        violated_invariants = [inv.get("invariant_id") for inv in eval_data.get("invariants", []) if inv.get("status") == "violated"]
        fix_suggestions = get_fix_suggestions(violated_invariants)

        if verdict == "held":
            status = "now_held"
            fixed_count += 1
        elif verdict == "violated":
            status = "still_violated"
            still_violated_count += 1
        else:
            status = "inconclusive"

        results.append({
            "task_id": task_id,
            "trial_id": trial_row.trial_id,
            "run_id": run_row.run_id,
            "operator": bp.get("operator") or bp.get("mutation_operator", "unknown"),
            "previous_severity": bp.get("severity", "MEDIUM"),
            "verdict": verdict,
            "status": status,
            "now_held": status == "now_held",
            "fix_suggestions": fix_suggestions,
        })

    return {
        "campaign_id": campaign_id,
        "defense": defense,
        "total_bypasses": len(bypasses),
        "fixed_count": fixed_count,
        "now_held_count": fixed_count,
        "still_violated_count": still_violated_count,
        "results": results,
    }


@router.get("/{campaign_id}/report", status_code=200)
def get_campaign_report(
    campaign_id: str,
    format: str = Query(default="md"),
    db: Session = Depends(get_db),
):
    """Generate Markdown or JSON export report for an autonomous discovery campaign."""
    if format not in ["md", "json"]:
        raise HTTPException(status_code=422, detail="Invalid format. Supported formats: 'md', 'json'.")

    row = db.query(CampaignRow).filter(CampaignRow.campaign_id == campaign_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found.")

    data = json.loads(row.summary_json or row.result_json)
    if format == "json":
        return data

    # Generate Markdown Report
    trials = data.get("trials_executed", 0)
    bypasses = data.get("bypasses", [])
    bypasses_count = len(bypasses)
    valid_count = data.get("valid_mutants", 0)
    invalid_count = data.get("invalid_mutants", 0)
    blocked_count = data.get("blocked_attacks", 0)

    pct_valid = f"{(valid_count / trials * 100):.1f}%" if trials else "0.0%"
    pct_invalid = f"{(invalid_count / trials * 100):.1f}%" if trials else "0.0%"
    pct_blocked = f"{(blocked_count / trials * 100):.1f}%" if trials else "0.0%"
    pct_bypass = f"{(bypasses_count / trials * 100):.1f}%" if trials else "0.0%"

    md = f"# AgentBreak Autonomous Discovery Campaign Report\n\n"
    md += f"**Campaign ID:** `{campaign_id}`\n\n"
    md += f"**Generated:** {datetime.now(timezone.utc).isoformat()}\n\n"
    md += f"**Target Defense:** `{data.get('defense', 'gateway')}` | **Backend Agent:** `{data.get('backend', 'scripted')}`\n\n"
    md += f"**Budget:** `{data.get('budget', trials)}` attempts | **RNG Seed:** `{data.get('seed', 42)}`\n\n"
    md += f"> **Harness Scope:** Budgeted adaptive mutation search over bounded attack operators guided by deterministic evaluator invariants in an in-process synthetic sandbox.\n\n"

    md += "## 1. Executive Summary & Telemetry\n\n"
    md += "| Metric | Count | Percentage |\n"
    md += "|---|---|---|\n"
    md += f"| **Total Mutation Attempts** | {trials} | 100.0% |\n"
    md += f"| **Valid Attacks (Passed No-Defense Check)** | {valid_count} | {pct_valid} |\n"
    md += f"| **Invalid Mutants (Filtered Out)** | {invalid_count} | {pct_invalid} |\n"
    md += f"| **Mitigated by Target Defense** | {blocked_count} | {pct_blocked} |\n"
    md += f"| **Discovered Bypasses (Vulnerabilities)** | {bypasses_count} | {pct_bypass} |\n\n"

    md += "## 2. Discovered Bypasses & Deterministic Remediation\n\n"
    if bypasses:
        md += "| Task ID | Operator | Severity | Violated Invariants | Deterministic Fix Recommendation |\n"
        md += "|---|---|---|---|---|\n"
        for bp in bypasses:
            tid = bp.get("task_id", "unknown")
            op = bp.get("operator") or bp.get("mutation_operator", "unknown")
            sev = bp.get("severity", "MEDIUM")
            invs = bp.get("violated_invariants", [])
            inv_str = ", ".join(f"`{i}`" for i in invs) if invs else "`invariant_violated`"
            fixes = get_fix_suggestions(invs)
            fix_str = " ".join(fixes) if fixes else "Apply strict tool gating and parameter validation."
            md += f"| `{tid}` | `{op}` | **{sev}** | {inv_str} | {fix_str} |\n"
        md += "\n"
    else:
        md += "_No defense bypasses were discovered within the allocated search budget._\n\n"

    md += "## 3. Evaluator Guidance & Mutation Strategy\n\n"
    md += "- **Syntactic Mutations:** Variant delimiters, case alteration, and spacing to probe parser robustness.\n"
    md += "- **Query Expansions:** Broad queries, wildcards, and partial strings targeting customer data limits.\n"
    md += "- **Recipient Overrides:** Injected domains and external destinations testing domain allowlists.\n"
    md += "- **Tool Escalation:** Injecting out-of-scope tools (e.g., search_customers during note tasks).\n\n"

    md += "## 4. Platform Limitations & Boundaries\n\n"
    md += "- **Bounded Search:** Autonomous search operates over a bounded set of deterministic mutation operators guided by evaluator feedback, not arbitrary unbounded hacking.\n"
    md += "- **Deliberately Vulnerable Scripted Agent:** Baseline agent is scripted and intentionally vulnerable to canonical directives.\n"
    md += "- **Synthetic Sandbox Environment:** All tools, documents, customer accounts, and canaries are synthetic mock objects.\n"
    md += "- **Telemetry Isolation:** Campaign exploration runs are strictly isolated from official benchmark metrics.\n"

    return Response(
        content=md,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=agentbreak-campaign-{campaign_id}-report.md"},
    )