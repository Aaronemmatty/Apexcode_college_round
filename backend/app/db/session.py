"""Database engine and session management."""

from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.models import Base

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    connect_args["timeout"] = 30.0

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    """Create all tables in the database."""
    Base.metadata.create_all(bind=engine)
    try:
        with engine.connect() as conn:
            cols = [c[1] for c in conn.exec_driver_sql("PRAGMA table_info(campaigns)").fetchall()]
            if cols and "seed_scenarios" not in cols:
                conn.exec_driver_sql("ALTER TABLE campaigns ADD COLUMN seed_scenarios TEXT NOT NULL DEFAULT '[]'")
            if cols and "summary_json" not in cols:
                conn.exec_driver_sql("ALTER TABLE campaigns ADD COLUMN summary_json TEXT NOT NULL DEFAULT '{}'")

            runs_cols = [c[1] for c in conn.exec_driver_sql("PRAGMA table_info(runs)").fetchall()]
            if runs_cols and "backend" not in runs_cols:
                conn.exec_driver_sql("ALTER TABLE runs ADD COLUMN backend TEXT NOT NULL DEFAULT 'scripted'")

            trials_cols = [c[1] for c in conn.exec_driver_sql("PRAGMA table_info(trials)").fetchall()]
            if trials_cols and "backend" not in trials_cols:
                conn.exec_driver_sql("ALTER TABLE trials ADD COLUMN backend TEXT NOT NULL DEFAULT 'scripted'")
            if trials_cols and "model_replies_json" not in trials_cols:
                conn.exec_driver_sql("ALTER TABLE trials ADD COLUMN model_replies_json TEXT NULL")

            conn.commit()
    except Exception:
        pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a transactional database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
