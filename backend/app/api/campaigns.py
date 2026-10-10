"""Campaign API endpoints for autonomous attack discovery."""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
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
