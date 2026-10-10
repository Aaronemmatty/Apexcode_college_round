"""Security gateway evaluator."""

from dataclasses import dataclass, field

from app.agent.executor import ToolRequest
from app.events import Decision
from app.gateway.policy import GatewayPolicy
from app.gateway.rules import evaluate_all_rules


@dataclass(frozen=True)
class GatewayDecision:
    """Outcome of a gateway evaluation for a tool request."""

    decision: Decision
    rule_id: str
    violations: list[str] = field(default_factory=list)
    reason: str = ""


class SecurityGateway:
    """Security gateway enforcing independent TaskSpec policy rules.

    The gateway NEVER reads document content or tool result text.
    """

    def __init__(self, policy: GatewayPolicy) -> None:
        self.policy = policy

    def evaluate(self, request: ToolRequest) -> GatewayDecision:
        """Evaluate a tool request against all independent policy rules."""
        violations = evaluate_all_rules(
            tool=request.tool,
            arguments=request.arguments,
            policy=self.policy,
        )

        if violations:
            highest = violations[0]
            return GatewayDecision(
                decision=Decision.BLOCKED,
                rule_id=highest.rule_id,
                violations=[v.rule_id for v in violations],
                reason=highest.message,
            )

        return GatewayDecision(
            decision=Decision.ALLOWED,
            rule_id="policy_allow",
            violations=[],
            reason="Request permitted by policy.",
        )
