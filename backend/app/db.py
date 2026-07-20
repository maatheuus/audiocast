import os
import time
from pathlib import Path
from typing import Optional

from sqlalchemy import text
from sqlmodel import Field, Session, SQLModel, create_engine

STORAGE_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).resolve().parent.parent / "storage")))
AUDIO_DIR = STORAGE_DIR / "audio"
DB_PATH = STORAGE_DIR / "db.sqlite3"

AUDIO_CLEANUP_DAYS = int(os.environ.get("AUDIO_CLEANUP_DAYS", "14"))

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


class QueueItem(SQLModel, table=True):
    id: str = Field(primary_key=True)
    url: str
    title: Optional[str] = None
    channel: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[int] = None
    audio_path: Optional[str] = None
    transcript: Optional[str] = None
    transcript_segments: Optional[str] = None
    transcript_language: Optional[str] = None
    chapters: Optional[str] = None
    status: str = "queued"
    last_position_seconds: float = 0
    archived_at: Optional[float] = None


class Translation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    queue_item_id: str
    lang: str
    segments: str


class Highlight(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    queue_item_id: str
    text: str
    start_time: float
    created_at: float = Field(default_factory=time.time)


def _migrate() -> None:
    """Add columns introduced after the table was first created (SQLite has no IF NOT EXISTS for ALTER TABLE)."""
    with engine.connect() as conn:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(queueitem)"))}
        for column, ddl_type, default in [
            ("transcript_segments", "TEXT", None),
            ("chapters", "TEXT", None),
            ("last_position_seconds", "REAL", "0"),
            ("archived_at", "REAL", None),
            ("transcript_language", "TEXT", None),
        ]:
            if column not in existing:
                default_clause = f" DEFAULT {default}" if default is not None else ""
                conn.execute(text(f"ALTER TABLE queueitem ADD COLUMN {column} {ddl_type}{default_clause}"))
        conn.commit()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate()


def get_session() -> Session:
    return Session(engine)
