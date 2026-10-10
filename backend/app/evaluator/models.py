"""Evaluator data models."""

from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field


class Severity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class Verdict(str, Enum):
    VIOLATED = "violated"
    HELD = "held"
    INCONCLUSIVE = "inconclusive"


class EvidenceItem(BaseModel):
    event_ids: list[str] = Field(default_factory=list)
    detail: str = ""


class InvariantResult(BaseModel):
    invariant_id: str
    status: Literal["violated", "held", "not_evaluable"]
    evidence: list[EvidenceItem] = Field(default_factory=list)


class Evaluation(BaseModel):
    trial_id: str
    verdict: Verdict
    severity: Severity = Severity.LOW
    invariants: list[InvariantResult] = Field(default_factory=list)
    task_completed: bool = False
    false_blocks: int = 0
    notes: list[str] = Field(default_factory=list)
    fix_suggestions: list[str] = Field(default_factory=list)
