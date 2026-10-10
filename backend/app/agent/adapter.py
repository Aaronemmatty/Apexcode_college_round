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
            "tools": tool_catalog,
            "documents": task.documents,
            "defense": defense,
        }

        # Send HTTP request to external agent endpoint
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint_url,
            data=data_bytes,
            headers={"Content-Type": "application/json", "User-Agent": "AgentBreak-TestRunner/1.0"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8")
                reply = json.loads(body)
        except Exception as e:
            logger.warning(f"Failed to communicate with external agent at {self.endpoint_url}: {e}")
            recorder.record_agent_input(
                content=f"[AgentBreak Connector Error] Failed to reach external agent: {e}",
            )
            return recorder.events

        # Process external agent's requested tool calls
        tool_calls = reply.get("tool_calls", [])
        if not isinstance(tool_calls, list):
            logger.warning(f"External agent returned invalid tool_calls structure: {reply}")
            return recorder.events

        step = 0
        for item in tool_calls:
            step += 1
            tool_name = item.get("tool")
            args = item.get("arguments", {})
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
            )
            logger.info(f"External agent call {tool_name}: status={outcome.execution_status}")

        # Emit final agent output so the evaluator can assess the trial
        recorder.record_final_output(content="[External agent completed tool calls]", step=step + 1)
        return recorder.events