"""
api/v1/audio.py — Workspace CRUD endpoints (thin HTTP layer).
All workspace operations are scoped to the authenticated user's directory.
"""
import json
import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, StreamingResponse
from mutagen import File as MutagenFile

from core.config import settings
from core.dependencies import get_current_user_id
from schemas.audio import ActionItemsRequest, RenameRequest
from services import workspace_service
from utils.audio_utils import validate_mime_type, get_audio_duration
from utils.config_loader import load_json_config

router = APIRouter(prefix="/audio", tags=["Workspace"])

os.makedirs(settings.WORKSPACE_BASE_DIR, exist_ok=True)

# Load allowed extensions from system_rules.json
_sys_rules = load_json_config(
    os.path.join(settings.CONFIGS_DIR, "system_rules.json"),
    defaults={"upload": {"allowed_extensions": [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"]}},
)
VALID_EXTENSIONS = tuple(
    _sys_rules.get("upload", {}).get("allowed_extensions", [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"])
)
MEDIA_TYPES = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".ogg": "audio/ogg", ".flac": "audio/flac", ".webm": "audio/webm",
}


@router.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Receive an audio file, validate it, save it under the user's workspace, and return metadata."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    if not file.filename.lower().endswith(VALID_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Supported: {', '.join(VALID_EXTENSIONS)}",
        )

    audio_id = uuid.uuid4().hex
    workspace_dir = workspace_service.create_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    file_path = os.path.join(workspace_dir, file.filename)

    try:
        with open(file_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        is_valid, detected_mime = validate_mime_type(file_path)
        if not is_valid:
            shutil.rmtree(workspace_dir, ignore_errors=True)
            raise HTTPException(
                status_code=415,
                detail=f"File content is not valid audio (detected: {detected_mime}). Please upload a real audio file.",
            )

        duration = int(get_audio_duration(file_path))

        metadata = {"audio_id": audio_id, "filename": file.filename, "duration": duration}
        with open(os.path.join(workspace_dir, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False)

        return metadata

    except HTTPException:
        raise
    except Exception as exc:
        shutil.rmtree(workspace_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error saving file: {exc}")


@router.get("/history")
async def get_history(user_id: str = Depends(get_current_user_id)):
    """Return list of audio workspaces for the current user, newest first."""
    return workspace_service.list_user_workspaces(settings.WORKSPACE_BASE_DIR, user_id)


@router.get("/{audio_id}/results")
async def get_audio_results(
    audio_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return all cached results for a given audio_id belonging to the current user."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    results = {}
    for key, fname in [
        ("metadata", "metadata.json"),
        ("transcript", "transcript.json"),
        ("diarization", "diarization.json"),
        ("summary", "summary.json"),
        ("speaker_map", "speaker_map.json"),
    ]:
        path = os.path.join(workspace_dir, fname)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                results[key] = json.load(f)
    return results


def range_generator(file_path: str, start: int, end: int, chunk_size: int = 8192):
    """Yield chunks of a file for HTTP Range requests."""
    with open(file_path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.get("/{audio_id}/file")
async def get_audio_file(
    audio_id: str,
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    """Serve the raw audio file supporting HTTP Range requests for player seeking."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    meta = workspace_service.load_metadata(workspace_dir)
    file_path = os.path.join(workspace_dir, meta["filename"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    ext = os.path.splitext(meta["filename"])[1].lower()
    media_type = MEDIA_TYPES.get(ext, "application/octet-stream")
    file_size = os.path.getsize(file_path)
    
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(
            file_path,
            media_type=media_type,
            filename=meta["filename"],
            headers={"Accept-Ranges": "bytes"}
        )

    try:
        range_val = range_header.replace("bytes=", "").strip()
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
    except Exception:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")

    if start > end or start >= file_size or end >= file_size:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")

    content_length = end - start + 1
    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Disposition": f'attachment; filename="{meta["filename"]}"'
    }

    return StreamingResponse(
        range_generator(file_path, start, end),
        status_code=206,
        media_type=media_type,
        headers=headers
    )


@router.delete("/{audio_id}")
async def delete_audio_workspace(
    audio_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Permanently delete a workspace and all associated files for the current user."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    try:
        shutil.rmtree(workspace_dir)
        return {"success": True, "message": "Đã xóa thành công."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xóa: {exc}")


@router.put("/{audio_id}/rename")
async def rename_audio_workspace(
    audio_id: str,
    payload: RenameRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Update the display name in metadata.json without renaming the physical file on disk."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    meta = workspace_service.load_metadata(workspace_dir)
    new_name = payload.filename.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    meta["name"] = new_name
    with open(os.path.join(workspace_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    return {"success": True, "name": new_name, "filename": meta.get("filename")}


@router.put("/{audio_id}/action-items")
async def save_action_items(
    audio_id: str,
    payload: ActionItemsRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Overwrite the action_items array in summary.json for the current user."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    workspace_service.merge_cache(workspace_dir, "summary.json", {"action_items": payload.action_items})
    return {"success": True}
