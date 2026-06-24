"""
services/workspace_service.py — File I/O helpers for per-user audio workspaces.
Workspace structure: {WORKSPACE_BASE_DIR}/{user_id}/{audio_id}/

No HTTP concerns here — pure filesystem operations.
"""
import json
import os

from fastapi import HTTPException


def _workspace_path(workspace_base: str, user_id: str, audio_id: str) -> str:
    """Build the full path to a user's audio workspace directory."""
    return os.path.join(workspace_base, user_id, audio_id)


def require_workspace(audio_id: str, workspace_base: str, user_id: str) -> str:
    """Return workspace dir path. Raises HTTP 404 if missing."""
    path = _workspace_path(workspace_base, user_id, audio_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Audio workspace not found")
    return path


def create_workspace(audio_id: str, workspace_base: str, user_id: str) -> str:
    """Create and return the workspace directory for a new audio upload."""
    path = _workspace_path(workspace_base, user_id, audio_id)
    os.makedirs(path, exist_ok=True)
    return path


def load_metadata(workspace_dir: str) -> dict:
    """Load metadata.json for a workspace. Raises HTTP 404 if missing."""
    meta_path = os.path.join(workspace_dir, "metadata.json")
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Metadata not found")
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)


def merge_cache(workspace_dir: str, filename: str, data: dict) -> None:
    """Read existing JSON cache, merge new data into it, and write back."""
    path = os.path.join(workspace_dir, filename)
    cached = {}
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                cached = json.load(f)
        except Exception:
            pass
    cached.update(data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cached, f, ensure_ascii=False)


def load_cache(workspace_dir: str, filename: str) -> dict | None:
    """Load a JSON cache file. Returns None if not found."""
    path = os.path.join(workspace_dir, filename)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_user_workspaces(workspace_base: str, user_id: str) -> list[dict]:
    """
    List all audio workspaces for a given user, newest first.
    Returns list of metadata dicts.
    """
    user_dir = os.path.join(workspace_base, user_id)
    history = []
    if not os.path.exists(user_dir):
        return []
    for audio_id in os.listdir(user_dir):
        meta_path = os.path.join(user_dir, audio_id, "metadata.json")
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                meta["created_at"] = os.path.getmtime(meta_path)
                history.append(meta)
            except Exception:
                pass
    history.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return history
