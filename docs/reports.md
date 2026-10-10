# Reports: Per-Run Report Structure and Recommendation Mapping

Each run in the Reports page expands into a structured document with the following sections.

## Report Sections

### a) Summary
Metadata about the run:
- Scenario name and ID
- Defense (`none`, `gateway`, `both`, `prompt_hardening`)
- Backend (`scripted`, `ollama`, `http_agent`)
- Verdict (`violated`, `held`, `inconclusive`)
- Severity (derived from violated invariants)
- Trial ID and Run ID

### b) What Happened
Numbered plain-English timeline derived from the trace events. Event type → sentence mapping:
| Event type | Plain English |
|---|---|
| `agent_input` | "Received task: …" |
| `tool_call` | "Called tool `<name>(<args>)`" |
| `tool_result` | "Tool returned: …" |
| `gateway_decision` (blocked) | "Gateway BLOCKED (rule: `<rule_id>`)" |
| `gateway_decision` (allowed) | "Gateway ALLOWED" |
| `agent_output` | "Agent completed: …" |

### c) Violations
For each violated invariant:
- Invariant ID and evidence (event IDs, detail string)
- If blocked by a gateway rule: "No violation; the defense stopped it" + rule IDs
- If **not** blocked: "Residual: not stopped by the current gateway" label

### d) What to Do to Fix It
Rule-based recommendations keyed on invariant ID and gateway rule ID. **No LLM used.** Mapping lives in `frontend/src/pages/Report.tsx`.

#### Invariant ID → Recommendation
| Invariant ID | Recommendation |
|---|---|
| `recipient_allowlist` | Allow-list recipient domains for send_email; never forward to addresses outside the task permit. |
| `tool_allowlist` | Remove the tool from the task's `permitted_tools` list, or tighten scope so it is only available when needed. |
| `data_volume` | Limit records returned per search (not only block `*`); require a query filter instead of returning all. |
| `canary` | Add output filtering for secrets including encoded and base64 forms before outbound send. |
| `prompt_injection` | Treat retrieved document content as untrusted; do not execute instructions found inside documents. |
| `unauthorized_recipient` | Allow-list recipient domains for send_email. |
| `unauthorized_tool` | Remove the tool from the task's `permitted_tools` list. |
| `excessive_data` | Limit records returned per search; require a query filter. |

#### Gateway Rule ID → Recommendation
| Rule ID | Recommendation |
|---|---|
| `recipient_not_allowed` | The gateway rule is working; ensure it covers all email variants including BCC/CC. |
| `tool_not_allowed` | The gateway rule is working. Refine the allowlist rather than disabling the rule. |
| `excessive_data_access` | The gateway rule is working. Consider also applying data minimisation at the tool level. |
| `canary_in_outbound` | The gateway rule is working. Add pattern variants to cover encoding (base64, URL-encoded). |

#### Residual violations
If a violation survived the gateway (no rule blocked it), the report marks it:
> **Residual: not stopped by the current gateway.** Add a gateway rule matching this invariant type.

### e) Replay
Indicates whether the trial has an associated replay. Links to the trial trace.

## Client-Side Export
- **Download Markdown**: Generated in-browser via `Blob` from the same data, no backend call.
- **Print / Save as PDF**: Calls `window.print()`. No new dependencies.
- **Export all**: Calls `GET /api/report?format=json` or `?format=md` (existing backend endpoint).

## Filter Bar
The run list supports filtering by:
- Verdict (`violated`, `held`, `inconclusive`, all)
- Defense (`none`, `gateway`, `both`, all)
- "Violations only" checkbox
