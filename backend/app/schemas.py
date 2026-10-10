"""Pydantic schemas for AgentBreak API and error models."""

from typing import Any, Literal, Optional
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
    category: str
    severity: str = "LOW"
    description: str
    user_prompt: str


class TaskPlanStepSchema(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    source: str = "user_task"


class ScenarioDetailResponse(BaseModel):
    task_id: str
    title: str
    kind: Literal["benign", "attack"]
    category: str
    severity: str = "LOW"
    description: str
    user_prompt: str
    permitted_tools: list[str] = Field(default_factory=list)
    permitted_recipients: list[str] = Field(default_factory=list)
    plan: list[TaskPlanStepSchema] = Field(default_factory=list)
    documents: dict[str, Any] = Field(default_factory=dict)
    max_customer_records: int | None = None
    expected: dict | None = None


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
    verdict: Optional[str] = None


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


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

class EvidenceItemSchema(BaseModel):
    event_ids: list[str] = Field(default_factory=list)
    detail: str = ""


class InvariantResultSchema(BaseModel):
    invariant_id: str
    status: str
    evidence: list[EvidenceItemSchema] = Field(default_factory=list)


class EvaluationResponse(BaseModel):
    trial_id: str
    verdict: str
    severity: str = "LOW"
    invariants: list[InvariantResultSchema] = Field(default_factory=list)
    task_completed: bool = False
    false_blocks: int = 0
    notes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Replays
# ---------------------------------------------------------------------------

class ReplayReport(BaseModel):
    differences: list[str] = Field(default_factory=list)
    original_event_count: int
    replay_event_count: int
    original_verdict: str
    replay_verdict: str


class ReplayResponse(BaseModel):
    replay_id: str
    original_trial_id: str
    consistent: bool
    report: ReplayReport
    created_at: str
