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
