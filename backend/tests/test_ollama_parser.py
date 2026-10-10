import pytest
from app.agent.ollama import OllamaAgent, ParseError
from app.agent.executor import DirectExecutor
from app.gateway.executor import GatewayExecutor
from app.gateway.gateway import SecurityGateway
from app.agent.recorder import TraceRecorder
from app.agent.tasks import TaskSpec
from app.events import Source
from app.sandbox.tools import ToolEnvironment

@pytest.fixture
def base_task():
    return TaskSpec(
        task_id="test_task",
        title="Test Task",
        user_prompt="Do something.",
        plan=[],
        permitted_tools=["search_customers", "read_document"],
        permitted_recipients=[],
        kind="benign",
        category="custom",
        documents={},
    )

@pytest.fixture
def recorder():
    return TraceRecorder(run_id="run_test", trial_id="trial_test")

def test_a_text_json_call_executed(base_task, recorder):
    env = ToolEnvironment(documents_overlay={})
    executor = DirectExecutor(env)
    saved_replies = [
        {"message": {"content": 'I will call search_customers: {"name": "search_customers", "arguments": {"query": "*"}}'}},
    ]
    agent = OllamaAgent(base_task, executor, recorder, saved_replies=saved_replies)
    agent.run()
    
    assert "[Format: text_json]" in agent.task.description
    events = recorder.events
    tool_reqs = [e for e in events if e.type.value == "tool_request"]
    assert len(tool_reqs) == 1
    assert tool_reqs[0].tool == "search_customers"

def test_b_fenced_json(base_task, recorder):
    env = ToolEnvironment(documents_overlay={})
    executor = DirectExecutor(env)
    saved_replies = [
        {"message": {"content": '```json\n{"name": "search_customers", "arguments": {"query": "*"}}\n```'}},
    ]
    agent = OllamaAgent(base_task, executor, recorder, saved_replies=saved_replies)
    agent.run()
    
    events = recorder.events
    tool_reqs = [e for e in events if e.type.value == "tool_request"]
    assert len(tool_reqs) == 1
    assert tool_reqs[0].tool == "search_customers"
    assert "[Format: text_json]" in agent.task.description

def test_c_two_calls_in_sequence(base_task, recorder):
    env = ToolEnvironment(documents_overlay={})
    executor = DirectExecutor(env)
    saved_replies = [
        {"message": {"content": '[{"name": "search_customers", "arguments": {"query": "*"}}, {"name": "read_document", "arguments": {"doc_id": "doc_1"}}]'}},
    ]
    agent = OllamaAgent(base_task, executor, recorder, saved_replies=saved_replies)
    agent.run()
    
    events = recorder.events
    tool_reqs = [e for e in events if e.type.value == "tool_request"]
    assert len(tool_reqs) == 2
    assert tool_reqs[0].tool == "search_customers"
    assert tool_reqs[1].tool == "read_document"

def test_d_unknown_tool_ignored(base_task, recorder):
    env = ToolEnvironment(documents_overlay={})
    executor = DirectExecutor(env)
    saved_replies = [
        {"message": {"content": '{"name": "destroy_world", "arguments": {}} {"name": "search_customers", "arguments": {"query": "*"}}'}},
    ]
    agent = OllamaAgent(base_task, executor, recorder, saved_replies=saved_replies)
    agent.run()
    
    events = recorder.events
    tool_reqs = [e for e in events if e.type.value == "tool_request"]
    assert len(tool_reqs) == 1
    assert tool_reqs[0].tool == "search_customers"

def test_e_malformed_json_inconclusive(base_task, recorder):
    env = ToolEnvironment(documents_overlay={})
    executor = DirectExecutor(env)
    saved_replies = [
        {"message": {"content": 'I am calling {"name": "search_customers", "arguments": {"query": "*"} oops missing brace'}},
    ]
    agent = OllamaAgent(base_task, executor, recorder, saved_replies=saved_replies)
    agent.run()
    
    assert agent.inconclusive is True
    events = recorder.events
    assert any("INCONCLUSIVE:" in str(e.content) for e in events if e.type.value == "final_output")

def test_f_defense_gateway_blocked(base_task, recorder):
    env = ToolEnvironment(documents_overlay={})
    inner = DirectExecutor(env)
    from app.gateway.policy import GatewayPolicy
    base_task.max_customer_records = 0
    gateway = SecurityGateway(GatewayPolicy.from_task(base_task))
    executor = GatewayExecutor(inner, gateway, recorder)
    saved_replies = [
        {"message": {"content": '{"name": "search_customers", "arguments": {"query": "*"}}'}},
    ]
    agent = OllamaAgent(base_task, executor, recorder, saved_replies=saved_replies)
    agent.run()
    
    events = recorder.events
    gateway_events = [e for e in events if e.type.value == "gateway_decision"]
    assert len(gateway_events) > 0
    assert gateway_events[0].decision.value == "blocked"
    assert gateway_events[0].rule_id == "excessive_data_access"

