"""Database engine and session management."""

from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.models import Base

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

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
