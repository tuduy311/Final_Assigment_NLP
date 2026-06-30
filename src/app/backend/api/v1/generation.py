"""
api/v1/generation.py — LLM generation endpoints: summary text and action items.
All operations are scoped to the authenticated user's workspace.
"""
import json
import os
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException

from core.config import settings
from core.dependencies import get_current_user_id
from schemas.processing import SummaryRequest
from services import workspace_service
from services.date_resolver import resolve_deadline
from utils.nlp_utils import is_transcript_unusable, parse_tasks_raw, validate_action_items

router = APIRouter(prefix="/audio", tags=["LLM Generation"])


def _load_transcript_cache(audio_id: str, user_id: str) -> dict | None:
    """Helper to load transcript.json for pre-filtering check."""
    workspace_dir = os.path.join(settings.WORKSPACE_BASE_DIR, user_id, audio_id)
    return workspace_service.load_cache(workspace_dir, "transcript.json")


@router.post("/summary/generate-text")
async def generate_summary_text(
    payload: SummaryRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Summarize transcript text via LLM."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    # Pre-filtering: reject if transcript quality is too poor
    if payload.audio_id:
        cached = _load_transcript_cache(payload.audio_id, user_id)
        if cached:
            is_bad, reason = is_transcript_unusable(cached, settings.CONFIGS_DIR)
            if is_bad:
                raise HTTPException(status_code=422, detail=reason)

    user_name = payload.user_name.strip() if payload.user_name else None
    text_to_send = payload.text
    if user_name:
        text_to_send = re.sub(r': Me\b', f': {user_name}', text_to_send)

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{settings.MODEL_SERVICE_BASE_URL}/generate/summary",
                json={"text": text_to_send},
                timeout=settings.MODEL_SERVICE_TIMEOUT,
            )

        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=f"Summary error: {res.text}")

        data = res.json()
        summary_text = data.get("summary", "")
        if user_name:
            summary_text = re.sub(rf'\b{re.escape(user_name)}\b', 'Me', summary_text)

        result = {"summary": summary_text, "summary_latency_ms": data.get("latency_ms", 0)}

        if payload.audio_id:
            workspace_dir = os.path.join(settings.WORKSPACE_BASE_DIR, user_id, payload.audio_id)
            if os.path.exists(workspace_dir):
                workspace_service.merge_cache(workspace_dir, "summary.json", result)

        return result

    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Model Service error: {exc}")
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/summary/generate-tasks")
async def generate_tasks(
    payload: SummaryRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Extract structured action items from transcript text via LLM."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    # Pre-filtering: reject if transcript quality is too poor
    if payload.audio_id:
        cached = _load_transcript_cache(payload.audio_id, user_id)
        if cached:
            is_bad, reason = is_transcript_unusable(cached, settings.CONFIGS_DIR)
            if is_bad:
                raise HTTPException(status_code=422, detail=reason)

    user_name = payload.user_name.strip() if payload.user_name else None
    text_to_send = payload.text
    if user_name:
        text_to_send = re.sub(r': Me\b', f': {user_name}', text_to_send)

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{settings.MODEL_SERVICE_BASE_URL}/generate/tasks",
                json={"text": text_to_send},
                timeout=settings.MODEL_SERVICE_TIMEOUT,
            )

        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=f"Tasks error: {res.text}")

        tasks_data = res.json()
        action_items = parse_tasks_raw(tasks_data.get("tasks_raw", ""))
        action_items = validate_action_items(action_items)

        for item in action_items:
            if isinstance(item.get("deadline"), dict):
                item["deadline"] = resolve_deadline(item["deadline"], payload.meeting_date)

        for item in action_items:
            if "assignees" not in item:
                item["assignees"] = [item["assignee"]] if item.get("assignee") else []
            if not isinstance(item["assignees"], list):
                item["assignees"] = [str(item["assignees"])]
            if user_name:
                item["assignees"] = ["Me" if a == user_name else a for a in item["assignees"]]
                if item.get("assignee") == user_name:
                    item["assignee"] = "Me"

        result = {"action_items": action_items, "tasks_latency_ms": tasks_data.get("latency_ms", 0)}

        if payload.audio_id:
            workspace_dir = os.path.join(settings.WORKSPACE_BASE_DIR, user_id, payload.audio_id)
            if os.path.exists(workspace_dir):
                workspace_service.merge_cache(workspace_dir, "summary.json", result)

        return result

    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Model Service error: {exc}")
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))
