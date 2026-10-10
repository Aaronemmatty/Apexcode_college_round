"""Campaign API endpoints for autonomous attack discovery."""

import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.attacks.mutator import run_discovery_campaign
from app.db.models import CampaignRow
from app.db.session import get_db

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CampaignCreateRequest(BaseModel):
    budget: int = Field(default=10, ge=1, le=50)
    seed: int = Field(default=42)
    defense: str = Field(default="gateway")
    seed_scenarios: list[str] = Field(default_factory=list)


@router.post("", status_code=200)
def start_campaign(
    body: CampaignCreateRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Execute an autonomous discovery campaign and return results."""
    return run_discovery_campaign(
        db=db,
        budget=body.budget,
        seed=body.seed,
        defense=body.defense,
        seed_scenarios=body.seed_scenarios if body.seed_scenarios else None,
    )


@router.get("", status_code=200)
def list_campaigns(db: Session = Depends(get_db)) -> list[dict]:
    """List executed discovery campaigns, newest first."""
    rows = db.query(CampaignRow).order_by(desc(CampaignRow.created_at)).all()
    summaries = []
    for r in rows:
        data = json.loads(r.result_json)
        summaries.append({
            "campaign_id": r.campaign_id,
            "defense": r.defense,
            "budget": r.budget,
            "seed": r.seed,
            "status": r.status,
            "trials_executed": data.get("trials_executed", 0),
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
    return json.loads(row.result_json)
