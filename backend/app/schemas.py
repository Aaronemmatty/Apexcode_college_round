"""Pydantic schemas for AgentBreak API and error models."""

from typing import Any, Literal
from pydantic import BaseModel, Field

from app.events import TraceEvent


class HealthResponse(BaseModel):
    status: str = Field(default="ok")
    service: str = Field(default="AgentBreak")
    version: str = Field(default="0.1.0")


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


# ---------------------------------------------------------------------------
# Scenarios / Tasks
# ---------------------------------------------------------------------------

class ScenarioSummaryResponse(BaseModel):
    task_id: str
    title: str
    kind: Literal["benign", "attack"]
    user_prompt: str


class TaskPlanStepSchema(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ScenarioDetailResponse(BaseModel):
    task_id: str
    title: str
    kind: Literal["benign", "attack"]
    user_prompt: str
    permitted_tools: list[str] = Field(default_factory=list)
    permitted_recipients: list[str] = Field(default_factory=list)
    plan: list[TaskPlanStepSchema] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Runs & Trials
# ---------------------------------------------------------------------------

class RunCreateRequest(BaseModel):
    task_id: str
    defense: str = Field(default="none")


class TrialSummary(BaseModel):
    trial_id: str
    status: str
    event_count: int


class RunResponse(BaseModel):
    run_id: str
    task_id: str
    defense: str
    status: str
    trials: list[TrialSummary] = Field(default_factory=list)


class TrialTraceResponse(BaseModel):
    trial_id: str
    run_id: str
    status: str
    events: list[TraceEvent] = Field(default_factory=list)