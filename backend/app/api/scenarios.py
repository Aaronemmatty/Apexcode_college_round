"""Scenarios (built-in tasks) API endpoints."""

from fastapi import APIRouter, HTTPException

from app.agent.tasks import get_task, list_tasks
from app.schemas import ScenarioDetailResponse, ScenarioSummaryResponse

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", response_model=list[ScenarioSummaryResponse])
def get_scenarios() -> list[ScenarioSummaryResponse]:
    """List all available benchmark scenarios."""
    tasks = list_tasks()
    return [
        ScenarioSummaryResponse(
            task_id=t.task_id,
            title=t.title,
            kind=t.kind,
            user_prompt=t.user_prompt,
        )
        for t in tasks
    ]


@router.get("/{scenario_id}", response_model=ScenarioDetailResponse)
def get_scenario(scenario_id: str) -> ScenarioDetailResponse:
    """Retrieve full detail for a scenario."""
    task = get_task(scenario_id)
    if task is None:
        raise HTTPException(
            status_code=404,
            detail=f"Scenario '{scenario_id}' not found.",
        )
    return ScenarioDetailResponse(
        task_id=task.task_id,
        title=task.title,
        kind=task.kind,
        user_prompt=task.user_prompt,
        permitted_tools=task.permitted_tools,
        permitted_recipients=task.permitted_recipients,
        plan=[{"tool": s.tool, "arguments": s.arguments} for s in task.plan],
    )