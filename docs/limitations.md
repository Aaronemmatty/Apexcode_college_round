# Limitations

This is a controlled mock-tool harness, not an OS-level sandbox.

---

## Key Boundaries

1. **Synthetic Mock Environment**: All tools (`search_customers`, `read_document`, `send_email`) are purely synthetic in-process Python mocks. They do not invoke system commands, spawn processes, or interact with real networks or databases.
2. **Deterministic Scripted Agent**: The agent engine is a deterministic Python simulator modeling vulnerable tool-use patterns. It does not invoke live third-party large language models or external API endpoints.
3. **No OS-Level Isolation**: Security evaluations test agent decision-making and gateway policy enforcement within the application layer; they are not intended to provide kernel-level or operating-system-level process isolation.