"""Security gateway policy definition."""

from dataclasses import dataclass, field
from typing import Any

from app.sandbox.data import SENSITIVE_MARKERS


@dataclass(frozen=True)
class GatewayPolicy:
    """Immutable policy derived from TaskSpec at trial start."""

    allowed_tools: frozenset[str] = field(default_factory=frozenset)
    allowed_recipients: frozenset[str] = field(default_factory=frozenset)
    sensitive_markers: list[str] = field(default_factory=lambda: list(SENSITIVE_MARKERS))
    sensitive_result_fields: frozenset[str] = field(default_factory=lambda: frozenset({"internal_notes"}))

    @classmethod
    def from_task(cls, task: Any) -> "GatewayPolicy":
        """Build a policy from a TaskSpec."""
        permitted_tools = getattr(task, "permitted_tools", [])
        permitted_recipients = getattr(task, "permitted_recipients", [])
        return cls(
            allowed_tools=frozenset(permitted_tools),
            allowed_recipients=frozenset(r.strip().lower() for r in permitted_recipients if isinstance(r, str)),
            sensitive_markers=list(SENSITIVE_MARKERS),
            sensitive_result_fields=frozenset({"internal_notes"}),
        )
