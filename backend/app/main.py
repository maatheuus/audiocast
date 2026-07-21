import os

# Must run before faster-whisper/argostranslate are imported: on this Intel Mac, torch
# and ctranslate2 each bundle their own OpenMP runtime, which crashes on load unless
# deduplication is allowed and forced single-threaded.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "1")

import json
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlmodel import select

from . import ytdlp_service
from .db import AUDIO_CLEANUP_DAYS, Highlight, QueueItem, Translation, get_session, init_db


def cleanup_old_audio() -> None:
    cutoff = time.time() - AUDIO_CLEANUP_DAYS * 86400
    with get_session() as session:
        items = session.exec(select(QueueItem).where(QueueItem.status == "archived")).all()
        for item in items:
            if item.audio_path and item.archived_at and item.archived_at < cutoff:
                audio_file = Path(item.audio_path)
                if audio_file.exists():
                    audio_file.unlink()
                item.audio_path = None
                session.add(item)
        session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    cleanup_old_audio()
    yield


app = FastAPI(title="Depois Eu Ouço", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|(\d{1,3}\.){3}\d{1,3}):5173$",
    allow_methods=["*"],
    allow_headers=["*"],
)

API_TOKEN = os.environ.get("API_TOKEN")


@app.middleware("http")
async def require_api_token(request: Request, call_next):
    """The Fly app is publicly reachable, so /api is gated by a shared token that the
    Cloudflare Worker injects. With API_TOKEN unset (local dev) the check is skipped."""
    if API_TOKEN and request.method != "OPTIONS" and request.url.path.startswith("/api/"):
        sent = request.headers.get("X-API-Token", "")
        if not secrets.compare_digest(sent, API_TOKEN):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


class UrlBody(BaseModel):
    url: str


class IdBody(BaseModel):
    id: str


class PatchBody(BaseModel):
    last_position_seconds: Optional[float] = None
    status: Optional[str] = None


class TranslateBody(BaseModel):
    queue_item_id: str
    target_lang: str


class HighlightBody(BaseModel):
    queue_item_id: str
    text: str
    start_time: float


def serialize(item: QueueItem) -> dict:
    data = item.model_dump()
    data["chapters"] = json.loads(item.chapters) if item.chapters else []
    data["transcript_segments"] = json.loads(item.transcript_segments) if item.transcript_segments else []
    return data


@app.post("/api/info")
def get_info(body: UrlBody):
    try:
        return ytdlp_service.fetch_info(body.url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/convert")
def convert(body: UrlBody):
    try:
        info = ytdlp_service.fetch_info(body.url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    video_id = info["id"]

    with get_session() as session:
        item = session.get(QueueItem, video_id)
        if item is None:
            item = QueueItem(id=video_id, url=body.url)
        item.title = info["title"]
        item.channel = info["channel"]
        item.thumbnail = info["thumbnail"]
        item.duration = info["duration"]
        item.chapters = json.dumps(info["chapters"]) if info["chapters"] else None
        item.status = "downloading"
        session.add(item)
        session.commit()

        try:
            audio_path = ytdlp_service.download_audio(body.url, video_id)
        except Exception as exc:
            item.status = "error"
            session.add(item)
            session.commit()
            raise HTTPException(status_code=500, detail=str(exc))

        item.audio_path = str(audio_path)
        item.status = "ready"
        session.add(item)
        session.commit()
        session.refresh(item)
        return serialize(item)


@app.get("/api/audio/{item_id}")
def get_audio(item_id: str):
    with get_session() as session:
        item = session.get(QueueItem, item_id)
    if item is None or not item.audio_path:
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(item.audio_path, media_type="audio/mpeg")


@app.post("/api/transcribe")
def transcribe(body: IdBody):
    # Imported lazily: faster-whisper pulls in torch/ctranslate2, which take ~50s to load.
    # At module level that delays the uvicorn bind past Fly's proxy timeout.
    from . import whisper_service

    with get_session() as session:
        item = session.get(QueueItem, body.id)
        if item is None or not item.audio_path:
            raise HTTPException(status_code=404, detail="Item not found")

        item.status = "transcribing"
        session.add(item)
        session.commit()

        try:
            text, segments, language = whisper_service.transcribe(item.audio_path)
        except Exception as exc:
            item.status = "error"
            session.add(item)
            session.commit()
            raise HTTPException(status_code=500, detail=str(exc))

        item.transcript = text
        item.transcript_segments = json.dumps(segments)
        item.transcript_language = language
        item.status = "done"
        session.add(item)
        session.commit()
        session.refresh(item)
        return serialize(item)


@app.get("/api/queue")
def list_queue():
    with get_session() as session:
        items = session.exec(select(QueueItem)).all()
        return [serialize(item) for item in items]


@app.patch("/api/queue/{item_id}")
def patch_queue_item(item_id: str, body: PatchBody):
    with get_session() as session:
        item = session.get(QueueItem, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Item not found")

        if body.last_position_seconds is not None:
            item.last_position_seconds = body.last_position_seconds
        if body.status is not None:
            item.status = body.status
            item.archived_at = time.time() if body.status == "archived" else None

        session.add(item)
        session.commit()
        session.refresh(item)
        return serialize(item)


@app.delete("/api/queue/{item_id}")
def delete_queue_item(item_id: str):
    with get_session() as session:
        item = session.get(QueueItem, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Item not found")
        if item.audio_path:
            audio_file = Path(item.audio_path)
            if audio_file.exists():
                audio_file.unlink()
        session.delete(item)
        session.commit()
    return {"ok": True}


@app.delete("/api/queue/{item_id}/audio")
def delete_audio(item_id: str):
    with get_session() as session:
        item = session.get(QueueItem, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Item not found")
        if item.audio_path:
            audio_file = Path(item.audio_path)
            if audio_file.exists():
                audio_file.unlink()
            item.audio_path = None
            session.add(item)
            session.commit()
            session.refresh(item)
        return serialize(item)


@app.post("/api/translate")
def translate_transcript(body: TranslateBody):
    # Lazy for the same reason as whisper_service in /api/transcribe.
    from . import translate_service

    with get_session() as session:
        item = session.get(QueueItem, body.queue_item_id)
        if item is None or not item.transcript_segments:
            raise HTTPException(status_code=404, detail="Transcript not found")

        if body.target_lang == item.transcript_language:
            return {"lang": body.target_lang, "segments": json.loads(item.transcript_segments)}

        existing = session.exec(
            select(Translation).where(
                Translation.queue_item_id == body.queue_item_id,
                Translation.lang == body.target_lang,
            )
        ).first()
        if existing:
            return {"lang": existing.lang, "segments": json.loads(existing.segments)}

        segments = json.loads(item.transcript_segments)
        try:
            translated = translate_service.translate_segments(
                segments, item.transcript_language or "pt", body.target_lang
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

        translation = Translation(
            queue_item_id=body.queue_item_id,
            lang=body.target_lang,
            segments=json.dumps(translated),
        )
        session.add(translation)
        session.commit()
        return {"lang": body.target_lang, "segments": translated}


@app.post("/api/highlights")
def create_highlight(body: HighlightBody):
    with get_session() as session:
        highlight = Highlight(
            queue_item_id=body.queue_item_id, text=body.text, start_time=body.start_time
        )
        session.add(highlight)
        session.commit()
        session.refresh(highlight)
        return highlight


@app.get("/api/highlights")
def list_highlights(queue_item_id: Optional[str] = None):
    with get_session() as session:
        query = select(Highlight)
        if queue_item_id:
            query = query.where(Highlight.queue_item_id == queue_item_id)
        return session.exec(query.order_by(Highlight.created_at.desc())).all()


@app.delete("/api/highlights/{highlight_id}")
def delete_highlight(highlight_id: int):
    with get_session() as session:
        highlight = session.get(Highlight, highlight_id)
        if highlight is None:
            raise HTTPException(status_code=404, detail="Highlight not found")
        session.delete(highlight)
        session.commit()
    return {"ok": True}
