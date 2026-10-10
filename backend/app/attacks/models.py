"""Scenario models."""

from typing import Literal, Optional
from pydantic import BaseModel, Field

class ScenarioPlanStep(BaseModel):
    tool: str
    arguments: dict = Field(default_factory=dict)
    source: str = "user_task"

class ScenarioPermissions(BaseModel):
    permitted_tools: list[str] = Field(default_factory=list)
    permitted_recipients: list[str] = Field(default_factory=list)
    max_customer_records: int

class ScenarioExpectedDefense(BaseModel):
    verdict: str
    violated_invariants: list[str] = Field(default_factory=list)
    blocked_rules: list[str] = Field(default_factory=list)
    task_completed: bool
    false_blocks: int
    residual: bool = False

class ScenarioExpected(BaseModel):
    none: ScenarioExpectedDefense
    gateway: ScenarioExpectedDefense

class ScenarioDocument(BaseModel):
    title: str
    content: str

class ScenarioDef(BaseModel):
    scenario_id: str
    title: str
    kind: Literal["attack", "benign"]
    category: str
    description: str
    user_prompt: str
    severity: Optional[Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]] = None
    plan: list[ScenarioPlanStep]
    permissions: ScenarioPermissions
    documents: dict[str, ScenarioDocument] = Field(default_factory=dict)
    expected: ScenarioExpected
