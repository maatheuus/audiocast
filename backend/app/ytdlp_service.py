import logging
import os
from pathlib import Path
from typing import TypedDict

import yt_dlp

from .db import AUDIO_DIR

logger = logging.getLogger(__name__)


class Chapter(TypedDict):
    title: str
    start_time: float


class VideoInfo(TypedDict):
    id: str
    title: str
    channel: str
    thumbnail: str
    duration: int
    chapters: list[Chapter]


def _extract_chapters(info: dict) -> list[Chapter]:
    chapters = info.get("chapters") or []
    return [
        {"title": chapter.get("title") or "", "start_time": chapter.get("start_time") or 0}
        for chapter in chapters
    ]


def _cookies_option() -> dict:
    cookies_file = os.environ.get("COOKIES_FILE")
    if cookies_file and os.path.isfile(cookies_file):
        return {"cookiefile": cookies_file}
    logger.warning("cookies não configurados, requisições podem ser bloqueadas pelo YouTube")
    return {}


def fetch_info(url: str) -> VideoInfo:
    with yt_dlp.YoutubeDL({"quiet": True, "noplaylist": True, **_cookies_option()}) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        "id": info["id"],
        "title": info.get("title", ""),
        "channel": info.get("channel") or info.get("uploader", ""),
        "thumbnail": info.get("thumbnail", ""),
        "duration": info.get("duration") or 0,
        "chapters": _extract_chapters(info),
    }


def download_audio(url: str, video_id: str) -> Path:
    outtmpl = str(AUDIO_DIR / f"{video_id}.%(ext)s")
    options = {
        "quiet": True,
        "noplaylist": True,
        "format": "bestaudio/best/worst",
        "outtmpl": outtmpl,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        **_cookies_option(),
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        ydl.download([url])
    return AUDIO_DIR / f"{video_id}.mp3"
