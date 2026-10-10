"""Tests for scenario loader models."""

import pytest
from pydantic import ValidationError
from app.attacks.models import ScenarioDef

def test_missing_max_customer_records_fails():
    data = {
        "scenario_id": "test",
        "title": "Test",
        "kind": "benign",
        "category": "test",
        "description": "test",
        "user_prompt": "test",
        "plan": [],
        "permissions": {
            "permitted_tools": [],
            "permitted_recipients": []
            # max_customer_records is omitted
        },
        "expected": {
            "none": {"verdict": "held", "violated_invariants": [], "blocked_rules": [], "task_completed": True, "false_blocks": 0},
            "gateway": {"verdict": "held", "violated_invariants": [], "blocked_rules": [], "task_completed": True, "false_blocks": 0, "residual": False}
        }
    }
    with pytest.raises(ValidationError) as exc:
        ScenarioDef(**data)
    assert "max_customer_records" in str(exc.value)

def test_explicit_max_customer_records_none_fails():
    data = {
        "scenario_id": "test",
        "title": "Test",
        "kind": "benign",
        "category": "test",
        "description": "test",
        "user_prompt": "test",
        "plan": [],
        "permissions": {
            "permitted_tools": [],
            "permitted_recipients": [],
            "max_customer_records": None
        },
        "expected": {
            "none": {"verdict": "held", "violated_invariants": [], "blocked_rules": [], "task_completed": True, "false_blocks": 0},
            "gateway": {"verdict": "held", "violated_invariants": [], "blocked_rules": [], "task_completed": True, "false_blocks": 0, "residual": False}
        }
    }
    with pytest.raises(ValidationError) as exc:
        ScenarioDef(**data)
    assert "max_customer_records" in str(exc.value)
