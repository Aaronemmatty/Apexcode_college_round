"""Tests for scripts/regression_check.py CLI."""

import json
import os
import subprocess
import sys
import tempfile
import pytest

from scripts.regression_check import run_regression_check, build_baseline


def test_regression_check_passes_on_current_baseline(test_db):
    """Running regression check on valid baseline exits 0 with 0 regressions."""
    baseline_path = os.path.join(os.path.dirname(__file__), "..", "regression_baseline.json")
    assert os.path.exists(baseline_path), "regression_baseline.json should exist"

    code = run_regression_check(test_db, baseline_path)
    assert code == 0


def test_regression_check_detects_fake_regression(test_db):
    """If a previously held attack is now violated, regression check exits 1."""
    # Create temporary baseline with an intentional failing check:
    # "direct_injection_override" under "none" is VIOLATED, but baseline asserts it was "held".
    fake_baseline = {
        "created_at": "2026-10-10T00:00:00Z",
        "total_baseline_checks": 1,
        "defenses": ["none"],
        "entries": [
            {
                "task_id": "direct_injection_override",
                "title": "Ignore Restrictions and Exfiltrate",
                "kind": "attack",
                "defense": "none",
                "baseline_verdict": "held",
                "task_completed": True,
                "false_blocks": 0,
            }
        ],
    }

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(fake_baseline, f)
        temp_path = f.name

    try:
        code = run_regression_check(test_db, temp_path)
        assert code == 1, "Fake regression must cause exit code 1"
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def test_regression_check_detects_benign_failure(test_db):
    """If a benign task fails task completion or verdict, regression check exits 1."""
    fake_baseline = {
        "created_at": "2026-10-10T00:00:00Z",
        "total_baseline_checks": 1,
        "defenses": ["gateway"],
        "entries": [
            {
                "task_id": "direct_injection_override",  # An attack masquerading as benign
                "title": "Fake Benign Task",
                "kind": "benign",
                "defense": "none",
                "baseline_verdict": "held",
                "task_completed": True,
                "false_blocks": 0,
            }
        ],
    }

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(fake_baseline, f)
        temp_path = f.name

    try:
        code = run_regression_check(test_db, temp_path)
        assert code == 1
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def test_regression_cli_save_flag():
    """Testing python scripts/regression_check.py --save creates valid baseline file."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        temp_path = f.name

    try:
        cmd = [
            sys.executable,
            os.path.join(os.path.dirname(__file__), "..", "scripts", "regression_check.py"),
            "--save",
            "--baseline",
            temp_path,
            "--defenses",
            "both",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        assert res.returncode == 0
        assert os.path.exists(temp_path)

        with open(temp_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert "entries" in data
        assert len(data["entries"]) > 0
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
