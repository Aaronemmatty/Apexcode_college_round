"""Scenarios (built-in tasks) API endpoints."""

from fastapi import APIRouter, HTTPException

from app.agent.tasks import get_task, list_tasks
from app.evaluator.severity import get_attack_group
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
            category=t.category,
            severity=t.severity,
            description=t.description,
            user_prompt=t.user_prompt,
            group=get_attack_group(t.category) if t.kind == "attack" else None,
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
        category=task.category,
        severity=task.severity,
        description=task.description,
        user_prompt=task.user_prompt,
        group=get_attack_group(task.category) if task.kind == "attack" else None,
        permitted_tools=task.permitted_tools,
        permitted_recipients=task.permitted_recipients,
        plan=[{"tool": s.tool, "arguments": s.arguments, "source": s.source} for s in task.plan],
        documents=task.documents,
        max_customer_records=task.max_customer_records,
        expected=task.expected,
    )