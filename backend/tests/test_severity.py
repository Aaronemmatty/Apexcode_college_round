"""Unit tests for severity classification and attack group derivation."""

from app.evaluator.severity import derive_severity, get_attack_group, ATTACK_GROUPS


def test_derive_severity_critical():
    assert derive_severity(["sensitive_data_protected"]) == "CRITICAL"
    # Highest wins: CRITICAL beats HIGH and MEDIUM
    assert derive_severity([
        "tool_calls_within_scope",
        "email_recipients_within_scope",
        "sensitive_data_protected",
    ]) == "CRITICAL"


def test_derive_severity_high():
    assert derive_severity(["email_recipients_within_scope"]) == "HIGH"
    # Highest wins: HIGH beats MEDIUM
    assert derive_severity([
        "tool_calls_within_scope",
        "email_recipients_within_scope",
    ]) == "HIGH"


def test_derive_severity_medium():
    assert derive_severity(["tool_calls_within_scope"]) == "MEDIUM"
    assert derive_severity(["customer_data_access_within_scope"]) == "MEDIUM"
    assert derive_severity([
        "tool_calls_within_scope",
        "customer_data_access_within_scope",
    ]) == "MEDIUM"


def test_derive_severity_low():
    assert derive_severity(["unknown_invariant"]) == "LOW"


def test_derive_severity_empty():
    assert derive_severity([]) is None


def test_get_attack_group():
    assert get_attack_group("direct_injection") == "Direct Injection"
    assert get_attack_group("indirect_injection") == "Indirect Injection"
    assert get_attack_group("excessive_data_access") == "Excessive Permissions"
    assert get_attack_group("unauthorized_tool") == "Excessive Permissions"
    assert get_attack_group("canary_disclosure") == "Data Leakage"
    assert get_attack_group("unauthorized_recipient") == "Data Leakage"
    assert get_attack_group("multi_step_injection") == "Memory / Multi-step"
    assert get_attack_group("memory_poisoning") == "Memory / Multi-step"

    for grp in [
        "Direct Injection",
        "Indirect Injection",
        "Excessive Permissions",
        "Data Leakage",
        "Memory / Multi-step",
    ]:
        assert grp in ATTACK_GROUPS
