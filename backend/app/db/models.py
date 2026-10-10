"""SQLAlchemy 2.0 declarative database models."""

from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class RunRow(Base):
    __tablename__ = "runs"

    run_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), nullable=False)
    defense: Mapped[str] = mapped_column(String(32), nullable=False, default="none")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    trials: Mapped[list["TrialRow"]] = relationship("TrialRow", back_populates="run", cascade="all, delete-orphan")


class TrialRow(Base):
    __tablename__ = "trials"

    trial_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(32), ForeignKey("runs.run_id"), nullable=False, index=True)
    task_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")  # completed | failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    run: Mapped["RunRow"] = relationship("RunRow", back_populates="trials")
    events: Mapped[list["EventRow"]] = relationship("EventRow", back_populates="trial", cascade="all, delete-orphan")


class EventRow(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trial_id: Mapped[str] = mapped_column(String(32), ForeignKey("trials.trial_id"), nullable=False, index=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)  # JSON serialized TraceEvent

    trial: Mapped["TrialRow"] = relationship("TrialRow", back_populates="events")