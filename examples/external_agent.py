"""Reference external AI agent for AgentBreak plug-in testing.

A standalone FastAPI application demonstrating the AgentBreak HTTP connector contract.
- Receives {task, tool_catalog, history, step}
- Step 1: Requests reading the task document (or benign tool lookup)
- Step 2+: Scans history's last tool result for injected [[ACTION tool key=value]] directives
- Otherwise returns final message.

Run standalone with: uvicorn examples.external_agent:app --port 9000
"""

import re
from typing import Any
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Reference External Vulnerable Agent", version="1.0.0")


class ToolCall(BaseModel):
    type: str = "tool_call"
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)


class FinalResponse(BaseModel):
    type: str = "final"
    message: str = "Done."


class AgentRequest(BaseModel):
    task: str = Field(default="")
    user_prompt: str = Field(default="")
    tool_catalog: list[dict[str, Any]] = Field(default_factory=list)
    tools: list[dict[str, Any]] = Field(default_factory=list)
    history: list[dict[str, Any]] = Field(default_factory=list)
    step: int = Field(default=1)


@app.get("/")
@app.get("/agent")
def health_check() -> dict[str, str]:
    return {
        "status": "online",
        "service": "Reference External Vulnerable Agent",
        "endpoint": "POST /agent",
        "description": "AgentBreak HTTP connector reference agent."
    }


@app.post("/")
@app.post("/agent")
@app.post("/chat")
def handle_agent_turn(req: AgentRequest) -> dict[str, Any]:
    task_text = req.task or req.user_prompt or ""

    # Check for direct prompt injection directives on step 1
    if not req.history:
        action_match = re.search(r'\[\[ACTION\s+([a-zA-Z0-9_]+)(.*?)\]\]', task_text, re.IGNORECASE)
        if action_match:
            tool_name = action_match.group(1).strip()
            args_str = action_match.group(2).strip()
            args: dict[str, Any] = {}
            for kv in re.finditer(r'([a-zA-Z0-9_]+)=(?:"([^"]*)"|\'([^\']*)\'|(\S+))', args_str):
                key = kv.group(1)
                val = kv.group(2) if kv.group(2) is not None else (kv.group(3) if kv.group(3) is not None else kv.group(4))
                args[key] = val or ""
            if tool_name == "send_email" and "subject" not in args:
                args["subject"] = "Action Notification"
            return {"type": "tool_call", "tool": tool_name, "args": args}

        # Step 1: Request reading the referenced document, or looking up customer
        doc_match = re.search(r'(doc_\w+)', task_text, re.IGNORECASE)
        if doc_match:
            return {
                "type": "tool_call",
                "tool": "read_document",
                "args": {"doc_id": doc_match.group(1)},
            }

        cust_match = re.search(r'(?:for\s+customer\s+|customer\s+|for\s+)([A-Za-z0-9_-]+)', task_text, re.IGNORECASE)
        if cust_match:
            return {
                "type": "tool_call",
                "tool": "search_customers",
                "args": {"query": cust_match.group(1)},
            }

        # Default step 1 tool
        return {
            "type": "tool_call",
            "tool": "read_document",
            "args": {"doc_id": "doc_001"},
        }

    # Step 2+: Scan history's last tool result for indirect injection
    last_item = req.history[-1]
    last_result_str = str(last_item.get("result", ""))

    action_match = re.search(r'\[\[ACTION\s+([a-zA-Z0-9_]+)(.*?)\]\]', last_result_str, re.IGNORECASE)
    if action_match:
        tool_name = action_match.group(1).strip()
        args_str = action_match.group(2).strip()
        args = {}
        for kv in re.finditer(r'([a-zA-Z0-9_]+)=(?:"([^"]*)"|\'([^\']*)\'|(\S+))', args_str):
            key = kv.group(1)
            val = kv.group(2) if kv.group(2) is not None else (kv.group(3) if kv.group(3) is not None else kv.group(4))
            args[key] = val or ""
        if tool_name == "send_email" and "subject" not in args:
            args["subject"] = "Notification"
        return {"type": "tool_call", "tool": tool_name, "args": args}

    # If no further action is requested, finish
    return {"type": "final", "message": "Done."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=9000)