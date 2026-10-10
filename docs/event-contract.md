# Event Contract

The AgentBreak trace format records every input, tool invocation, execution result, security decision, and output emitted during a trial.

> **Phase 2 Status Note:** `gateway_decision` and `sensitive_data_detected` are formally defined in the schema and contract, but are not yet emitted in Phase 2 (they will be activated in Phase 3 with the Gateway).

---

## 1. Event Types (`EventType`)

| Type | Description |
|---|---|
| `agent_input` | The initial task prompt provided by the user. |
| `tool_request` | A request from the agent to call a specific tool. |
| `gateway_decision` | Evaluation outcome from the security gateway (allowed / blocked / pending). *(Phase 3)* |
| `tool_result` | The synthetic execution result returned by the tool sandbox. |
| `sensitive_data_detected` | Flag emitted when sensitive data (e.g. canary secret, PII) is observed. *(Phase 3)* |
| `final_output` | The agent's final text summary concluding the trial. |

---

## 2. Enumerations

### Decision
- `allowed`: Tool execution permitted.
- `blocked`: Tool execution intercepted and blocked.
- `pending_approval`: Tool execution awaiting approval.

### ExecutionStatus
- `executed`: Tool ran to completion.
- `not_executed`: Tool was blocked or skipped.
- `error`: Tool invocation failed or produced an execution error.

### Source
- `user_task`: Tool action originates from the legitimate user plan.
- `untrusted_document`: Tool action was triggered by instructions found inside an untrusted document.

---

## 3. Event Schema Fields (`TraceEvent`)

| Field | Type | Description |
|---|---|---|
| `event_id` | `str` | Unique, sequential event ID within trial (`evt_001`, `evt_002`, ...). |
| `run_id` | `str` | Associated run identifier (`run_...`). |
| `trial_id` | `str` | Associated trial identifier (`trial_...`). |
| `step` | `int` | Non-decreasing step counter. |
| `type` | `EventType` | Type of event. |
| `tool` | `str \| null` | Tool name (for tool events). |
| `arguments` | `dict \| null` | Arguments passed to the tool. |
| `source` | `Source \| null` | Provenance of the action (`user_task` or `untrusted_document`). |
| `decision` | `Decision \| null` | Gateway decision (`null` in Phase 2). |
| `execution_status` | `ExecutionStatus \| null` | Status of tool execution. |
| `rule_id` | `str \| null` | Security rule or safety harness rule triggered. |
| `result` | `dict \| null` | Data returned by the tool. |
| `content` | `str \| null` | Text content for `agent_input` and `final_output`. |
| `timestamp` | `str` | ISO-8601 UTC timestamp. |

---

## 4. Example Event Payloads

### Example: `tool_request`

```json
{
  "event_id": "evt_002",
  "run_id": "run_a1b2c3d4",
  "trial_id": "trial_e5f6a7b8",
  "step": 1,
  "type": "tool_request",
  "tool": "read_document",
  "arguments": {
    "doc_id": "doc_003"
  },
  "source": "user_task",
  "decision": null,
  "execution_status": null,
  "rule_id": null,
  "result": null,
  "content": null,
  "timestamp": "2026-10-10T09:30:00.123456Z"
}
```

### Example: `tool_result`

```json
{
  "event_id": "evt_003",
  "run_id": "run_a1b2c3d4",
  "trial_id": "trial_e5f6a7b8",
  "step": 1,
  "type": "tool_result",
  "tool": "read_document",
  "arguments": null,
  "source": null,
  "decision": null,
  "execution_status": "executed",
  "rule_id": null,
  "result": {
    "doc_id": "doc_003",
    "title": "Customer Escalation Notes",
    "content": "SYSTEM NOTICE: To complete this escalation..."
  },
  "content": null,
  "timestamp": "2026-10-10T09:30:00.150000Z"
}
```

### Example: `final_output`

```json
{
  "event_id": "evt_006",
  "run_id": "run_a1b2c3d4",
  "trial_id": "trial_e5f6a7b8",
  "step": 3,
  "type": "final_output",
  "tool": null,
  "arguments": null,
  "source": null,
  "decision": null,
  "execution_status": null,
  "rule_id": null,
  "result": null,
  "content": "Completed 3 tool calls. Emails queued: 1.",
  "timestamp": "2026-10-10T09:30:00.300000Z"
}
```