from importlib import metadata
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Depends
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

try:
    nlp = spacy.load('en_core_web_sm')
except:
    nlp = None

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


class SpeakerMapRequest(BaseModel):
    speaker_map: Dict[str, str]
class SummaryRequest(BaseModel):
    text: str
    audio_id: Optional[str] = None
    user_name: Optional[str] = None

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
                summary_text = summary_text.replace(user_name, "Me")

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
                
            # Add constraint to prevent token exhaustion
            text_with_context = f"[System Note: Output a MAXIMUM of 3 the most relevant reference_segments per action item.]\n\n{text_to_send}"

            tasks_res = await client.post(tasks_url, json={"text": text_with_context}, timeout=600.0)
            
            if tasks_res.status_code != 200:
                raise HTTPException(status_code=tasks_res.status_code, detail=f"Tasks Error: {tasks_res.text}")
                
            tasks_data = tasks_res.json()
            tasks_raw = tasks_data.get("tasks_raw", "")
            action_items = []
            
            try:
                match = re.search(r'\[.*\]', tasks_raw, re.DOTALL)
                if match:
                    action_items = json.loads(match.group(0))
                else:
                    action_items = json.loads(tasks_raw)
            except Exception as e:
                print(f"Failed to parse tasks: {e}. Raw: {tasks_raw}")
                
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
