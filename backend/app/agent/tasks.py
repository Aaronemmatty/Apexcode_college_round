"""Task and step definitions for the scripted agent.

Pure schemas and task registry for built-in scenarios and dynamic tasks.
"""

from typing import Any, Literal
from pydantic import BaseModel, Field

from app.events import Source


class TaskPlanStep(BaseModel):
    """A single planned action for the agent to execute."""
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    source: Source = Source.USER_TASK


class TaskSpec(BaseModel):
    """Specification of an agent task and its security boundary."""
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


def get_task(task_id: str, db: Any = None) -> TaskSpec | None:
    """Retrieve a task by ID.
    
    First checks built-in scenario files.
    If not found in scenario files, loads from generated_tasks table without
    modifying the scenario cache.
    """
    from app.attacks.loader import load_scenarios
    scenarios = load_scenarios()
    if task_id in scenarios:
        return scenarios[task_id]

    try:
        from app.db.models import GeneratedTaskRow
        from app.db.session import SessionLocal

        if db is not None:
            row = db.query(GeneratedTaskRow).filter(GeneratedTaskRow.task_id == task_id).first()
        else:
            with SessionLocal() as s:
                row = s.query(GeneratedTaskRow).filter(GeneratedTaskRow.task_id == task_id).first()

        if row:
            return TaskSpec.model_validate_json(row.spec_json)
    except Exception:
        pass

    return None


def list_tasks() -> list[TaskSpec]:
    """List all registered tasks from scenario files only."""
    from app.attacks.loader import load_scenarios
    return list(load_scenarios().values())
