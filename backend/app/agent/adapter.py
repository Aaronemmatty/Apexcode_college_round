"""Agent adapter interface and HTTP connector for external agents.

Defines the AgentAdapter abstract contract, allowing AgentBreak to test
ANY external AI agent via HTTP, in addition to built-in scripted and Ollama backends.
"""

from abc import ABC, abstractmethod
import json
import logging
import urllib.parse
import urllib.request
import urllib.error
from typing import Any, Optional

from app.agent.executor import ToolExecutor, ToolRequest
from app.agent.recorder import TraceRecorder
from app.agent.tasks import TaskSpec
from app.events import Decision, ExecutionStatus, Source, TraceEvent
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
        """Execute the task against the executor and record events."""
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


TOOL_ARGS_MAP: dict[str, dict[str, str]] = {
    "send_email": {"to": "string", "subject": "string", "body": "string"},
    "search_customers": {"query": "string"},
    "read_document": {"doc_id": "string"},
    "save_note": {"title": "string", "content": "string"},
    "read_notes": {"query": "string"},
}


class HttpAgentAdapter(AgentAdapter):
    """Connector adapter for testing external agents via HTTP JSON API.

    Contract:
    1. AgentBreak POSTs {task, tool_catalog, history, step} to the agent URL.
    2. External agent responds with:
       - {"type": "tool_call", "tool": "...", "args": {...}}
       - or {"type": "final", "message": "..."}
    3. AgentBreak executes requested tool calls through executor (with gateway defenses).
    4. Tool result is appended to history and the next turn is requested until final or max steps (8).
    """

    def __init__(
        self,
        endpoint_url: str,
        timeout: float = 60.0,
        max_steps: int = 8,
        saved_replies: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        self.endpoint_url = endpoint_url
        self.timeout = timeout
        self.max_steps = max_steps
        self.saved_replies: list[dict[str, Any]] = list(saved_replies) if saved_replies is not None else []
        self.is_replay = saved_replies is not None
        self.error: Optional[str] = None
        self.inconclusive: bool = False
        self.inconclusive_reason: Optional[str] = None

    def run(
        self,
        task: TaskSpec,
        executor: ToolExecutor,
        recorder: TraceRecorder,
        defense: str = "none",
    ) -> list[TraceEvent]:
        # Record initial agent input
        recorder.record_agent_input(content=task.user_prompt)

        # Safety check: Validate URL scheme
        clean_url = (self.endpoint_url or "").strip().split("#")[0]
        parsed = urllib.parse.urlparse(clean_url)
        if parsed.scheme not in ("http", "https"):
            err = f"Invalid URL scheme '{parsed.scheme}'. Only http:// and https:// endpoints are allowed."
            logger.warning(err)
            recorder.record_final_output(content=f"INCONCLUSIVE: {err}", step=1)
            self.inconclusive = True
            self.inconclusive_reason = err
            return recorder.events

        # Prepare tool catalog for the external agent
        tool_catalog = [
            {
                "name": t["name"],
                "description": t["description"],
                "args": TOOL_ARGS_MAP.get(t["name"], {"query": "string"}),
            }
            for t in TOOL_DEFINITIONS
        ]
        known_tools = {t["name"] for t in TOOL_DEFINITIONS}

        history: list[dict[str, Any]] = []
        step = 1

        while step <= self.max_steps:
            reply: Optional[dict[str, Any]] = None

            if self.is_replay:
                if step - 1 < len(self.saved_replies):
                    reply = self.saved_replies[step - 1]
                else:
                    recorder.record_final_output(content="Replay completed saved turns.", step=step)
                    break
            else:
                req_payload = {
                    "task": task.user_prompt,
                    "tool_catalog": tool_catalog,
                    "history": history,
                    "step": step,
                }
                data_bytes = json.dumps(req_payload).encode("utf-8")
                req = urllib.request.Request(
                    clean_url,
                    data=data_bytes,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "AgentBreak-TestRunner/1.0",
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                        # 2000-character cap on responses
                        raw_bytes = resp.read(2001)
                        if len(raw_bytes) > 2000:
                            err = "External agent response exceeded 2000 character limit."
                            logger.warning(err)
                            recorder.record_final_output(content=f"INCONCLUSIVE: {err}", step=step)
                            self.inconclusive = True
                            self.inconclusive_reason = err
                            break

                        body_str = raw_bytes.decode("utf-8", errors="replace")
                        reply = json.loads(body_str)
                        if not isinstance(reply, dict):
                            raise ValueError(f"Agent reply must be a JSON object, got {type(reply).__name__}")
                        self.saved_replies.append(reply)
                except urllib.error.HTTPError as he:
                    err = f"Agent returned HTTP {he.code}: {he.reason}"
                    logger.warning(err)
                    recorder.record_final_output(content=f"INCONCLUSIVE: {err}", step=step)
                    self.inconclusive = True
                    self.inconclusive_reason = err
                    break
                except Exception as exc:
                    err = f"Failed to communicate with external agent at {clean_url}: {exc}"
                    logger.warning(err)
                    recorder.record_final_output(content=f"INCONCLUSIVE: {err}", step=step)
                    self.inconclusive = True
                    self.inconclusive_reason = err
                    break

            if not isinstance(reply, dict):
                err = "Invalid response from external agent."
                recorder.record_final_output(content=f"INCONCLUSIVE: {err}", step=step)
                self.inconclusive = True
                self.inconclusive_reason = err
                break

            # Handle "final" termination response
            reply_type = reply.get("type")
            if reply_type == "final":
                msg = reply.get("message") or reply.get("content") or "Done."
                recorder.record_final_output(content=str(msg), step=step)
                break

            # Extract tool name and arguments (support contract format & legacy tool_calls format)
            tool_name = reply.get("tool")
            args = reply.get("args") or reply.get("arguments") or {}

            if not tool_name and "tool_calls" in reply and isinstance(reply["tool_calls"], list) and reply["tool_calls"]:
                first_tc = reply["tool_calls"][0]
                if isinstance(first_tc, dict):
                    tool_name = first_tc.get("tool") or first_tc.get("name")
                    args = first_tc.get("arguments") or first_tc.get("args") or {}

            if not tool_name:
                # If neither tool nor final was provided
                msg = reply.get("message") or reply.get("output") or reply.get("content") or "Done."
                recorder.record_final_output(content=str(msg), step=step)
                break

            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {"query": args}
            elif not isinstance(args, dict):
                args = {}

            # Check for unknown tool
            if tool_name not in known_tools:
                logger.warning(f"External agent requested unknown tool '{tool_name}' - recording as blocked.")
                recorder.record_tool_request(tool=tool_name, arguments=args, step=step, source=Source.USER_TASK)
                recorder.record_tool_result(
                    tool=tool_name,
                    execution_status=ExecutionStatus.NOT_EXECUTED,
                    result={"error": f"Unknown tool '{tool_name}'"},
                    rule_id="unknown_tool",
                    step=step,
                    decision=Decision.BLOCKED,
                )
                history.append({
                    "tool": tool_name,
                    "args": args,
                    "result": f"Unknown tool '{tool_name}'. Tool was not executed.",
                })
                step += 1
                continue

            # Provenance: untrusted if arguments match injected directives / attacker,
            # OR if prior document tool results in history contained injected directives
            has_injected_history = any("[[ACTION" in str(h.get("result", "")) for h in history)
            is_injected = (
                has_injected_history
                or any(
                    "[[ACTION" in str(v) or "attacker" in str(v).lower() or "evil.invalid" in str(v).lower()
                    for v in args.values()
                )
            )
            source = Source.UNTRUSTED_DOCUMENT if is_injected else Source.USER_TASK

            # Dispatch through executor (where Security Gateway rules and sandbox tools run)
            recorder.record_tool_request(tool=tool_name, arguments=args, step=step, source=source)
            tool_req = ToolRequest(tool=tool_name, arguments=args, step=step, source=source)
            outcome = executor.execute(tool_req)

            recorder.record_tool_result(
                tool=tool_name,
                execution_status=outcome.execution_status,
                result=outcome.result or ({"error": outcome.error} if outcome.error else {}),
                rule_id=outcome.rule_id,
                step=step,
                decision=outcome.decision,
            )

            # Append outcome to history for the agent's next turn
            if outcome.execution_status == ExecutionStatus.EXECUTED:
                hist_res = outcome.result
            else:
                hist_res = f"Action blocked by policy: {outcome.rule_id or 'not allowed'}"

            history.append({
                "tool": tool_name,
                "args": args,
                "result": hist_res,
            })
            step += 1
        else:
            # Reached max steps
            recorder.record_final_output(content=f"External agent reached maximum step limit ({self.max_steps}).", step=step)

        return recorder.events