"""GatewayExecutor: wraps ToolExecutor with SecurityGateway enforcement and trace recording."""

import json
from typing import Any

from app.agent.executor import ToolExecutor, ToolOutcome, ToolRequest
from app.agent.recorder import TraceRecorder
from app.events import Decision, ExecutionStatus
from app.gateway.gateway import SecurityGateway


class GatewayExecutor:
    """Evaluates requests via SecurityGateway before delegating to the inner executor."""

    def __init__(
        self,
        inner: ToolExecutor,
        gateway: SecurityGateway,
        recorder: TraceRecorder,
    ) -> None:
        self.inner = inner
        self.gateway = gateway
        self.recorder = recorder

    def execute(self, request: ToolRequest) -> ToolOutcome:
        decision = self.gateway.evaluate(request)

        # 1. Record gateway_decision event
        self.recorder.record_gateway_decision(
            tool=request.tool,
            arguments=request.arguments,
            decision=decision.decision,
            rule_id=decision.rule_id,
            step=request.step,
            reason=decision.reason,
            violations=decision.violations,
            source=request.source,
        )

        if decision.decision == Decision.BLOCKED:
            if "canary_in_outbound" in decision.violations:
                self.recorder.record_sensitive_data_detected(
                    tool=request.tool,
                    step=request.step,
                    rule_id="canary_in_outbound",
                    fields=[],
                    canary_present=True,
                    location="tool_arguments",
                )
            return ToolOutcome(
                decision=Decision.BLOCKED,
                execution_status=ExecutionStatus.NOT_EXECUTED,
                result={"error": "Blocked by security gateway", "rule_id": decision.rule_id},
                rule_id=decision.rule_id,
            )

        # Allowed: dispatch to inner executor
        outcome = self.inner.execute(request)

        # Post-process result
        sensitive_detected = False
        redacted_fields: list[str] = []
        canary_found = False

        if outcome.result is not None:
            raw_str = json.dumps(outcome.result, default=str)
            for marker in self.gateway.policy.sensitive_markers:
                if marker.lower() in raw_str.lower():
                    canary_found = True
                    sensitive_detected = True

        if request.tool == "search_customers" and isinstance(outcome.result, dict):
            customers = outcome.result.get("customers")
            if isinstance(customers, list):
                modified_customers: list[dict[str, Any]] = []
                for cust in customers:
                    if isinstance(cust, dict):
                        cust_copy = dict(cust)
                        if "internal_notes" in cust_copy:
                            del cust_copy["internal_notes"]
                            redacted_fields = ["internal_notes"]
                            sensitive_detected = True
                        modified_customers.append(cust_copy)
                    else:
                        modified_customers.append(cust)
                outcome.result["customers"] = modified_customers

        if sensitive_detected:
            self.recorder.record_sensitive_data_detected(
                tool=request.tool,
                step=request.step,
                rule_id="sensitive_field_redacted",
                fields=redacted_fields,
                canary_present=canary_found,
                location="tool_result",
            )

        outcome.decision = Decision.ALLOWED
        outcome.rule_id = decision.rule_id
        return outcome
