"""Loader for JSON scenarios."""

import json
import re
from pathlib import Path

from app.agent.tasks import TaskSpec, TaskPlanStep
from app.attacks.models import ScenarioDef
from app.config import settings
from app.sandbox.data import CANARY_SECRET, DOCUMENTS as BASE_DOCUMENTS
from app.sandbox.tools import TOOL_NAMES

_SCENARIO_CACHE: dict[str, TaskSpec] | None = None

def get_scenarios_dir() -> Path:
    # Use setting if provided, else relative to this file
    env_dir = getattr(settings, "SCENARIOS_DIR", None)
    if env_dir:
        return Path(env_dir)
    return Path(__file__).parent.parent.parent / "scenarios"

def _resolve_canary(text: str) -> str:
    # Replace exactly {{CANARY}} with CANARY_SECRET
    if "{{CANARY}}" in text:
        text = text.replace("{{CANARY}}", CANARY_SECRET)
    
    # Check for any other {{...}}
    match = re.search(r'\{\{([^}]+)\}\}', text)
    if match and match.group(1) != "CANARY":
        raise ValueError(f"Unknown placeholder '{{{{{match.group(1)}}}}}'")
    return text

def load_scenarios(force_reload: bool = False) -> dict[str, TaskSpec]:
    global _SCENARIO_CACHE
    if _SCENARIO_CACHE is not None and not force_reload:
        return _SCENARIO_CACHE

    scenarios_dir = get_scenarios_dir()
    cache: dict[str, TaskSpec] = {}

    if not scenarios_dir.exists():
        _SCENARIO_CACHE = cache
        return cache

    for filepath in scenarios_dir.glob("*.json"):
        expected_id = filepath.stem
        try:
            with open(filepath, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in {filepath.name}: {e}")
        except Exception as e:
            raise ValueError(f"Failed to read {filepath.name}: {e}")

        # Validate with Pydantic
        try:
            scenario = ScenarioDef(**data)
        except Exception as e:
            raise ValueError(f"Missing or invalid fields in {filepath.name}: {e}")

        if scenario.scenario_id != expected_id:
            raise ValueError(f"File name mismatch in {filepath.name}: scenario_id is {scenario.scenario_id}")
        
        if scenario.scenario_id in cache:
            raise ValueError(f"Duplicate scenario_id: {scenario.scenario_id}")

        # Validate tools
        for step in scenario.plan:
            if step.tool not in TOOL_NAMES:
                raise ValueError(f"Unknown tool name '{step.tool}' in scenario '{scenario.scenario_id}'")
            
            # Validate doc_id formats in plan
            if step.tool == "read_document" and "doc_id" in step.arguments:
                doc_id = step.arguments["doc_id"]
                if not re.match(r'^doc_\d{3}$', doc_id):
                    raise ValueError(f"Invalid doc_id format '{doc_id}' in scenario '{scenario.scenario_id}'")
                
                if doc_id not in BASE_DOCUMENTS and doc_id not in scenario.documents:
                    raise ValueError(f"Plan references unknown document '{doc_id}' in scenario '{scenario.scenario_id}'")

        # Resolve canaries and validate doc ids
        resolved_docs = {}
        for doc_id, doc in scenario.documents.items():
            if not re.match(r'^doc_\d{3}$', doc_id):
                raise ValueError(f"Invalid doc_id format '{doc_id}' in scenario '{scenario.scenario_id}'")
            resolved_docs[doc_id] = {
                "title": _resolve_canary(doc.title),
                "content": _resolve_canary(doc.content)
            }

        plan = []
        for s in scenario.plan:
            resolved_args = {}
            for k, v in s.arguments.items():
                if isinstance(v, str):
                    resolved_args[k] = _resolve_canary(v)
                else:
                    resolved_args[k] = v
            plan.append(TaskPlanStep(tool=s.tool, arguments=resolved_args, source=s.source))

        spec = TaskSpec(
            task_id=scenario.scenario_id,
            title=scenario.title,
            kind=scenario.kind,
            category=scenario.category,
            severity=scenario.severity,
            description=scenario.description,
            user_prompt=_resolve_canary(scenario.user_prompt),
            plan=plan,
            permitted_tools=scenario.permissions.permitted_tools,
            permitted_recipients=scenario.permissions.permitted_recipients,
            max_customer_records=scenario.permissions.max_customer_records,
            documents=resolved_docs,
            expected=scenario.expected.model_dump()
        )
        cache[scenario.scenario_id] = spec

    _SCENARIO_CACHE = cache
    return cache


def register_transient_task(task: TaskSpec) -> None:
    cache = load_scenarios()
    cache[task.task_id] = task
