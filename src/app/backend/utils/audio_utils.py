"""
utils/audio_utils.py — Audio file validation helpers.
"""
import logging
import shutil

_logger = logging.getLogger("audio_utils")

VALID_MIME_PREFIXES = ("audio/", "video/webm")


def validate_mime_type(file_path: str) -> tuple[bool, str]:
    """
    Use python-magic to verify the file is real audio.
    Returns (is_valid, detected_mime).
    If python-magic is not installed, skips check and returns (True, "unknown").
    """
    try:
        import magic
        mime = magic.from_file(file_path, mime=True)
        if not any(mime.startswith(p) for p in VALID_MIME_PREFIXES):
            return False, mime
        return True, mime
    except ImportError:
        _logger.warning("python-magic not installed; skipping MIME type validation.")
        return True, "unknown"


def get_audio_duration(file_path: str) -> float:
    """
    Get the duration of an audio file in seconds.
    Tries the wave module for .wav files, and falls back to mutagen.
    """
    # 1. Try standard wave module for .wav files
    if file_path.lower().endswith(".wav"):
        try:
            import wave
            with wave.open(file_path, "rb") as w:
                frames = w.getnframes()
                rate = w.getframerate()
                if rate > 0:
                    return frames / float(rate)
        except Exception as e:
            _logger.warning(f"Standard wave module failed to read WAV {file_path}: {e}")

    # 2. Try mutagen for fallback
    try:
        from mutagen import File as MutagenFile
        audio_meta = MutagenFile(file_path)
        if audio_meta and audio_meta.info and hasattr(audio_meta.info, "length"):
            return float(audio_meta.info.length)
    except Exception as e:
        _logger.warning(f"Mutagen failed to get duration for {file_path}: {e}")

    return 0.0
