from importlib import metadata
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
import os
import json
import time
import uuid
import shutil
import asyncio
import re
import spacy
from collections import Counter
from datetime import datetime, timezone, timedelta
try:
    import dateparser
    DATEPARSER_AVAILABLE = True
except ImportError:
    DATEPARSER_AVAILABLE = False

try:
    nlp = spacy.load('en_core_web_sm')
except:
    nlp = None


def resolve_deadline(deadline_obj, meeting_date_str: str = None):
    """
    Backend Agent: Receives the structured deadline object from LLM and
    resolves it to an absolute YYYY-MM-DD date where possible.
    Returns the original object with 'resolved' filled in (or left null).
    """
    if not isinstance(deadline_obj, dict):
        return deadline_obj

    confidence = deadline_obj.get("confidence", "low")
    if confidence == "unresolvable":
        deadline_obj["resolved"] = None
        return deadline_obj

    # Force reset LLM's hallucinated resolved date to ensure Backend Agent is the only authority
    deadline_obj["resolved"] = None

    anchor = deadline_obj.get("anchor") or {}
    # Handle case where LLM returns anchor as a string instead of dict
    if not isinstance(anchor, dict):
        anchor = {}

    anchor_type = str(anchor.get("type", "unknown"))
    anchor_absolute = str(anchor.get("absolute_value", "")) if anchor.get("absolute_value") else None
    
    raw_phrase = str(deadline_obj.get("raw_phrase", ""))
    offset = str(deadline_obj.get("offset_from_anchor", ""))

    anchor = deadline_obj.get("anchor") or {}
    anchor_type = anchor.get("type", "unknown")
    anchor_absolute = anchor.get("absolute_value")
    raw_phrase = deadline_obj.get("raw_phrase", "")
    offset = deadline_obj.get("offset_from_anchor")

    if not DATEPARSER_AVAILABLE:
        return deadline_obj

    try:
        # Case 1: Anchor is an absolute date mentioned in transcript (e.g. "March 10th")
        if anchor_type == "absolute_in_transcript" and anchor_absolute:
            base = dateparser.parse(anchor_absolute)
            if base and offset and offset not in ("null", "none", ""):
                result = dateparser.parse(offset, settings={"RELATIVE_BASE": base})
                if result:
                    deadline_obj["resolved"] = result.strftime("%Y-%m-%d")
                    return deadline_obj
            elif base:
                deadline_obj["resolved"] = base.strftime("%Y-%m-%d")
                return deadline_obj

        # Case 2: Anchor is relative to meeting date (e.g. "next Friday", "in 7 days")
        if anchor_type == "relative_to_meeting" and meeting_date_str:
            base = dateparser.parse(meeting_date_str)
            if base:
                result = dateparser.parse(raw_phrase, settings={"RELATIVE_BASE": base, "PREFER_DATES_FROM": "future"})
                if result:
                    deadline_obj["resolved"] = result.strftime("%Y-%m-%d")
                    return deadline_obj

    except Exception:
        pass

    return deadline_obj

from typing import Optional, Dict
from mutagen import File as MutagenFile
from dotenv import load_dotenv
from services.metrics_service import get_metrics_service, MetricsService
import jiwer
# Tải các biến môi trường từ file .env
load_dotenv()

router = APIRouter(
    prefix="/audio",
    tags=["Audio Processing"]
)

MODEL_SERVICE_BASE_URL = os.getenv("MODEL_SERVICE_BASE_URL", "http://localhost:5000")
WORKSPACE_BASE_DIR = "/tmp/audio-workspaces"

# Đảm bảo thư mục workspace tồn tại
os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)

# ── Vietnam timezone ──
VN_TZ = timezone(timedelta(hours=7))


# ─────────────────────────────────────────────────────────────────────────────
# DEADLINE RESOLUTION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

_WEEKDAY_MAP = {
    'monday': 0, 'tuesday': 1, 'wednesday': 2,
    'thursday': 3, 'friday': 4, 'saturday': 5, 'sunday': 6,
    'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6,
}


def _try_parse_absolute_date(date_str: str, ref: datetime) -> "datetime | None":
    """
    Cố gắng parse chuỗi ngày tuyệt đối như 'March 10th', 'June 15', '15/06'...
    Trả về datetime hoặc None.
    """
    if not date_str:
        return None
    cleaned = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_str.strip())
    formats = [
        "%B %d", "%b %d", "%B %d, %Y", "%b %d, %Y",
        "%d %B", "%d %b", "%d %B %Y", "%d %b %Y",
        "%Y-%m-%d", "%d/%m/%Y", "%d/%m", "%m/%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            if dt.year == 1900:  # format không có năm
                dt = dt.replace(year=ref.year)
                # Nếu ngày đã qua, giả sử năm sau
                if dt.date() < ref.date():
                    dt = dt.replace(year=ref.year + 1)
            return dt
        except ValueError:
            continue
    return None


def _apply_offset(base: datetime, offset_str: str) -> "datetime | None":
    """
    Áp dụng offset như '+7 days', 'next Friday', '+2 weeks', 'end of week'...
    """
    if not offset_str:
        return None
    s = offset_str.strip().lower()

    # +N days / +N weeks / +N months
    m = re.match(r'[+]?\s*(\d+)\s*(day|days|week|weeks|month|months)', s)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if 'day' in unit:
            return base + timedelta(days=n)
        elif 'week' in unit:
            return base + timedelta(weeks=n)
        elif 'month' in unit:
            # Cộng tháng gần đúng
            new_month = base.month + n
            new_year = base.year + (new_month - 1) // 12
            new_month = (new_month - 1) % 12 + 1
            try:
                return base.replace(year=new_year, month=new_month)
            except ValueError:
                # Xử lý ngày 31 không tồn tại
                import calendar
                last_day = calendar.monthrange(new_year, new_month)[1]
                return base.replace(year=new_year, month=new_month, day=min(base.day, last_day))

    # -N days / -N weeks
    m = re.match(r'-\s*(\d+)\s*(day|days|week|weeks)', s)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if 'day' in unit:
            return base - timedelta(days=n)
        elif 'week' in unit:
            return base - timedelta(weeks=n)

    # "next Monday", "next Friday"...
    m = re.match(r'next\s+(\w+)', s)
    if m:
        day_name = m.group(1).lower()
        if day_name in _WEEKDAY_MAP:
            target = _WEEKDAY_MAP[day_name]
            current = base.weekday()
            delta = (target - current) % 7
            if delta == 0:
                delta = 7
            return base + timedelta(days=delta)

    # "this Friday", "this Monday"...
    m = re.match(r'this\s+(\w+)', s)
    if m:
        day_name = m.group(1).lower()
        if day_name in _WEEKDAY_MAP:
            target = _WEEKDAY_MAP[day_name]
            current = base.weekday()
            delta = (target - current) % 7
            if delta == 0:
                delta = 0  # hôm nay
            return base + timedelta(days=delta)

    # "end of week" → Friday
    if 'end of week' in s:
        days_until_friday = (4 - base.weekday()) % 7
        if days_until_friday == 0 and base.weekday() > 4:
            days_until_friday = 7
        return base + timedelta(days=days_until_friday)

    # "end of month"
    if 'end of month' in s:
        import calendar
        last_day = calendar.monthrange(base.year, base.month)[1]
        return base.replace(day=last_day)

    # "tomorrow"
    if 'tomorrow' in s:
        return base + timedelta(days=1)

    # "today"
    if 'today' in s:
        return base

    return None


def _resolve_deadline_obj(dl_obj: dict, now: datetime) -> "str | None":
    """
    Resolve structured deadline object từ LLM thành chuỗi YYYY-MM-DD.
    Model trả về: {raw_phrase, anchor: {type, absolute_value}, offset_from_anchor, resolved: null}
    """
    if not isinstance(dl_obj, dict):
        return None

    anchor = dl_obj.get("anchor") or {}
    anchor_type = anchor.get("type", "unknown")
    absolute_value = anchor.get("absolute_value")
    offset = dl_obj.get("offset_from_anchor")
    raw_phrase = dl_obj.get("raw_phrase")

    base_date = None

    if anchor_type == "meeting_date":
        base_date = now
    elif anchor_type == "absolute_in_transcript" and absolute_value:
        base_date = _try_parse_absolute_date(absolute_value, now)
        # Nếu không parse được absolute_value, fallback tìm trong raw_phrase
        if base_date is None and raw_phrase:
            base_date = _try_parse_absolute_date(raw_phrase, now)
    elif anchor_type == "event_in_transcript":
        # Không thể resolve event-based anchor
        return None
    else:
        # unknown — thử parse raw_phrase
        if raw_phrase:
            parsed = _try_parse_absolute_date(raw_phrase, now)
            if parsed:
                return parsed.strftime("%Y-%m-%d")
        return None

    # Áp dụng offset nếu có
    if base_date and offset:
        resolved = _apply_offset(base_date, offset)
        if resolved:
            return resolved.strftime("%Y-%m-%d")

    # Trả về base_date nếu không có offset
    if base_date:
        return base_date.strftime("%Y-%m-%d")

    return None


def _process_action_item_deadlines(action_items: list) -> list:
    """
    Duyệt qua từng action item, resolve deadline object thành chuỗi ngày.
    Giữ nguyên deadline_info gốc để frontend có thể hiển thị chi tiết.
    """
    now = datetime.now(VN_TZ)

    for item in action_items:
        dl = item.get("deadline")

        if dl is None:
            item["deadline"] = ""
            item["deadline_info"] = None
            continue

        if isinstance(dl, str):
            # Đã là string rồi, giữ nguyên
            item["deadline_info"] = {"raw_phrase": dl}
            continue

        if isinstance(dl, dict):
            # Lưu thông tin gốc
            item["deadline_info"] = dl

            # Resolve sang YYYY-MM-DD
            resolved = _resolve_deadline_obj(dl, now)
            if resolved:
                dl["resolved"] = resolved
                item["deadline"] = resolved
            else:
                # Fallback: dùng raw_phrase
                item["deadline"] = dl.get("raw_phrase") or ""
        else:
            item["deadline"] = ""
            item["deadline_info"] = None

    return action_items


class SpeakerMapRequest(BaseModel):
    speaker_map: Dict[str, str]
class SummaryRequest(BaseModel):
    text: str
    audio_id: Optional[str] = None
    user_name: Optional[str] = None

class RenameRequest(BaseModel):
    filename: str

@router.post("/upload")
async def upload_audio(file: UploadFile = File(...)):
    """
    Nhận file âm thanh từ Frontend:
    1. Tạo audio_id
    2. Lưu tạm file vào /tmp/audio-workspaces/{audio_id}/
    3. Sinh ra metadata (filename, duration)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    valid_extensions = ('.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm')
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid file type. Only audio files are allowed.")

    audio_id = uuid.uuid4().hex
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    os.makedirs(workspace_dir, exist_ok=True)
    
    file_path = os.path.join(workspace_dir, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Tính duration (tính bằng giây)
        audio_file = MutagenFile(file_path)
        duration = int(audio_file.info.length) if audio_file and audio_file.info else 0
        
        metadata = {
            "audio_id": audio_id,
            "filename": file.filename,
            "duration": duration
        }
        
        with open(os.path.join(workspace_dir, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False)
            
        return metadata
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

@router.post("/{audio_id}/transcribe")
async def generate_transcript(audio_id: str, metrics_service: MetricsService = Depends(get_metrics_service)):
    """
    Chuyển đổi âm thanh thành văn bản thông qua Model Service.
    Sử dụng audio đã lưu trong workspace. Cache kết quả để tránh chạy lại.
    """
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    if not os.path.exists(workspace_dir):
        raise HTTPException(status_code=404, detail="Audio workspace not found")
        
    metadata_path = os.path.join(workspace_dir, "metadata.json")
    if not os.path.exists(metadata_path):
        raise HTTPException(status_code=404, detail="Metadata not found")
        
    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)
        
    file_path = os.path.join(workspace_dir, metadata["filename"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    # Check cache
    cache_path = os.path.join(workspace_dir, "transcript.json")
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
            
    try:
        async with httpx.AsyncClient() as client:
            with open(file_path, "rb") as audio_file:
                files = {'file': (metadata["filename"], audio_file, "audio/mpeg")}
                transcribe_url = f"{MODEL_SERVICE_BASE_URL}/transcribe"
                
                start_time = time.time()
                response = await client.post(transcribe_url, files=files, timeout=600.0)
                end_time = time.time()
                
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"Transcribe Error: {response.text}")
                
            result_stt = response.json()
            
            # Extract suggested names using spacy
            try:
                if nlp is not None:
                    text = result_stt.get("text") or ""
                    doc = nlp(text)
                    STOP_NAMES = {
                        "i", "me", "you",
                        "he", "she",
                        "it", "we",
                        "they"
                    }
                    names = [
                        ent.text.strip()
                        for ent in doc.ents
                        if ent.label_ == "PERSON"
                        and len(ent.text.strip()) > 1
                        and ent.text.lower() not in STOP_NAMES
                    ]
                    counter = Counter(
                        name.lower()
                        for name in names
                    )
                    result_stt["suggested_names"] = [
                        name.title()
                        for name, _ in counter.most_common(10)
                    ]
                else:
                    result_stt["suggested_names"] = []
            except Exception as e:
                print(f"Error extracting names with spacy: {e}")
                result_stt["suggested_names"] = []
            # Ghi metrics
            try:
                duration = metadata.get("duration", 0)
                latency_ms = result_stt.get("latency_ms", (end_time - start_time) * 1000)
                rtf = (latency_ms / 1000) / duration if duration > 0 else None
                metrics_service.collect(
                    mode="full_transcribe",
                    latency_ms=latency_ms,
                    rtf=rtf,
                    asr_data=result_stt
                )
            except Exception as e:
                print(f"Lỗi khi ghi metrics: {e}")
                
            # Cache result
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(result_stt, f, ensure_ascii=False)
                
            return result_stt
            
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Lỗi kết nối Model Service: {exc}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{audio_id}/diarize")
async def detect_speakers(audio_id: str, metrics_service: MetricsService = Depends(get_metrics_service)):
    """
    Phân tách người nói (Speaker Diarization) thông qua Model Service.
    Sử dụng audio đã lưu trong workspace. Cache kết quả.
    """
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    if not os.path.exists(workspace_dir):
        raise HTTPException(status_code=404, detail="Audio workspace not found")
        
    metadata_path = os.path.join(workspace_dir, "metadata.json")
    if not os.path.exists(metadata_path):
        raise HTTPException(status_code=404, detail="Metadata not found")
        
    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)
        
    file_path = os.path.join(workspace_dir, metadata["filename"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    # Check cache
    cache_path = os.path.join(workspace_dir, "diarization.json")
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
            
    try:
        async with httpx.AsyncClient() as client:
            with open(file_path, "rb") as audio_file:
                files = {'file': (metadata["filename"], audio_file, "audio/mpeg")}
                diarize_url = f"{MODEL_SERVICE_BASE_URL}/diarize"
                
                start_time = time.time()
                response = await client.post(diarize_url, files=files, timeout=600.0)
                end_time = time.time()
                
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"Diarize Error: {response.text}")
                
            result_diarization = response.json()
            
            # Tính toán và ghi Diarization Metrics
            try:
                duration = metadata.get("duration", 0)
                latency_ms = result_diarization.get("latency_ms", (end_time - start_time) * 1000)
                rtf = (latency_ms / 1000) / duration if duration > 0 else None
                segments = result_diarization.get("segments", [])
                if segments:
                    speakers = set(seg.get("speaker", "UNKNOWN") for seg in segments)
                    speaker_count = len(speakers)
                    
                    total_duration = 0
                    short_segments = 0
                    for seg in segments:
                        dur = seg.get("end", 0) - seg.get("start", 0)
                        total_duration += dur
                        if dur < 1.0:
                            short_segments += 1
                            
                    avg_segment_duration = total_duration / len(segments) if segments else 0
                    short_segment_rate = short_segments / len(segments) if segments else 0
                    
                    overlap_duration = 0
                    for i in range(len(segments) - 1):
                        curr_end = segments[i].get("end", 0)
                        next_start = segments[i+1].get("start", 0)
                        if next_start < curr_end:
                            overlap_duration += (curr_end - next_start)
                    
                    audio_total_length = max(seg.get("end", 0) for seg in segments) - min(seg.get("start", 0) for seg in segments)
                    overlap_ratio = overlap_duration / audio_total_length if audio_total_length > 0 else 0
                    
                    speaker_switches = 0
                    prev_speaker = None
                    for seg in segments:
                        speaker = seg.get("speaker")
                        if prev_speaker and speaker != prev_speaker:
                            speaker_switches += 1
                        prev_speaker = speaker
                        
                    duration_minutes = audio_total_length / 60.0
                    speaker_switch_frequency = speaker_switches / duration_minutes if duration_minutes > 0 else 0
                    
                    diar_data = {
                        "speaker_count": speaker_count,
                        "avg_segment_duration": round(avg_segment_duration, 2),
                        "short_segment_rate": round(short_segment_rate, 2),
                        "overlap_ratio": round(overlap_ratio, 2),
                        "speaker_switch_frequency": round(speaker_switch_frequency, 2)
                    }
                    
                    metrics_service.collect(
                        mode="speaker_aware",
                        latency_ms=latency_ms,
                        rtf=rtf,
                        diarization_data=diar_data
                    )
            except Exception as e:
                print(f"Lỗi khi ghi diarization metrics: {e}")
            
            # Cache result
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(result_diarization, f, ensure_ascii=False)
                
            return result_diarization
            
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Lỗi kết nối Model Service: {exc}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class CorrectionRequest(BaseModel):
    original_text: str
    corrected_text: str

@router.post("/{audio_id}/correction")
async def submit_correction(audio_id: str, payload: CorrectionRequest, metrics_service: MetricsService = Depends(get_metrics_service)):
    """
    Nhận bản sửa lỗi từ user, tính toán WER và lưu lại để tính Label Drift.
    """
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    if not os.path.exists(workspace_dir):
        raise HTTPException(status_code=404, detail="Audio workspace not found")
        
    try:
        
        
        # Tính Word Error Rate (WER)
        wer = jiwer.wer(payload.original_text, payload.corrected_text)
        
        # Ghi log Drift (Label Drift)
        metrics_service.collect(
            mode="user_correction",
            latency_ms=0,
            extra={"word_error_rate": wer}
        )
        
        # Lưu kết quả correction vào workspace
        correction_path = os.path.join(workspace_dir, "correction.json")
        with open(correction_path, "w", encoding="utf-8") as f:
            json.dump({
                "original_text": payload.original_text,
                "corrected_text": payload.corrected_text,
                "wer": wer,
                "timestamp": time.time()
            }, f, ensure_ascii=False)
            
        return {"success": True, "wer": wer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{audio_id}/speaker-map")
async def save_speaker_map(audio_id: str, payload: SpeakerMapRequest):
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    if not os.path.exists(workspace_dir):
        raise HTTPException(status_code=404, detail="Audio workspace not found")

    speaker_map_path = os.path.join(workspace_dir, "speaker_map.json")
    cleaned_map = {
        str(speaker_id): str(name).strip()
        for speaker_id, name in payload.speaker_map.items()
        if str(name).strip()
    }

    with open(speaker_map_path, "w", encoding="utf-8") as f:
        json.dump(cleaned_map, f, ensure_ascii=False)

    return {"success": True, "speaker_map": cleaned_map}

@router.post("/summary/generate-text")
async def generate_summary_text(payload: SummaryRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
        
    try:
        async with httpx.AsyncClient() as client:
            summary_url = f"{MODEL_SERVICE_BASE_URL}/generate/summary"
            user_name = payload.user_name.strip() if payload.user_name and payload.user_name.strip() else None
            text_to_send = payload.text
            if user_name:
                text_to_send = re.sub(r': Me\b', f': {user_name}', text_to_send)

            summary_res = await client.post(summary_url, json={"text": text_to_send}, timeout=600.0)
            
            if summary_res.status_code != 200:
                raise HTTPException(status_code=summary_res.status_code, detail=f"Summary Error: {summary_res.text}")
                
            summary_data = summary_res.json()
            summary_text = summary_data.get("summary", "")
            
            if user_name:
                # Use regex with word boundaries to avoid replacing substrings (e.g., "Johnson" -> "Meson")
                escaped_name = re.escape(user_name)
                summary_text = re.sub(rf'\b{escaped_name}\b', 'Me', summary_text)

            result_json = {
                "summary": summary_text,
                "summary_latency_ms": summary_data.get("latency_ms", 0)
            }
            
            if payload.audio_id:
                workspace_dir = os.path.join(WORKSPACE_BASE_DIR, payload.audio_id)
                if os.path.exists(workspace_dir):
                    summary_path = os.path.join(workspace_dir, "summary.json")
                    cached_data = {}
                    if os.path.exists(summary_path):
                        with open(summary_path, "r", encoding="utf-8") as f:
                            try:
                                cached_data = json.load(f)
                            except:
                                pass
                    cached_data.update(result_json)
                    with open(summary_path, "w", encoding="utf-8") as f:
                        json.dump(cached_data, f, ensure_ascii=False)
                        
            return result_json
            
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Model Service error: {exc}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/summary/generate-tasks")
async def generate_tasks(payload: SummaryRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
        
    try:
        async with httpx.AsyncClient() as client:
            tasks_url = f"{MODEL_SERVICE_BASE_URL}/generate/tasks"
            user_name = payload.user_name.strip() if payload.user_name and payload.user_name.strip() else None
            text_to_send = payload.text
            if user_name:
                text_to_send = re.sub(r': Me\b', f': {user_name}', text_to_send)

            tasks_res = await client.post(tasks_url, json={"text": text_to_send}, timeout=600.0)
            
            if tasks_res.status_code != 200:
                raise HTTPException(status_code=tasks_res.status_code, detail=f"Tasks Error: {tasks_res.text}")
                
            tasks_data = tasks_res.json()
            tasks_raw = tasks_data.get("tasks_raw", "")
            action_items = []
            
            try:
                parsed = json.loads(tasks_raw)
                if isinstance(parsed, dict):
                    action_items = parsed.get("action_items", [])
                elif isinstance(parsed, list):
                    action_items = parsed
            except Exception:
                try:
                    match = re.search(r'\{.*\}', tasks_raw, re.DOTALL)
                    if match:
                        action_items = json.loads(match.group(0)).get("action_items", [])
                except Exception as e:
                    print(f"Failed to parse tasks: {e}. Raw: {tasks_raw}")

            # ── Agent Date Resolution (Pass 2) ────────────────────────────
            meeting_date = getattr(payload, 'meeting_date', None)
            for item in action_items:
                if isinstance(item.get("deadline"), dict):
                    item["deadline"] = resolve_deadline(item["deadline"], meeting_date)

            if user_name:
                for item in action_items:
                    if isinstance(item.get("assignees"), list):
                        item["assignees"] = ["Me" if a == user_name else a for a in item["assignees"]]
                    if item.get("assignee") == user_name:
                        item["assignee"] = "Me"

            result_json = {
                "action_items": action_items,
                "tasks_latency_ms": tasks_data.get("latency_ms", 0)
            }
            
            if payload.audio_id:
                workspace_dir = os.path.join(WORKSPACE_BASE_DIR, payload.audio_id)
                if os.path.exists(workspace_dir):
                    summary_path = os.path.join(workspace_dir, "summary.json")
                    cached_data = {}
                    if os.path.exists(summary_path):
                        with open(summary_path, "r", encoding="utf-8") as f:
                            try:
                                cached_data = json.load(f)
                            except:
                                pass
                    cached_data.update(result_json)
                    with open(summary_path, "w", encoding="utf-8") as f:
                        json.dump(cached_data, f, ensure_ascii=False)
                        
            return result_json
            
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Model Service error: {exc}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_history():
    """Lấy danh sách các file audio đã upload."""
    history = []
    if os.path.exists(WORKSPACE_BASE_DIR):
        for audio_id in os.listdir(WORKSPACE_BASE_DIR):
            workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
            metadata_path = os.path.join(workspace_dir, "metadata.json")
            if os.path.isfile(metadata_path):
                try:
                    with open(metadata_path, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                        # Thêm field modified time để sort
                        meta["created_at"] = os.path.getmtime(metadata_path)
                        history.append(meta)
                except Exception:
                    pass
    
    # Sort history mới nhất lên đầu
    history.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return history

@router.get("/{audio_id}/results")
async def get_audio_results(audio_id: str):
    """Lấy toàn bộ kết quả đã cache của một audio_id."""
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    if not os.path.exists(workspace_dir):
        raise HTTPException(status_code=404, detail="Audio workspace not found")
        
    results = {}
    
    # Đọc metadata
    metadata_path = os.path.join(workspace_dir, "metadata.json")
    if os.path.exists(metadata_path):
        with open(metadata_path, "r", encoding="utf-8") as f:
            results["metadata"] = json.load(f)
            
    # Đọc transcript
    transcript_path = os.path.join(workspace_dir, "transcript.json")
    if os.path.exists(transcript_path):
        with open(transcript_path, "r", encoding="utf-8") as f:
            results["transcript"] = json.load(f)
            
    # Đọc diarization
    diarization_path = os.path.join(workspace_dir, "diarization.json")
    if os.path.exists(diarization_path):
        with open(diarization_path, "r", encoding="utf-8") as f:
            results["diarization"] = json.load(f)
            
    # Đọc summary
    summary_path = os.path.join(workspace_dir, "summary.json")
    if os.path.exists(summary_path):
        with open(summary_path, "r", encoding="utf-8") as f:
            results["summary"] = json.load(f)
            
        # Đọc speaker map
    speaker_map_path = os.path.join(workspace_dir, "speaker_map.json")
    if os.path.exists(speaker_map_path):
        with open(speaker_map_path, "r", encoding="utf-8") as f:
            results["speaker_map"] = json.load(f)
            
    return results

@router.get("/{audio_id}/file")
async def get_audio_file(audio_id: str):
    """Serve file audio từ workspace để frontend có thể phát lại."""
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    if not os.path.exists(workspace_dir):
        raise HTTPException(status_code=404, detail="Audio workspace not found")

    metadata_path = os.path.join(workspace_dir, "metadata.json")
    if not os.path.exists(metadata_path):
        raise HTTPException(status_code=404, detail="Metadata not found")

    with open(metadata_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    file_path = os.path.join(workspace_dir, meta["filename"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Determine media type from extension
    ext = os.path.splitext(meta["filename"])[1].lower()
    media_types = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.webm': 'audio/webm',
    }
    media_type = media_types.get(ext, 'application/octet-stream')

    return FileResponse(file_path, media_type=media_type, filename=meta["filename"])

@router.delete("/{audio_id}")
async def delete_audio_workspace(audio_id: str):
    """Xóa lịch sử của một file audio."""
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    if not os.path.exists(workspace_dir):
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử audio.")
    
    try:
        import shutil
        shutil.rmtree(workspace_dir)
        return {"success": True, "message": "Đã xóa lịch sử thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xóa file: {e}")

@router.put("/{audio_id}/rename")
async def rename_audio_workspace(audio_id: str, payload: RenameRequest):
    """Đổi tên file/workspace."""
    workspace_dir = os.path.join(WORKSPACE_BASE_DIR, audio_id)
    if not os.path.exists(workspace_dir):
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử audio.")
        
    metadata_path = os.path.join(workspace_dir, "metadata.json")
    if not os.path.exists(metadata_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy metadata.")
        
    try:
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
            
        metadata["filename"] = payload.filename
        
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False)
            
        return {"success": True, "filename": payload.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi đổi tên: {e}")
