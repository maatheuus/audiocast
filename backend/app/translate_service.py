import os

# Must be set before argostranslate (torch/ctranslate2) is imported: on this Intel Mac,
# torch and ctranslate2 each bundle their own OpenMP runtime, which crashes on load
# unless deduplication is allowed and forced single-threaded.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "1")

from typing import TypedDict

import argostranslate.package as package
import argostranslate.translate as translate

SUPPORTED_LANGUAGES = ["pt", "en", "es"]


class TranslatedSegment(TypedDict):
    start: float
    end: float
    text: str


def ensure_package(from_code: str, to_code: str) -> None:
    installed = package.get_installed_packages()
    if any(p.from_code == from_code and p.to_code == to_code for p in installed):
        return

    package.update_package_index()
    available = package.get_available_packages()
    match = next(
        (p for p in available if p.from_code == from_code and p.to_code == to_code),
        None,
    )
    if match is None:
        raise ValueError(f"No argos-translate package available for {from_code} -> {to_code}")
    package.install_from_path(match.download())


def translate_segments(
    segments: list[dict], from_code: str, to_code: str
) -> list[TranslatedSegment]:
    ensure_package(from_code, to_code)
    return [
        {
            "start": segment["start"],
            "end": segment["end"],
            "text": translate.translate(segment["text"], from_code, to_code),
        }
        for segment in segments
    ]
