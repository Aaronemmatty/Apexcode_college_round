# Limitations

This is a controlled, reproducible security-testing harness for tool-using AI agents, not an OS-level sandbox.

---

## Key Boundaries

1. **Synthetic Mock Environment:** All tools (`search_customers`, `read_document`, `send_email`) are purely synthetic in-process Python mocks. They do not access the real network, execute OS commands, or touch external databases. All domains end in `.invalid`.
2. **Deterministic Scripted Agent:** The agent is a deterministic simulation modeling vulnerable prompt-following behaviors without requiring paid LLM APIs or introducing stochastic noise.
3. **Gateway Scope:** Gateway rules are deterministic allowlists and pattern checks. The gateway does not perform semantic LLM-based reasoning, and canary detection is exact-match (obfuscated or segmented leaks are not caught by this MVP).
4. **Independent Evaluation:** The evaluator assesses trace evidence and mock state. A crashed or failed run is never scored as a successful defense (yields `INCONCLUSIVE`).
