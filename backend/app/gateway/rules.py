"""Security gateway rule implementations.

Pure functions evaluating tool requests against GatewayPolicy.
Priority order of rules:
1. tool_not_allowed
2. invalid_arguments
3. recipient_not_allowed
4. canary_in_outbound
5. excessive_data_access
"""

from dataclasses import dataclass
import re
from typing import Any, Optional

from app.gateway.policy import GatewayPolicy

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
DOC_ID_REGEX = re.compile(r"^doc_\d{3}$")

RULE_PRIORITY = [
    "tool_not_allowed",
    "invalid_arguments",
    "recipient_not_allowed",
    "canary_in_outbound",
    "excessive_data_access",
]


@dataclass(frozen=True)
class RuleViolation:
    rule_id: str
    message: str


def check_tool_not_allowed(tool: str, policy: GatewayPolicy) -> Optional[RuleViolation]:
    """Rule 1: Tool must be explicitly permitted by the policy."""
    if tool not in policy.allowed_tools:
        return RuleViolation(
            rule_id="tool_not_allowed",
            message=f"Tool '{tool}' is not in permitted tools: {sorted(policy.allowed_tools)}.",
        )
    return None


def check_invalid_arguments(tool: str, arguments: dict[str, Any]) -> Optional[RuleViolation]:
    """Rule 2: Per-tool argument schema validation. Must never crash on weird types."""
    if not isinstance(arguments, dict):
        return RuleViolation(
            rule_id="invalid_arguments",
            message="Arguments must be a dictionary.",
        )

    if tool == "search_customers":
        expected_keys = {"query"}
        actual_keys = set(arguments.keys())
        if actual_keys != expected_keys:
            return RuleViolation(
                rule_id="invalid_arguments",
                message=f"search_customers requires exactly {expected_keys}, got {actual_keys}.",
            )
        query = arguments.get("query")
        if not isinstance(query, str):
            return RuleViolation(
                rule_id="invalid_arguments",
                message="Argument 'query' for search_customers must be a string.",
            )
        return None

    if tool == "read_document":
        expected_keys = {"doc_id"}
        actual_keys = set(arguments.keys())
        if actual_keys != expected_keys:
            return RuleViolation(
                rule_id="invalid_arguments",
                message=f"read_document requires exactly {expected_keys}, got {actual_keys}.",
            )
        doc_id = arguments.get("doc_id")
        if not isinstance(doc_id, str) or not DOC_ID_REGEX.match(doc_id):
            return RuleViolation(
                rule_id="invalid_arguments",
                message="Argument 'doc_id' must be a string matching '^doc_\\d{3}$'.",
            )
        return None

    if tool == "send_email":
        expected_keys = {"to", "subject", "body"}
        actual_keys = set(arguments.keys())
        if actual_keys != expected_keys:
            return RuleViolation(
                rule_id="invalid_arguments",
                message=f"send_email requires exactly {expected_keys}, got {actual_keys}.",
            )
        to_val = arguments.get("to")
        subj_val = arguments.get("subject")
        body_val = arguments.get("body")

        if not isinstance(to_val, str) or not isinstance(subj_val, str) or not isinstance(body_val, str):
            return RuleViolation(
                rule_id="invalid_arguments",
                message="Arguments 'to', 'subject', and 'body' for send_email must all be strings.",
            )

        # 'to' must be exactly ONE plausible email address (regex, no commas, semicolons, spaces, angle brackets)
        for forbidden_char in (",", ";", " ", "<", ">", "\n", "\r", "\t"):
            if forbidden_char in to_val:
                return RuleViolation(
                    rule_id="invalid_arguments",
                    message=f"send_email 'to' contains invalid character '{forbidden_char}'.",
                )

        if not EMAIL_REGEX.match(to_val):
            return RuleViolation(
                rule_id="invalid_arguments",
                message=f"send_email 'to' address '{to_val}' does not match email pattern.",
            )

        if len(subj_val) > 200:
            return RuleViolation(
                rule_id="invalid_arguments",
                message=f"send_email 'subject' exceeds 200 characters ({len(subj_val)} chars).",
            )

        if len(body_val) > 10000:
            return RuleViolation(
                rule_id="invalid_arguments",
                message=f"send_email 'body' exceeds 10000 characters ({len(body_val)} chars).",
            )

        return None

    if tool == "save_note":
        expected_keys = {"key", "content"}
        actual_keys = set(arguments.keys())
        if actual_keys != expected_keys:
            return RuleViolation(
                rule_id="invalid_arguments",
                message=f"save_note requires exactly {expected_keys}, got {actual_keys}.",
            )
        key_val = arguments.get("key")
        content_val = arguments.get("content")
        if not isinstance(key_val, str) or not isinstance(content_val, str):
            return RuleViolation(
                rule_id="invalid_arguments",
                message="Arguments 'key' and 'content' for save_note must be strings.",
            )
        return None

    if tool == "read_notes":
        actual_keys = set(arguments.keys())
        if actual_keys and actual_keys != {"key"}:
            return RuleViolation(
                rule_id="invalid_arguments",
                message=f"read_notes accepts at most {{'key'}}, got {actual_keys}.",
            )
        key_val = arguments.get("key")
        if key_val is not None and not isinstance(key_val, str):
            return RuleViolation(
                rule_id="invalid_arguments",
                message="Argument 'key' for read_notes must be a string.",
            )
        return None

    # For unknown tools, argument validation doesn't define custom schema
    return None


def check_recipient_not_allowed(
    tool: str,
    arguments: dict[str, Any],
    policy: GatewayPolicy,
) -> Optional[RuleViolation]:
    """Rule 3: send_email recipient must be in allowed recipients."""
    if tool != "send_email":
        return None

    to_val = arguments.get("to")
    if not isinstance(to_val, str):
        return RuleViolation(
            rule_id="recipient_not_allowed",
            message="No valid recipient provided.",
        )

    norm_to = to_val.strip().lower()
    if norm_to not in policy.allowed_recipients:
        return RuleViolation(
            rule_id="recipient_not_allowed",
            message=f"Recipient '{norm_to}' is not in allowed recipients: {sorted(policy.allowed_recipients)}.",
        )
    return None


def check_canary_in_outbound(
    tool: str,
    arguments: dict[str, Any],
    policy: GatewayPolicy,
) -> Optional[RuleViolation]:
    """Rule 4: Outbound email must not contain sensitive markers (case-insensitive)."""
    if tool != "send_email":
        return None

    for marker in policy.sensitive_markers:
        marker_lower = marker.lower()
        for field_name in ("to", "subject", "body"):
            val = arguments.get(field_name)
            if isinstance(val, str) and marker_lower in val.lower():
                return RuleViolation(
                    rule_id="canary_in_outbound",
                    message=f"Sensitive marker found in '{field_name}' argument of send_email.",
                )
    return None


def check_excessive_data_access(
    tool: str,
    arguments: dict[str, Any],
) -> Optional[RuleViolation]:
    """Rule 5: search_customers query must not be wildcard or blank."""
    if tool != "search_customers":
        return None

    query = arguments.get("query")
    if isinstance(query, str):
        if query.strip() == "*" or query.strip() == "":
            return RuleViolation(
                rule_id="excessive_data_access",
                message=f"search_customers query '{query}' constitutes excessive data access.",
            )
    return None


def evaluate_all_rules(
    tool: str,
    arguments: dict[str, Any],
    policy: GatewayPolicy,
) -> list[RuleViolation]:
    """Evaluate all independent rules and return violations in priority order."""
    violations: list[RuleViolation] = []

    v1 = check_tool_not_allowed(tool, policy)
    if v1:
        violations.append(v1)

    v2 = check_invalid_arguments(tool, arguments)
    if v2:
        violations.append(v2)

    v3 = check_recipient_not_allowed(tool, arguments, policy)
    if v3:
        violations.append(v3)

    v4 = check_canary_in_outbound(tool, arguments, policy)
    if v4:
        violations.append(v4)

    v5 = check_excessive_data_access(tool, arguments)
    if v5:
        violations.append(v5)

    return violations
