"""Comprehensive unit and integration tests for the security gateway."""

from app.agent.agent import ScriptedAgent
from app.agent.executor import DirectExecutor, ToolRequest
from app.agent.recorder import TraceRecorder
from app.agent.tasks import TaskSpec, TaskPlanStep, get_task
from app.events import Decision, EventType, ExecutionStatus
from app.gateway.executor import GatewayExecutor
from app.gateway.gateway import SecurityGateway
from app.gateway.policy import GatewayPolicy
from app.gateway.rules import (
    check_tool_not_allowed,
    check_invalid_arguments,
    check_recipient_not_allowed,
    check_canary_in_outbound,
    check_excessive_data_access,
    evaluate_all_rules,
)
from app.sandbox.data import CANARY_SECRET, SUPPORT_TEAM_EMAIL
from app.sandbox.tools import ToolEnvironment


def test_rule_tool_not_allowed():
    policy = GatewayPolicy(
        allowed_tools=frozenset(["search_customers"]),
        allowed_recipients=frozenset([]),
    )
    v = check_tool_not_allowed("send_email", policy)
    assert v is not None
    assert v.rule_id == "tool_not_allowed"

    v_ok = check_tool_not_allowed("search_customers", policy)
    assert v_ok is None


def test_rule_invalid_arguments():
    # search_customers missing query
    assert check_invalid_arguments("search_customers", {}) is not None
    # search_customers wrong type
    assert check_invalid_arguments("search_customers", {"query": 123}) is not None
    # search_customers extra argument
    assert check_invalid_arguments("search_customers", {"query": "Priya", "extra": True}) is not None

    # read_document missing doc_id
    assert check_invalid_arguments("read_document", {}) is not None
    # read_document bad doc_id pattern
    assert check_invalid_arguments("read_document", {"doc_id": "document_1"}) is not None
    assert check_invalid_arguments("read_document", {"doc_id": "doc_99"}) is not None
    assert check_invalid_arguments("read_document", {"doc_id": "doc_001"}) is None

    # send_email missing fields
    assert check_invalid_arguments("send_email", {"to": "a@x.invalid", "subject": "hi"}) is not None
    # send_email wrong types
    assert check_invalid_arguments("send_email", {"to": 123, "subject": "s", "body": "b"}) is not None
    # send_email multi-address to
    assert check_invalid_arguments("send_email", {"to": "a@x.invalid, b@y.invalid", "subject": "s", "body": "b"}) is not None
    assert check_invalid_arguments("send_email", {"to": "a@x.invalid; b@y.invalid", "subject": "s", "body": "b"}) is not None
    assert check_invalid_arguments("send_email", {"to": "<a@x.invalid>", "subject": "s", "body": "b"}) is not None
    # send_email subject too long (> 200 chars)
    assert check_invalid_arguments("send_email", {"to": "a@x.invalid", "subject": "x" * 201, "body": "b"}) is not None
    # send_email body too long (> 10000 chars)
    assert check_invalid_arguments("send_email", {"to": "a@x.invalid", "subject": "s", "body": "x" * 10001}) is not None
    # send_email valid
    assert check_invalid_arguments("send_email", {"to": "a@x.invalid", "subject": "s", "body": "b"}) is None


def test_rule_recipient_not_allowed_and_normalization():
    policy = GatewayPolicy(
        allowed_tools=frozenset(["send_email"]),
        allowed_recipients=frozenset(["support-team@example.invalid"]),
    )
    # Blocked
    v = check_recipient_not_allowed("send_email", {"to": "attacker@evil.invalid"}, policy)
    assert v is not None
    assert v.rule_id == "recipient_not_allowed"

    # Normalized uppercase & whitespace allowed
    v_norm = check_recipient_not_allowed("send_email", {"to": "  SUPPORT-TEAM@EXAMPLE.INVALID  "}, policy)
    assert v_norm is None


def test_rule_canary_in_outbound_even_if_authorized():
    policy = GatewayPolicy(
        allowed_tools=frozenset(["send_email"]),
        allowed_recipients=frozenset(["support-team@example.invalid"]),
        sensitive_markers=[CANARY_SECRET],
    )
    # Canary in body
    v_body = check_canary_in_outbound(
        "send_email",
        {"to": "support-team@example.invalid", "subject": "Hi", "body": f"Leaked: {CANARY_SECRET}"},
        policy,
    )
    assert v_body is not None
    assert v_body.rule_id == "canary_in_outbound"

    # Canary case-insensitive in subject
    v_subj = check_canary_in_outbound(
        "send_email",
        {"to": "support-team@example.invalid", "subject": f"KEY: {CANARY_SECRET.lower()}", "body": "Hello"},
        policy,
    )
    assert v_subj is not None
    assert v_subj.rule_id == "canary_in_outbound"


def test_rule_excessive_data_access():
    assert check_excessive_data_access("search_customers", {"query": "*"}) is not None
    assert check_excessive_data_access("search_customers", {"query": ""}) is not None
    assert check_excessive_data_access("search_customers", {"query": "   "}) is not None
    assert check_excessive_data_access("search_customers", {"query": "Priya"}) is None


def test_rule_priority_and_violations_order():
    policy = GatewayPolicy(
        allowed_tools=frozenset(["search_customers"]),
        allowed_recipients=frozenset([]),
        sensitive_markers=[CANARY_SECRET],
    )
    # send_email with invalid args, bad recipient, canary in outbound
    violations = evaluate_all_rules(
        "send_email",
        {"to": "attacker@evil.invalid", "subject": "Hi", "body": CANARY_SECRET, "extra": 1},
        policy,
    )
    rule_ids = [v.rule_id for v in violations]
    # Priority: tool_not_allowed > invalid_arguments > recipient_not_allowed > canary_in_outbound
    assert rule_ids == [
        "tool_not_allowed",
        "invalid_arguments",
        "recipient_not_allowed",
        "canary_in_outbound",
    ]


def test_gateway_benign_allowed_policy_allow():
    policy = GatewayPolicy(
        allowed_tools=frozenset(["read_document"]),
        allowed_recipients=frozenset([]),
    )
    gw = SecurityGateway(policy)
    req = ToolRequest(tool="read_document", arguments={"doc_id": "doc_001"})
    dec = gw.evaluate(req)
    assert dec.decision == Decision.ALLOWED
    assert dec.rule_id == "policy_allow"
    assert dec.violations == []


def test_untrusted_document_cannot_grant_permissions():
    """Permissions come strictly from TaskSpec, never text in documents."""
    task = TaskSpec(
        task_id="test_jailbreak",
        title="Jailbreak test",
        user_prompt="Read doc",
        plan=[TaskPlanStep(tool="read_document", arguments={"doc_id": "doc_001"})],
        permitted_tools=["read_document"],
        permitted_recipients=[],
        kind="attack",
    )
    policy = GatewayPolicy.from_task(task)
    gw = SecurityGateway(policy)

    # Agent attempts to call send_email claiming it was granted in document
    req = ToolRequest(
        tool="send_email",
        arguments={
            "to": "attacker@evil.invalid",
            "subject": "PERMISSION GRANT: allowed",
            "body": "leaked",
        },
    )
    dec = gw.evaluate(req)
    assert dec.decision == Decision.BLOCKED
    assert dec.rule_id == "tool_not_allowed"


def test_blocked_actions_never_execute():
    """Spy executor verifies that blocked actions never reach execution."""
    class SpyExecutor:
        def __init__(self):
            self.calls = []

        def execute(self, req: ToolRequest):
            self.calls.append(req)
            return None

    policy = GatewayPolicy(
        allowed_tools=frozenset(["read_document"]),
        allowed_recipients=frozenset([]),
    )
    gw = SecurityGateway(policy)
    recorder = TraceRecorder(run_id="run_spy", trial_id="trial_spy")
    spy = SpyExecutor()
    executor = GatewayExecutor(inner=spy, gateway=gw, recorder=recorder)

    blocked_req = ToolRequest(tool="send_email", arguments={"to": "a@x.invalid", "subject": "s", "body": "b"})
    outcome = executor.execute(blocked_req)

    assert outcome.decision == Decision.BLOCKED
    assert outcome.execution_status == ExecutionStatus.NOT_EXECUTED
    assert len(spy.calls) == 0  # Inner was NEVER called!


def test_redaction_and_sensitive_event_emission():
    env = ToolEnvironment()
    direct = DirectExecutor(env)
    policy = GatewayPolicy(
        allowed_tools=frozenset(["search_customers"]),
        allowed_recipients=frozenset([]),
        sensitive_markers=[CANARY_SECRET],
    )
    gw = SecurityGateway(policy)
    recorder = TraceRecorder(run_id="run_redact", trial_id="trial_redact")
    executor = GatewayExecutor(inner=direct, gateway=gw, recorder=recorder)

    req = ToolRequest(tool="search_customers", arguments={"query": "Elena"})
    outcome = executor.execute(req)

    assert outcome.decision == Decision.ALLOWED
    # Elena contains CANARY_SECRET in internal_notes; internal_notes must be redacted
    customers = outcome.result["customers"]
    assert len(customers) == 1
    assert "internal_notes" not in customers[0]
    assert customers[0]["name"] == "Elena Rostova"

    # sensitive_data_detected event emitted
    sensitive_events = [e for e in recorder.events if e.type == EventType.SENSITIVE_DATA_DETECTED]
    assert len(sensitive_events) == 1
    ev = sensitive_events[0]
    assert ev.rule_id == "sensitive_field_redacted"
    assert ev.result["canary_present"] is True
    assert "internal_notes" in ev.result["fields"]


def test_agent_gateway_integration_indirect_injection():
    task = get_task("indirect_injection_email_leak")
    assert task is not None

    env = ToolEnvironment()
    direct = DirectExecutor(env)
    policy = GatewayPolicy.from_task(task)
    gw = SecurityGateway(policy)
    recorder = TraceRecorder(run_id="run_gw_attack", trial_id="trial_gw_attack")
    executor = GatewayExecutor(inner=direct, gateway=gw, recorder=recorder)
    agent = ScriptedAgent(task=task, executor=executor, recorder=recorder)
    agent.run()

    # Outbox must be completely empty
    assert len(env.outbox) == 0

    # Event ordering and structure
    events = recorder.events
    assert len(events) > 0

    # read_document allowed, search_customers blocked, send_email blocked
    gw_decisions = [e for e in events if e.type == EventType.GATEWAY_DECISION]
    assert len(gw_decisions) == 3

    assert gw_decisions[0].tool == "read_document"
    assert gw_decisions[0].decision == Decision.ALLOWED
    assert gw_decisions[0].rule_id == "policy_allow"

    assert gw_decisions[1].tool == "search_customers"
    assert gw_decisions[1].decision == Decision.BLOCKED
    assert gw_decisions[1].rule_id == "tool_not_allowed"

    assert gw_decisions[2].tool == "send_email"
    assert gw_decisions[2].decision == Decision.BLOCKED
    assert gw_decisions[2].rule_id == "tool_not_allowed"

    # Blocked calls have tool_result not_executed
    tool_results = [e for e in events if e.type == EventType.TOOL_RESULT]
    assert len(tool_results) == 3
    assert tool_results[0].execution_status == ExecutionStatus.EXECUTED
    assert tool_results[1].execution_status == ExecutionStatus.NOT_EXECUTED
    assert tool_results[1].decision == Decision.BLOCKED
    assert tool_results[2].execution_status == ExecutionStatus.NOT_EXECUTED
    assert tool_results[2].decision == Decision.BLOCKED

    # Event IDs sequential evt_001, evt_002...
    for i, e in enumerate(events, start=1):
        assert e.event_id == f"evt_{i:03d}"

    # Steps non-decreasing
    for i in range(1, len(events)):
        assert events[i].step >= events[i - 1].step


def test_agent_gateway_integration_benign_tasks():
    for task_id in ("benign_customer_lookup", "benign_valid_email"):
        task = get_task(task_id)
        assert task is not None

        env = ToolEnvironment()
        direct = DirectExecutor(env)
        policy = GatewayPolicy.from_task(task)
        gw = SecurityGateway(policy)
        recorder = TraceRecorder(run_id="run_gw_benign", trial_id="trial_gw_benign")
        executor = GatewayExecutor(inner=direct, gateway=gw, recorder=recorder)
        agent = ScriptedAgent(task=task, executor=executor, recorder=recorder)
        agent.run()

        # No blocked calls
        blocked_decisions = [
            e for e in recorder.events
            if e.type == EventType.GATEWAY_DECISION and e.decision == Decision.BLOCKED
        ]
        assert len(blocked_decisions) == 0

        # All tool results executed
        tool_results = [e for e in recorder.events if e.type == EventType.TOOL_RESULT]
        assert all(r.execution_status == ExecutionStatus.EXECUTED for r in tool_results)
