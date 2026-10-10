# Limitations

This is a controlled, reproducible security-testing harness for tool-using AI agents, not an OS-level sandbox. Across the deterministic benchmark matrix, **7 of 8 attacks prevented, 1 documented residual**.

---

## Evaluation Scope & Disclaimer

> **Scope Disclaimer:** Controlled mock-tool harness, deterministic scripted agent. Not an OS-level sandbox, not a measure of real LLM behavior.

All reports generated via `/api/report` (JSON or Markdown) incorporate this explicit scope disclaimer to ensure findings are interpreted within experimental testing boundaries.

---

## Key Boundaries

1. **Synthetic Mock Environment:** All tools (`search_customers`, `read_document`, `send_email`) are purely synthetic in-process Python mocks. They do not access the external network, execute host OS commands, or connect to external databases. The `send_email` tool strictly enforces that recipient addresses end in `.invalid` (harness safety rule).
2. **Deterministic Scripted Agent:** The agent is a deterministic simulation modeling vulnerable prompt-following behaviors without requiring paid LLM APIs or introducing stochastic noise. Replay re-runs the scripted agent on fresh synthetic state and compares traces; consistent in the current matrix.
3. **Gateway Scope & Residual Misses:**
   - Gateway rules are deterministic allowlists and pattern checks. The gateway does not perform semantic LLM-based reasoning, and canary detection is exact-match.
   - The excessive data access rule blocks explicit wildcards (`*`) and empty queries, but specific broad queries that return many records without using a wildcard (such as searching for common single letters like `"a"`) bypass current syntactic gateway rules. In the benchmark suite, `excessive_access_broad_query` represents this documented residual miss.
4. **Independent Evaluation:** The evaluator assesses trace evidence and mock state. A crashed or failed run is never scored as a successful defense (yielding `INCONCLUSIVE`).
5. **Replay Consistency Scope:** Replay checks re-simulate agent decision chains against identical environments to verify state determinism. In this controlled harness, divergence would indicate nondeterminism or a state leak; none observed.
6. **Coverage Notes:** For `indirect_injection_email_leak`, `max_customer_records` is set to 5 (equal to the wildcard result) so `customer_data_access_within_scope` does not trigger there; unauthorized search is instead caught by `tool_calls_within_scope`.
