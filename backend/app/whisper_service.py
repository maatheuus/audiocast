from functools import lru_cache
from typing import TypedDict

from faster_whisper import WhisperModel

WHISPER_MODEL_SIZE = "base"


class TranscriptSegment(TypedDict):
    start: float
    end: float
    text: str


@lru_cache(maxsize=1)
def get_model() -> WhisperModel:
    return WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")


def transcribe(audio_path: str) -> tuple[str, list[TranscriptSegment], str]:
    model = get_model()
    segments, info = model.transcribe(audio_path)
    segment_list: list[TranscriptSegment] = []
    for segment in segments:
        text = segment.text.strip()
        segment_list.append({"start": segment.start, "end": segment.end, "text": text})
    full_text = " ".join(segment["text"] for segment in segment_list).strip()
    return full_text, segment_list, info.language
