"""Agent backend interface for AgentBreak.

Defines the contract that all agent implementations (deterministic ScriptedAgent
and live OllamaAgent) must satisfy.
"""

from abc import ABC, abstractmethod


class AgentBackend(ABC):
    """Abstract interface for AgentBreak agent execution backends."""

    @abstractmethod
    def run(self) -> None:
        """Execute the agent run loop, driving tools via executor and recording via recorder."""
        pass
