"""Tool execution interface and direct execution adapter."""

from dataclasses import dataclass
from typing import Any, Optional, Protocol
from pydantic import BaseModel, Field

from app.events import Decision, ExecutionStatus, Source
from app.sandbox.tools import ToolEnvironment


class ToolRequest(BaseModel):
    """Specification of a tool call request."""
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    step: int = 0
    source: Optional[Source] = None


@dataclass
class ToolOutcome:
    """Outcome of tool execution returned by a ToolExecutor."""
    decision: Optional[Decision] = None
    execution_status: ExecutionStatus = ExecutionStatus.EXECUTED
    result: Optional[dict[str, Any]] = None
    rule_id: Optional[str] = None


class ToolExecutor(Protocol):
    """Seam interface decoupling agent logic from tool execution and gateway defenses."""

    def execute(self, request: ToolRequest) -> ToolOutcome:
        """Execute a tool request and return the outcome."""
        ...


class DirectExecutor:
    """Directly dispatches to the sandbox ToolEnvironment without defenses."""

    def __init__(self, env: ToolEnvironment) -> None:
        self.env = env

    def execute(self, request: ToolRequest) -> ToolOutcome:
        res = self.env.dispatch(request.tool, request.arguments)
        if isinstance(res, dict) and "error" in res:
            rule_id = res.get("rule_id")
            return ToolOutcome(
                decision=None,
                execution_status=ExecutionStatus.ERROR,
                result=res,
                rule_id=rule_id,
            )

        return ToolOutcome(
            decision=None,
            execution_status=ExecutionStatus.EXECUTED,
            result=res,
            rule_id=None,
        )
