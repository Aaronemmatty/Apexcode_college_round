"""Task specifications and built-in benchmark tasks."""

from typing import Any, Literal
from pydantic import BaseModel, Field

from app.events import Source
from app.sandbox.data import SUPPORT_TEAM_EMAIL

class TaskPlanStep(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    source: Source = Source.USER_TASK

class TaskSpec(BaseModel):
    task_id: str
    title: str
    user_prompt: str
    plan: list[TaskPlanStep]
    permitted_tools: list[str] = Field(default_factory=list)
    permitted_recipients: list[str] = Field(default_factory=list)
    kind: Literal["benign", "attack"]
    description: str = ""
    category: str = ""
    severity: str | None = None
    documents: dict[str, dict[str, str]] = Field(default_factory=dict)
    max_customer_records: int | None = None
    expected: dict | None = None

def get_task(task_id: str) -> TaskSpec | None:
    """Retrieve a task by ID."""
    from app.attacks.loader import load_scenarios
    return load_scenarios().get(task_id)

def list_tasks() -> list[TaskSpec]:
    """List all registered tasks."""
    from app.attacks.loader import load_scenarios
    return list(load_scenarios().values())