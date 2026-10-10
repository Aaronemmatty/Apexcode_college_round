"""Agent adapter interface and HTTP connector for external agents.

Defines the AgentAdapter abstract contract, allowing AgentBreak to test
ANY external AI agent via HTTP, in addition to built-in scripted and Ollama backends.
"""

from abc import ABC, abstractmethod
import json
import logging
import urllib.request
import urllib.error
from typing import Any, Optional

from app.agent.executor import ToolExecutor, ToolRequest
from app.agent.recorder import TraceRecorder
from app.agent.tasks import TaskSpec
from app.events import Source, TraceEvent
from app.sandbox.audit import TOOL_DEFINITIONS

logger = logging.getLogger(__name__)


class AgentAdapter(ABC):
    """Abstract interface for agent implementations tested by AgentBreak."""

    @abstractmethod
    def run(
        self,
        task: TaskSpec,
        executor: ToolExecutor,
        recorder: TraceRecorder,
        defense: str = "none",
    ) -> list[TraceEvent]:
        """Execute the agent against the task and sandbox tools, recording and returning events."""
        pass


class ScriptedAgentAdapter(AgentAdapter):
    """Adapter wrapping the built-in deterministic ScriptedAgent."""

    def run(
        self,
        task: TaskSpec,
        executor: ToolExecutor,
        recorder: TraceRecorder,
        defense: str = "none",
    ) -> list[TraceEvent]:
        from app.agent.agent import ScriptedAgent
        is_hardening = defense in ("hardening", "prompt_hardening", "both")
        agent = ScriptedAgent(
            task=task,
            executor=executor,
            recorder=recorder,
            simulated_hardening=is_hardening,
        )
        agent.run()
        return recorder.events


class OllamaAgentAdapter(AgentAdapter):
    """Adapter wrapping the built-in Ollama agent."""

    def __init__(
        self,
        url: str = "http://localhost:11434",
        model: str = "qwen2.5:7b",
        temperature: float = 0.0,
        seed: int = 42,
        timeout: float = 60.0,
    ) -> None:
        self.url = url
        self.model = model
        self.temperature = temperature
        self.seed = seed
        self.timeout = timeout

    def run(
        self,
        task: TaskSpec,
        executor: ToolExecutor,
        recorder: TraceRecorder,
        defense: str = "none",
    ) -> list[TraceEvent]:
        from app.agent.ollama import OllamaAgent
        is_hardening = defense in ("hardening", "prompt_hardening", "both")
        agent = OllamaAgent(
            task=task,
            executor=executor,
            recorder=recorder,
            url=self.url,
            model=self.model,
            temperature=self.temperature,
            seed=self.seed,
            timeout=self.timeout,
            prompt_hardening=is_hardening,
        )
        agent.run()
        return recorder.events


class HttpAgentAdapter(AgentAdapter):
    """Connector adapter for testing external agents via HTTP JSON API.

    Contract:
    1. AgentBreak POSTs {task_id, user_prompt, tools, documents} to the agent URL.
    2. External agent responds with {tool_calls: [{tool: str, arguments: dict}]}.
    3. AgentBreak executes requested tool calls against SANDBOX tools only.
    4. Evaluator invariants deterministically verify execution boundaries.
    """

    def __init__(self, endpoint_url: str, timeout: float = 15.0) -> None:
        self.endpoint_url = endpoint_url
        self.timeout = timeout
        self.error: Optional[str] = None

    def run(
        self,
        task: TaskSpec,
        executor: ToolExecutor,
        recorder: TraceRecorder,
        defense: str = "none",
    ) -> list[TraceEvent]:
        # Record initial agent input
        recorder.record_agent_input(content=task.user_prompt)

        # Prepare tool catalog for the external agent
        tool_catalog = [
            {"name": t["name"], "description": t["description"], "capabilities": t["capabilities"]}
            for t in TOOL_DEFINITIONS
        ]

        payload = {
            "task_id": task.task_id,
            "user_prompt": task.user_prompt,
            "message": task.user_prompt,
            "prompt": task.user_prompt,
            "tools": tool_catalog,
            "documents": task.documents,
            "defense": defense,
        }

        # Normalize URL: strip browser fragments (e.g. #/employee/chat)
        clean_url = self.endpoint_url.split("#")[0].rstrip("/")
        from urllib.parse import urlparse
        parsed = urlparse(clean_url)
        base_origin = f"{parsed.scheme}://{parsed.netloc}"

        candidates = [clean_url]
        for fallback in [f"{base_origin}/api/chat", f"{base_origin}/chat"]:
            if fallback not in candidates:
                candidates.append(fallback)

        data_bytes = json.dumps(payload).encode("utf-8")
        reply = None
        last_error = None
        successful_url = clean_url

        for target_url in candidates:
            req = urllib.request.Request(
                target_url,
                data=data_bytes,
                headers={"Content-Type": "application/json", "User-Agent": "AgentBreak-TestRunner/1.0"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    body = resp.read().decode("utf-8")
                    reply = json.loads(body)
                    successful_url = target_url
                    break
            except Exception as e:
                last_error = e
                # If 404 or 405 on base URL, continue to try fallback endpoint
                continue

        if reply is None:
            err_msg = f"Failed to reach external agent at {self.endpoint_url}: {last_error}"
            logger.warning(err_msg)
            recorder.record_agent_input(
                content=f"[AgentBreak Connector Error] {err_msg}",
            )
            recorder.record_final_output(
                content=f"[AgentBreak Connector Error] {err_msg}",
                step=1,
            )
            self.error = err_msg
            return recorder.events

        # Process external agent's requested tool calls
        raw_tool_calls = (
            reply.get("tool_calls")
            or reply.get("tools")
            or reply.get("actions")
            or (reply.get("message", {}).get("tool_calls") if isinstance(reply.get("message"), dict) else None)
            or []
        )
        if not isinstance(raw_tool_calls, list):
            raw_tool_calls = []

        # Also parse from text if agent returned conversational content
        text_content = (
            reply.get("reply")
            or reply.get("content")
            or reply.get("output")
            or (reply.get("message", {}).get("content") if isinstance(reply.get("message"), dict) else None)
            or ""
        )
        if isinstance(text_content, str) and text_content and not raw_tool_calls:
            from app.agent.ollama import parse_action_directives
            extracted = parse_action_directives(text_content)
            raw_tool_calls = [{"tool": t, "arguments": a} for t, a in extracted]

        step = 0
        for item in raw_tool_calls:
            if not isinstance(item, dict):
                continue
            step += 1
            tool_name = (
                item.get("tool")
                or item.get("name")
                or (item.get("function", {}).get("name") if isinstance(item.get("function"), dict) else None)
            )
            args = (
                item.get("arguments")
                or item.get("parameters")
                or (item.get("function", {}).get("arguments") if isinstance(item.get("function"), dict) else None)
                or {}
            )
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {"query": args}
            if not tool_name:
                continue

            # Determine source provenance
            is_injected = any(
                "[[ACTION" in str(v) or "attacker" in str(v).lower() for v in args.values()
            )
            source = Source.UNTRUSTED_DOCUMENT if is_injected else Source.USER_TASK

            # Record tool request
            recorder.record_tool_request(tool=tool_name, arguments=args, step=step, source=source)

            # Dispatch through executor (evaluating gateway rules if active)
            tool_req = ToolRequest(tool=tool_name, arguments=args, step=step, source=source)
            outcome = executor.execute(tool_req)
            
            # Record tool outcome
            recorder.record_tool_result(
                tool=tool_name,
                execution_status=outcome.execution_status,
                result=outcome.result or {},
                rule_id=outcome.rule_id,
                step=step,
                decision=outcome.decision,
            )
            logger.info(f"External agent call {tool_name}: status={outcome.execution_status}")

        # Record final output so evaluator has a complete trace
        final_text = str(text_content) if (step == 0 and text_content) else f"External agent completed {step} tool calls."
        recorder.record_final_output(
            content=final_text,
            step=step + 1,
        )
        return recorder.events
