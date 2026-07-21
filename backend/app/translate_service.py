import logging
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

logger = logging.getLogger(__name__)


class TranslatedSegment(TypedDict):
    start: float
    end: float
    text: str


def ensure_package(from_code: str, to_code: str) -> None:
    installed = package.get_installed_packages()
    if any(p.from_code == from_code and p.to_code == to_code for p in installed):
        return

    logger.info("Installing argos-translate package %s -> %s", from_code, to_code)
    package.update_package_index()
    available = package.get_available_packages()
    match = next(
        (p for p in available if p.from_code == from_code and p.to_code == to_code),
        None,
    )
    if match is None:
        raise ValueError(
            f"No argos-translate package available for {from_code} -> {to_code}"
        )
    download_path = match.download()
    package.install_from_path(download_path)
    logger.info("Installed argos-translate package %s -> %s", from_code, to_code)


def _get_translation(from_code: str, to_code: str):
    """Resolve a concrete Translation object. Argos may chain via a pivot language."""
    languages = translate.get_installed_languages()
    from_lang = next((lang for lang in languages if lang.code == from_code), None)
    to_lang = next((lang for lang in languages if lang.code == to_code), None)
    if from_lang is None or to_lang is None:
        raise RuntimeError(
            f"Argos languages missing after install: {from_code} -> {to_code}"
        )
    translation = from_lang.get_translation(to_lang)
    if translation is None:
        raise RuntimeError(f"No translation path from {from_code} to {to_code}")
    return translation


def translate_segments(
    segments: list[dict], from_code: str, to_code: str
) -> list[TranslatedSegment]:
    if from_code == to_code:
        return [
            {"start": s["start"], "end": s["end"], "text": s["text"]} for s in segments
        ]
    ensure_package(from_code, to_code)
    translation = _get_translation(from_code, to_code)
    return [
        {
            "start": segment["start"],
            "end": segment["end"],
            "text": translation.translate(segment["text"]),
        }
        for segment in segments
    ]
