"""Autonomous attack discovery adapter forwarding to app.discovery."""

from app.discovery.campaign import run_discovery_campaign
from app.discovery.mutator import OPERATORS, mutate

__all__ = ["run_discovery_campaign", "mutate", "OPERATORS"]
