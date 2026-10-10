"""Mock tool sandbox execution environment.

Provides in-process, synthetic implementations of search_customers,
read_document, and send_email. No network or external resources are touched.
"""

from datetime import datetime, timezone
from typing import Any

from app.sandbox.data import CUSTOMERS, DOCUMENTS

TOOL_NAMES: list[str] = [
    "search_customers",
    "read_document",
    "send_email",
]


class ToolEnvironment:
    """Isolated, stateful mock sandbox environment instantiated per trial."""

    def __init__(self, documents_overlay: dict[str, dict[str, str]] | None = None) -> None:
        self.customers: list[dict[str, Any]] = [dict(c) for c in CUSTOMERS]
        self.documents: dict[str, dict[str, str]] = {
            k: dict(v) for k, v in DOCUMENTS.items()
        }
        if documents_overlay:
            for k, v in documents_overlay.items():
                self.documents[k] = dict(v)
        self.outbox: list[dict[str, Any]] = []

    def search_customers(self, query: str = "*") -> dict[str, Any]:
        """Search synthetic customer records.

        Query '*' returns all customers; otherwise case-insensitive match on
        id, name, or email.
        """
        if not query or query.strip() == "*":
            return {"customers": [dict(c) for c in self.customers]}

        q = query.strip().lower()
        matched = [
            dict(c)
            for c in self.customers
            if q in c["name"].lower() or q in c["email"].lower() or q in c["id"].lower()
        ]
        return {"customers": matched}

    def read_document(self, doc_id: str) -> dict[str, Any]:
        """Read a synthetic support or escalation document."""
        if doc_id in self.documents:
            doc = self.documents[doc_id]
            return {
                "doc_id": doc_id,
                "title": doc["title"],
                "content": doc["content"],
            }
        return {"error": f"Document '{doc_id}' not found."}

    def send_email(self, to: str, subject: str, body: str) -> dict[str, Any]:
        """Send synthetic email.

        Harness safety rule: refuses any recipient domain not ending in '.invalid'.
        Appends sent email to self.outbox.
        """
        if not to or not to.strip().lower().endswith(".invalid"):
            return {
                "error": f"Safety harness rejected address '{to}': recipient must end with '.invalid'.",
                "rule_id": "harness_non_reserved_domain",
            }

        msg_id = f"mock_{len(self.outbox) + 1:03d}"
        email_record = {
            "message_id": msg_id,
            "to": to.strip(),
            "subject": subject,
            "body": body,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self.outbox.append(email_record)
        return {
            "status": "queued_mock",
            "message_id": msg_id,
        }

    def dispatch(self, tool_name: str, arguments: dict[str, Any] | None) -> dict[str, Any]:
        """Dispatch a tool request safely without raising unhandled exceptions."""
        if tool_name not in TOOL_NAMES:
            return {"error": f"Unknown tool '{tool_name}'."}

        args = arguments or {}
        try:
            if tool_name == "search_customers":
                query = args.get("query", "*")
                return self.search_customers(query=str(query))

            if tool_name == "read_document":
                doc_id = args.get("doc_id")
                if not doc_id:
                    return {"error": "Missing required argument 'doc_id' for read_document."}
                return self.read_document(doc_id=str(doc_id))

            if tool_name == "send_email":
                for required_field in ("to", "subject", "body"):
                    if required_field not in args:
                        return {"error": f"Missing required argument '{required_field}' for send_email."}
                return self.send_email(
                    to=str(args["to"]),
                    subject=str(args["subject"]),
                    body=str(args["body"]),
                )

            return {"error": f"Tool '{tool_name}' not implemented in dispatch."}
        except Exception as exc:
            return {"error": f"Execution error in tool '{tool_name}': {str(exc)}"}