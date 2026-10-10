"""Tests for event schemas and serialization."""

from app.events import TraceEvent, Source

def test_old_persisted_events_deserialize():
    payload = '{"event_id": "evt_1", "run_id": "r", "trial_id": "t", "step": 1, "type": "tool_request", "tool": "read_document", "source": "user_task", "timestamp": "2026-10-10T00:00:00Z"}'
    ev = TraceEvent.model_validate_json(payload)
    assert ev.source == Source.USER_TASK

def test_user_prompt_injection_roundtrips():
    payload = '{"event_id": "evt_2", "run_id": "r", "trial_id": "t", "step": 2, "type": "tool_request", "tool": "read_document", "source": "user_prompt_injection", "timestamp": "2026-10-10T00:00:00Z"}'
    ev = TraceEvent.model_validate_json(payload)
    assert ev.source == Source.USER_PROMPT_INJECTION
    
    # Roundtrip
    dumped = ev.model_dump_json()
    ev2 = TraceEvent.model_validate_json(dumped)
    assert ev2.source == Source.USER_PROMPT_INJECTION
