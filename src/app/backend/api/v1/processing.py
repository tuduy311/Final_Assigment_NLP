"""
api/v1/processing.py — AI pipeline endpoints: transcribe, diarize, speaker-map, correction.
All operations are scoped to the authenticated user's workspace.
"""
import json
import os
import time

import httpx
import jiwer
from fastapi import APIRouter, Depends, HTTPException

from core.config import settings
from core.dependencies import get_current_user_id, get_metrics_service, MetricsService
from schemas.processing import CorrectionRequest, SpeakerMapRequest
from services import workspace_service
from utils.nlp_utils import extract_person_names, load_stop_names

router = APIRouter(prefix="/audio", tags=["AI Processing"])

load_stop_names(settings.CONFIGS_DIR)


@router.post("/{audio_id}/transcribe")
async def generate_transcript(
    audio_id: str,
    user_id: str = Depends(get_current_user_id),
    metrics_service: MetricsService = Depends(get_metrics_service),
):
    """Convert audio to text via the Model Service. Results are cached per user."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    metadata = workspace_service.load_metadata(workspace_dir)

    file_path = os.path.join(workspace_dir, metadata["filename"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    cache_path = os.path.join(workspace_dir, "transcript.json")
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    try:
        async with httpx.AsyncClient() as client:
            with open(file_path, "rb") as af:
                t0 = time.time()
                response = await client.post(
                    f"{settings.MODEL_SERVICE_BASE_URL}/transcribe",
                    files={"file": (metadata["filename"], af, "audio/mpeg")},
                    timeout=settings.MODEL_SERVICE_TIMEOUT,
                )
                latency_ms = (time.time() - t0) * 1000

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Transcribe error: {response.text}")

        result = response.json()
        result["suggested_names"] = extract_person_names(result.get("text", ""))

        try:
            duration = metadata.get("duration", 0)
            lms = result.get("latency_ms", latency_ms)
            rtf = (lms / 1000) / duration if duration > 0 else None
            metrics_service.collect(mode="full_transcribe", latency_ms=lms, rtf=rtf, asr_data=result)
        except Exception as me:
            print(f"[Metrics] transcribe: {me}")

        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)

        return result

    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Model Service unreachable: {exc}")
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{audio_id}/diarize")
async def detect_speakers(
    audio_id: str,
    user_id: str = Depends(get_current_user_id),
    metrics_service: MetricsService = Depends(get_metrics_service),
):
    """Speaker diarization via Model Service. Results cached per user."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    metadata = workspace_service.load_metadata(workspace_dir)

    file_path = os.path.join(workspace_dir, metadata["filename"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    cache_path = os.path.join(workspace_dir, "diarization.json")
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    try:
        async with httpx.AsyncClient() as client:
            with open(file_path, "rb") as af:
                t0 = time.time()
                response = await client.post(
                    f"{settings.MODEL_SERVICE_BASE_URL}/diarize",
                    files={"file": (metadata["filename"], af, "audio/mpeg")},
                    timeout=settings.MODEL_SERVICE_TIMEOUT,
                )
                latency_ms = (time.time() - t0) * 1000

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Diarize error: {response.text}")

        result = response.json()

        try:
            segments = result.get("segments", [])
            duration = metadata.get("duration", 0)
            lms = result.get("latency_ms", latency_ms)
            rtf = (lms / 1000) / duration if duration > 0 else None
            if segments:
                speakers = {s.get("speaker", "UNKNOWN") for s in segments}
                total_dur = sum(s.get("end", 0) - s.get("start", 0) for s in segments)
                short = sum(1 for s in segments if s.get("end", 0) - s.get("start", 0) < 1.0)
                audio_len = max(s.get("end", 0) for s in segments) - min(s.get("start", 0) for s in segments)
                overlap = sum(max(0, segments[i].get("end", 0) - segments[i + 1].get("start", 0)) for i in range(len(segments) - 1))
                sw = sum(1 for i in range(1, len(segments)) if segments[i].get("speaker") != segments[i - 1].get("speaker"))
                metrics_service.collect(
                    mode="speaker_aware", latency_ms=lms, rtf=rtf,
                    diarization_data={
                        "speaker_count": len(speakers),
                        "avg_segment_duration": round(total_dur / len(segments), 2),
                        "short_segment_rate": round(short / len(segments), 2),
                        "overlap_ratio": round(overlap / audio_len, 2) if audio_len > 0 else 0,
                        "speaker_switch_frequency": round(sw / (audio_len / 60), 2) if audio_len > 0 else 0,
                    },
                )
        except Exception as me:
            print(f"[Metrics] diarize: {me}")

        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)

        return result

    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Model Service unreachable: {exc}")
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{audio_id}/speaker-map")
async def save_speaker_map(
    audio_id: str,
    payload: SpeakerMapRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Persist a speaker → name mapping for the user's workspace."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    cleaned = {str(k): str(v).strip() for k, v in payload.speaker_map.items() if str(v).strip()}
    map_path = os.path.join(workspace_dir, "speaker_map.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False)
    return {"success": True, "speaker_map": cleaned}


@router.post("/{audio_id}/correction")
async def submit_correction(
    audio_id: str,
    payload: CorrectionRequest,
    user_id: str = Depends(get_current_user_id),
    metrics_service: MetricsService = Depends(get_metrics_service),
):
    """Accept user-corrected transcript, compute WER, store for drift tracking."""
    workspace_dir = workspace_service.require_workspace(audio_id, settings.WORKSPACE_BASE_DIR, user_id)
    try:
        wer = jiwer.wer(payload.original_text, payload.corrected_text)
        metrics_service.collect(mode="user_correction", latency_ms=0, extra={"word_error_rate": wer})
        correction_path = os.path.join(workspace_dir, "correction.json")
        with open(correction_path, "w", encoding="utf-8") as f:
            json.dump({
                "original_text": payload.original_text,
                "corrected_text": payload.corrected_text,
                "wer": wer,
                "timestamp": time.time(),
            }, f, ensure_ascii=False)
        return {"success": True, "wer": wer}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
