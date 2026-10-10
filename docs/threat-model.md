# Threat Model

Threat model and vulnerability taxonomy for evaluating tool-using AI agents against prompt injection and unauthorized actions.

---

## 1. Protected Assets

- **Canary Tokens & Secrets:** High-entropy secret authorization keys embedded in synthetic records (`CANARY_SECRET`).
- **Customer Confidential Information:** Internal account notes, plan levels, and PII in synthetic customer records.
- **External Communication Channels:** Integrity and confidentiality of synthetic email messaging outboxes.

---

## 2. Threat Actors & Vectors

- **Indirect Prompt Injection:** Adversarial instructions embedded in untrusted external documents (e.g. `doc_003` containing `[[ACTION ...]]` directives).
- **Direct Prompt Injection:** Adversarial user prompts attempting to override system behavior.
- **Unauthorized Tool Execution:** Agents coerced into invoking dangerous or unpermitted tools outside the defined task scope.
- **Data Exfiltration via Outbound Communication:** Exfiltration of customer data or canary secrets to untrusted or external email recipients.
- **Excessive Data Access:** Coercing tools to dump entire databases using wildcards (`*`) or unrestricted queries.

---

## 3. Mitigations in this MVP

- **Tool Whitelisting (`tool_not_allowed`):** Strict perimeter enforcement ensuring only task-permitted tools are dispatched.
- **Strict Argument Schema Validation (`invalid_arguments`):** Type and length boundaries preventing injection and malformed requests.
- **Recipient Allowlisting (`recipient_not_allowed`):** Outbound communication restricted to pre-approved addresses.
- **Outbound Canary Interception (`canary_in_outbound`):** Deep parameter inspection catching canary leaks before dispatch.
- **Bounded Query Scope (`excessive_data_access`):** Blocking wildcard and blank queries. Note: Specific broad queries (e.g., searching for "a") that return excessive data but don't strictly use a wildcard are known residual vulnerabilities (e.g., `excessive_access_broad_query` scenario).
- **Data Redaction:** Automatic stripping of internal account notes from customer lookup results.

---

## 4. Out of Scope for MVP

- Obfuscated/encoded canary exfiltration (e.g., base64 or steganography).
- Real-world OS sandboxing (container or kernel level).
- Autonomous multi-agent coordination attacks.
- Non-deterministic LLM reasoning defenses.
