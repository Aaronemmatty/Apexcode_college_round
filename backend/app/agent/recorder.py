"""Trace recorder for capturing structured events during a trial."""

from datetime import datetime, timezone
from typing import Any, Optional

from app.events import (
    Decision,
    EventType,
    ExecutionStatus,
    Source,
    TraceEvent,
)


class TraceRecorder:
    """Records chronological, sequentially-numbered TraceEvents for a trial."""

    def __init__(self, run_id: str, trial_id: str) -> None:
        self.run_id = run_id
        self.trial_id = trial_id
        self.events: list[TraceEvent] = []
        self._counter: int = 0

    def _next_event_id(self) -> str:
        self._counter += 1
        return f"evt_{self._counter:03d}"

    def record_agent_input(self, content: str, step: int = 0) -> TraceEvent:
        event = TraceEvent(
            event_id=self._next_event_id(),
            run_id=self.run_id,
            trial_id=self.trial_id,
            step=step,
            type=EventType.AGENT_INPUT,
            source=Source.USER_TASK,
            content=content,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        self.events.append(event)
        return event

    def record_tool_request(
        self,
        tool: str,
        arguments: dict[str, Any],
        source: Source,
        step: int,
    ) -> TraceEvent:
        event = TraceEvent(
            event_id=self._next_event_id(),
            run_id=self.run_id,
            trial_id=self.trial_id,
            step=step,
            type=EventType.TOOL_REQUEST,
            tool=tool,
            arguments=arguments,
            source=source,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        self.events.append(event)
        return event

    def record_tool_result(
        self,
        tool: str,
        execution_status: ExecutionStatus,
        result: Optional[dict[str, Any]],
        rule_id: Optional[str],
        step: int,
        decision: Optional[Decision] = None,
    ) -> TraceEvent:
        event = TraceEvent(
            event_id=self._next_event_id(),
            run_id=self.run_id,
            trial_id=self.trial_id,
            step=step,
            type=EventType.TOOL_RESULT,
            tool=tool,
            execution_status=execution_status,
            result=result,
            rule_id=rule_id,
            decision=decision,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        self.events.append(event)
        return event

    def record_final_output(self, content: str, step: int) -> TraceEvent:
        event = TraceEvent(
            event_id=self._next_event_id(),
            run_id=self.run_id,
            trial_id=self.trial_id,
            step=step,
            type=EventType.FINAL_OUTPUT,
            content=content,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        self.events.append(event)
        return event