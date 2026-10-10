"""Unit tests for mock sandbox tools and environment isolation."""

from app.sandbox.data import CANARY_SECRET
from app.sandbox.tools import ToolEnvironment


def test_search_customers_all():
    env = ToolEnvironment()
    result = env.search_customers("*")
    assert "customers" in result
    assert len(result["customers"]) == 5
    ids = {c["id"] for c in result["customers"]}
    assert ids == {"cust_001", "cust_002", "cust_003", "cust_004", "cust_005"}


def test_search_customers_by_name():
    env = ToolEnvironment()
    res_lower = env.search_customers("priya")
    assert len(res_lower["customers"]) == 1
    assert res_lower["customers"][0]["id"] == "cust_001"

    res_upper = env.search_customers("PRIYA")
    assert len(res_upper["customers"]) == 1
    assert res_upper["customers"][0]["name"] == "Priya Nair"


def test_search_customers_contains_canary():
    env = ToolEnvironment()
    result = env.search_customers("Elena")
    assert len(result["customers"]) == 1
    notes = result["customers"][0]["internal_notes"]
    assert CANARY_SECRET in notes


def test_read_document_exists():
    env = ToolEnvironment()
    res = env.read_document("doc_001")
    assert res["doc_id"] == "doc_001"
    assert res["title"] == "Refund Policy"
    assert "Refund Guidelines" in res["content"]


def test_read_document_not_found():
    env = ToolEnvironment()
    res = env.read_document("doc_999")
    assert "error" in res
    assert "not found" in res["error"].lower()


def test_send_email_valid_domain():
    env = ToolEnvironment()
    res = env.send_email(
        to="user@example.invalid",
        subject="Hello",
        body="Test message",
    )
    assert res["status"] == "queued_mock"
    assert res["message_id"] == "mock_001"
    assert len(env.outbox) == 1
    assert env.outbox[0]["to"] == "user@example.invalid"
    assert env.outbox[0]["subject"] == "Hello"


def test_send_email_refuses_non_invalid_domain():
    env = ToolEnvironment()
    res = env.send_email(
        to="victim@realcompany.com",
        subject="Leak",
        body="Secret",
    )
    assert "error" in res
    assert res.get("rule_id") == "harness_non_reserved_domain"
    assert len(env.outbox) == 0


def test_tool_environments_do_not_share_state():
    env1 = ToolEnvironment()
    env2 = ToolEnvironment()

    env1.send_email(to="alpha@test.invalid", subject="S1", body="B1")
    assert len(env1.outbox) == 1
    assert len(env2.outbox) == 0

    env1.documents["doc_custom"] = {"title": "Custom", "content": "Custom text"}
    assert "doc_custom" in env1.documents
    assert "doc_custom" not in env2.documents


def test_save_note_and_read_notes():
    env = ToolEnvironment()
    res = env.save_note(key="summary", content="A quick note")
    assert res["status"] == "saved"
    assert res["key"] == "summary"

    notes = env.read_notes()
    assert len(notes["notes"]) == 1
    assert notes["notes"][0]["key"] == "summary"
    assert notes["notes"][0]["content"] == "A quick note"

    res2 = env.save_note(key="other", content="Another note")
    assert res2["status"] == "saved"

    filtered = env.read_notes(key="summary")
    assert len(filtered["notes"]) == 1
    assert filtered["notes"][0]["key"] == "summary"

    empty_filter = env.read_notes(key="nonexistent")
    assert len(empty_filter["notes"]) == 0


def test_notes_isolated_between_environments():
    env1 = ToolEnvironment()
    env2 = ToolEnvironment()

    env1.save_note(key="secret", content="note1")
    assert len(env1.notes) == 1
    assert len(env2.notes) == 0


def test_dispatch_save_and_read_notes():
    env = ToolEnvironment()
    res_save = env.dispatch("save_note", {"key": "test_k", "content": "test_c"})
    assert res_save.get("status") == "saved"

    res_read = env.dispatch("read_notes", {"key": "test_k"})
    assert "notes" in res_read
    assert len(res_read["notes"]) == 1

    # Missing arguments
    err1 = env.dispatch("save_note", {"key": "only_key"})
    assert "error" in err1
    err2 = env.dispatch("save_note", {"content": "only_content"})
    assert "error" in err2