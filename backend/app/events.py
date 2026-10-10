"""Trace event contract models and enums for AgentBreak."""

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class EventType(str, Enum):
    AGENT_INPUT = "agent_input"
    TOOL_REQUEST = "tool_request"
    GATEWAY_DECISION = "gateway_decision"
    TOOL_RESULT = "tool_result"
    SENSITIVE_DATA_DETECTED = "sensitive_data_detected"
    FINAL_OUTPUT = "final_output"


class Decision(str, Enum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"
    PENDING_APPROVAL = "pending_approval"


class ExecutionStatus(str, Enum):
    EXECUTED = "executed"
    NOT_EXECUTED = "not_executed"
    ERROR = "error"


class Source(str, Enum):
    USER_TASK = "user_task"
    UNTRUSTED_DOCUMENT = "untrusted_document"
    USER_PROMPT_INJECTION = "user_prompt_injection"


class TraceEvent(BaseModel):
    """Canonical event shape emitted during agent execution."""

    event_id: str = Field(description="Sequential event id per trial, e.g. evt_001")
    run_id: str = Field(description="Associated run ID")
    trial_id: str = Field(description="Associated trial ID")
    step: int = Field(description="Non-decreasing step counter")
    type: EventType = Field(description="Type of event")
    tool: Optional[str] = Field(default=None, description="Tool name for tool events")
    arguments: Optional[dict[str, Any]] = Field(default=None, description="Arguments for tool request")
    source: Optional[Source] = Field(default=None, description="Source provenance of action")
    decision: Optional[Decision] = Field(default=None, description="Gateway decision (Phase 3)")
    execution_status: Optional[ExecutionStatus] = Field(default=None, description="Execution status")
    rule_id: Optional[str] = Field(default=None, description="Triggered security or harness rule ID")
    result: Optional[dict[str, Any]] = Field(default=None, description="Tool execution result")
    content: Optional[str] = Field(default=None, description="Text content for agent_input/final_output")
    timestamp: str = Field(description="ISO-8601 UTC timestamp")

    model_config = {"extra": "forbid"}