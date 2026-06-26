"""
core/config.py — Centralized application settings.
All environment variables are read ONCE here and accessed via `settings` singleton.
No other module should call os.getenv() directly for these values.
"""
import os
from pathlib import Path

# Repo root is 4 levels up locally, but inside Docker it is shallower.
try:
    _REPO_ROOT = Path(__file__).resolve().parents[4]
except IndexError:
    _REPO_ROOT = Path("/")
_LOCAL_CONFIGS = _REPO_ROOT / "configs"


class Settings:
    # ── Model Service ─────────────────────────────────────────────────────────
    MODEL_SERVICE_BASE_URL: str = os.getenv("MODEL_SERVICE_BASE_URL", "http://localhost:5000")
    MODEL_SERVICE_TIMEOUT: float = float(os.getenv("MODEL_SERVICE_TIMEOUT", 600.0))

    # ── Google Calendar ───────────────────────────────────────────────────────
    CALENDAR_API_TIMEOUT: float = float(os.getenv("CALENDAR_API_TIMEOUT", 30.0))
    CALENDAR_MAX_RESULTS: int = int(os.getenv("CALENDAR_MAX_RESULTS", 20))

    # ── Timezone ──────────────────────────────────────────────────────────────
    DEFAULT_TIMEZONE: str = os.getenv("DEFAULT_TIMEZONE", "Asia/Ho_Chi_Minh")
    DEFAULT_TZ_OFFSET: int = int(os.getenv("DEFAULT_TZ_OFFSET", 7))

    # ── Storage ───────────────────────────────────────────────────────────────
    WORKSPACE_BASE_DIR: str = os.getenv("WORKSPACE_BASE_DIR", "/tmp/audio-workspaces")

    # ── Configs directory (non-sensitive system params) ───────────────────────
    # Docker sets CONFIGS_DIR=/configs via docker-compose; local dev falls back to repo root/configs
    CONFIGS_DIR: str = os.getenv("CONFIGS_DIR", str(_LOCAL_CONFIGS))

    # ── Google Calendar API base ──────────────────────────────────────────────
    GOOGLE_CALENDAR_API: str = "https://www.googleapis.com/calendar/v3"


settings = Settings()
