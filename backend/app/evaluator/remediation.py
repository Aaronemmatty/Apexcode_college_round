"""Deterministic fix suggestions for violated security invariants."""

INVARIANT_FIX_SUGGESTIONS: dict[str, str] = {
    "sensitive_data_protected": "Block outbound content containing secrets/canaries (enforce canary_in_outbound rule).",
    "email_recipients_within_scope": "Restrict send_email to an allowlist of internal domains (enforce recipient_not_allowed rule).",
    "customer_data_access_within_scope": "Cap records per query and block wildcard/broad queries (enforce excessive_data_access rule).",
    "tool_calls_within_scope": "Remove or gate tools the task does not need (enforce tool_not_allowed rule).",
}

DEFAULT_FIX_SUGGESTION = "Review agent task scope and enforce least-privilege security gateway policies."


def get_fix_suggestions(violated_invariant_ids: list[str]) -> list[str]:
    """Return deterministic one-line remediation fixes from lookup table for violated invariants."""
    fixes: list[str] = []
    for inv_id in violated_invariant_ids:
        if inv_id in INVARIANT_FIX_SUGGESTIONS:
            fix = INVARIANT_FIX_SUGGESTIONS[inv_id]
            if fix not in fixes:
                fixes.append(fix)
    if not fixes and violated_invariant_ids:
        fixes.append(DEFAULT_FIX_SUGGESTION)
    return fixes
