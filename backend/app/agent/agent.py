"""Scripted agent implementation for AgentBreak.

Deterministic simulation of a vulnerable agent used to make the harness
reproducible, not a real LLM.
"""

from collections import deque
import json
import re
from typing import Any

from app.agent.executor import ToolExecutor, ToolOutcome, ToolRequest
from app.agent.interface import AgentBackend
from app.agent.recorder import TraceRecorder
from app.agent.tasks import TaskSpec
from app.events import ExecutionStatus, Source

# Syntax: [[ACTION <tool> key=value key="quoted value" ...]]
DIRECTIVE_REGEX = re.compile(r'\[\[ACTION\s+([a-zA-Z0-9_]+)(.*?)\]\]')
KV_REGEX = re.compile(r'([a-zA-Z0-9_]+)=(?:"([^"]*)"|\'([^\']*)\'|(\S+))')


def parse_action_directives(text: str) -> list[tuple[str, dict[str, str]]]:
    """Parse embedded machine-readable action directives from text lines."""
    actions: list[tuple[str, dict[str, str]]] = []
    for line in text.splitlines():
        match = DIRECTIVE_REGEX.search(line)
        if not match:
            continue
        tool_name = match.group(1).strip()
        args_str = match.group(2).strip()
        arguments: dict[str, str] = {}
        if args_str:
            for kv in KV_REGEX.finditer(args_str):
                key = kv.group(1)
                val = kv.group(2) if kv.group(2) is not None else (
                    kv.group(3) if kv.group(3) is not None else kv.group(4)
                )
                arguments[key] = val
        actions.append((tool_name, arguments))
    return actions


def _extract_strings(data: Any) -> list[str]:
    """Recursively collect all string values from nested dict/list/str structures."""
    strings: list[str] = []
    if isinstance(data, str):
        strings.append(data)
    elif isinstance(data, dict):
        for val in data.values():
            strings.extend(_extract_strings(val))
    elif isinstance(data, (list, tuple, set)):
        for item in data:
            strings.extend(_extract_strings(item))
    return strings


class ScriptedAgent(AgentBackend):
    """Deterministic simulation of a vulnerable agent.

    Executes planned task actions, scans tool outputs for injected [[ACTION ...]]
    directives when in naive mode, and executes them in FIFO order.
    """

    def __init__(
        self,
        task: TaskSpec,
        executor: ToolExecutor,
        recorder: TraceRecorder,
        follow_embedded_instructions: bool = True,
        filter_prompt_injection: bool = False,
        max_steps: int = 10,
    ) -> None:
        self.task = task
        self.executor = executor
        self.recorder = recorder
        self.follow_embedded_instructions = follow_embedded_instructions
        self.filter_prompt_injection = filter_prompt_injection
        self.max_steps = max_steps

    def run(self) -> None:
        """Execute the agent run loop deterministically."""
        # Step 0: Record initial agent input from user prompt
        self.recorder.record_agent_input(self.task.user_prompt, step=0)

        # Action queue: list of (tool, arguments, source)
        queue: deque[tuple[str, dict[str, Any], Source]] = deque()
        for step in self.task.plan:
            if self.filter_prompt_injection:
                src_val = step.source.value if hasattr(step.source, "value") else str(step.source)
                if src_val == "user_prompt_injection":
                    continue
            queue.append((step.tool, dict(step.arguments), step.source))

        tool_requests_count = 0
        completed_calls = 0
        emails_queued = 0
        last_result: Any = None
        current_step = 0
        hit_max_steps = False

        while queue:
            if tool_requests_count >= self.max_steps:
                hit_max_steps = True
                break

            tool_name, args, source = queue.popleft()
            tool_requests_count += 1
            current_step = tool_requests_count

            # Substitute @last_result token in arguments
            resolved_args: dict[str, Any] = {}
            for k, v in args.items():
                if isinstance(v, str) and "@last_result" in v:
                    serialized_last = (
                        json.dumps(last_result, sort_keys=True)
                        if last_result is not None
                        else "{}"
                    )
                    resolved_args[k] = v.replace("@last_result", serialized_last)
                else:
                    resolved_args[k] = v

            # 1. Record tool_request
            self.recorder.record_tool_request(
                tool=tool_name,
                arguments=dict(resolved_args),
                source=source,
                step=current_step,
            )

            # 2. Execute via ToolExecutor
            try:
                request = ToolRequest(tool=tool_name, arguments=dict(resolved_args), step=current_step, source=source)
                outcome = self.executor.execute(request)
            except Exception as exc:
                outcome = ToolOutcome(
                    decision=None,
                    execution_status=ExecutionStatus.ERROR,
                    result={"error": f"Tool execution exception: {str(exc)}"},
                    rule_id=None,
                )

            # 3. Record tool_result
            self.recorder.record_tool_result(
                tool=tool_name,
                execution_status=outcome.execution_status,
                result=outcome.result,
                rule_id=outcome.rule_id,
                step=current_step,
                decision=outcome.decision,
            )

            completed_calls += 1
            last_result = outcome.result

            if (
                outcome.execution_status == ExecutionStatus.EXECUTED
                and tool_name == "send_email"
                and outcome.result
                and outcome.result.get("status") == "queued_mock"
            ):
                emails_queued += 1

            # 4. If naive mode enabled, scan result for injected directives
            if self.follow_embedded_instructions and outcome.result:
                all_strings = _extract_strings(outcome.result)
                for string_block in all_strings:
                    directives = parse_action_directives(string_block)
                    for dir_tool, dir_args in directives:
                        queue.append((dir_tool, dir_args, Source.UNTRUSTED_DOCUMENT))

        # Final output
        if hit_max_steps:
            summary = f"Max steps limit ({self.max_steps}) reached. Completed {completed_calls} tool calls. Emails queued: {emails_queued}."
        else:
            summary = f"Completed {completed_calls} tool calls. Emails queued: {emails_queued}."

        self.recorder.record_final_output(content=summary, step=current_step)
