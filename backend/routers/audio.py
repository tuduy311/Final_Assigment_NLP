from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from pydantic import BaseModel
import httpx
import os
import json
import time
import uuid
import shutil
import asyncio
import re
from typing import Optional
from mutagen import File as MutagenFile
from dotenv import load_dotenv
from metrics_service import metrics_service

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

class SummaryRequest(BaseModel):
    text: str
    audio_id: Optional[str] = None

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
async def generate_transcript(audio_id: str):
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
            
            # Ghi metrics
            try:
                latency_ms = result_stt.get("latency_ms", (end_time - start_time) * 1000)
                metrics_service.collect(
                    mode="full_transcribe",
                    latency_ms=latency_ms,
                    transcribe_result=result_stt
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
async def detect_speakers(audio_id: str):
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
                
                response = await client.post(diarize_url, files=files, timeout=600.0)
                
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"Diarize Error: {response.text}")
                
            result_diarization = response.json()
            
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

@router.post("/summary/generate")
async def generate_summary(payload: SummaryRequest):
    """
    Sinh bản tóm tắt và extract tasks từ văn bản (transcript toàn bộ hoặc transcript đã merge speaker).
    Chỉ yêu cầu text, không cần audio_id.
    """
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Văn bản không được để trống")
        
    try:
        async with httpx.AsyncClient() as client:
            summary_url = f"{MODEL_SERVICE_BASE_URL}/generate/summary"
            tasks_url = f"{MODEL_SERVICE_BASE_URL}/generate/tasks"
            
            # Gọi tuần tự để tránh sập GPU trên Kaggle do quá tải LLM
            summary_res = await client.post(summary_url, json={"text": payload.text}, timeout=300.0)
            tasks_res = await client.post(tasks_url, json={"text": payload.text}, timeout=300.0)
            
            if summary_res.status_code != 200:
                raise HTTPException(status_code=summary_res.status_code, detail=f"Summary Error: {summary_res.text}")
            if tasks_res.status_code != 200:
                raise HTTPException(status_code=tasks_res.status_code, detail=f"Tasks Error: {tasks_res.text}")
                
            summary_data = summary_res.json()
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
                
            result_json = {
                "summary": summary_data.get("summary", ""),
                "action_items": action_items,
                "summary_latency_ms": summary_data.get("latency_ms", 0),
                "tasks_latency_ms": tasks_data.get("latency_ms", 0)
            }
            
            if payload.audio_id:
                workspace_dir = os.path.join(WORKSPACE_BASE_DIR, payload.audio_id)
                if os.path.exists(workspace_dir):
                    summary_path = os.path.join(workspace_dir, "summary.json")
                    with open(summary_path, "w", encoding="utf-8") as f:
                        json.dump(result_json, f, ensure_ascii=False)
                        
            return result_json
            
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Lỗi kết nối Model Service: {exc}")
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
