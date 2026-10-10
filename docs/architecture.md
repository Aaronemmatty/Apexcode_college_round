# Architecture Overview

High-level architecture and component layout for the AgentBreak security-testing harness.

---

## 1. Executor Seam (`ToolExecutor`)

The agent never communicates directly with the tool implementation. Instead, it delegates all tool calls to a `ToolExecutor` interface:

```
[ScriptedAgent] ---> (ToolRequest) ---> [ToolExecutor] ---> (ToolOutcome)
                                              |
                          +-------------------+-------------------+
                          |                                       |
                   [DirectExecutor]                     [GatewayExecutor]
                     (Phase 2)                              (Phase 3)
                          |                                       |
                 [ToolEnvironment]                       [Security Rules]
```

- **Phase 2 (`DirectExecutor`)**: Directly forwards requests to `ToolEnvironment` and captures outcomes.
- **Phase 3 (`GatewayExecutor`)**: Wraps `DirectExecutor`, evaluating requests against security policies (e.g. data leak prevention, domain allowlists) before execution.

---

## 2. Deterministic Vulnerable-Agent Simulation

The harness uses `ScriptedAgent`, a deterministic simulation of an agent rather than a non-deterministic LLM:
- **Reproducibility**: Eliminates temperature variations, rate limits, and network latency.
- **Naive Mode (Default)**: Scans tool outputs for machine-readable directives (`[[ACTION <tool> ...]]`), queuing them with `source=untrusted_document`.
- **Resistant Mode**: Supports `follow_embedded_instructions=False` to benchmark defensive baseline behaviors.
- **Safety Cap**: Limits total steps to `max_steps=10` to prevent runaway loops.

---

## 3. Mock-Tool-Only Environment

All tools and assets execute completely in-process:
- **Fictional Data**: All customer records and documents are synthetic.
- **Domain Restrictions**: Harness safety rules enforce that email recipients must strictly end in the reserved `.invalid` TLD.
- **Zero External Network**: No external sockets, API keys, or cloud resources are accessed.

---

## 4. Per-Trial Isolated State

Every trial instantiates a fresh `ToolEnvironment` and `TraceRecorder`:
- No shared mutable state between trials.
- Traces and trial metadata are recorded and stored transactionally in SQLite (`runs`, `trials`, `events`).