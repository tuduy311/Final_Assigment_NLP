from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from pydantic import BaseModel
import httpx
import os
import re
import json
import time
from dotenv import load_dotenv
from metrics_service import metrics_service

# Tải các biến môi trường từ file .env
load_dotenv()

router = APIRouter(
    prefix="/audio",
    tags=["Audio Processing"]
)

# Đổi tên biến môi trường thành BASE_URL để dễ quản lý các endpoint khác nhau
MODEL_SERVICE_BASE_URL = os.getenv("MODEL_SERVICE_BASE_URL", "http://localhost:5000")


# ─────────────────────────────────────────────────────────────────────────────
# TASK PARSER — chuyển chuỗi thô từ LLM thành list [{task, owner, deadline}]
# ─────────────────────────────────────────────────────────────────────────────

def parse_tasks_raw(tasks_raw: str) -> list:
    """
    Ưu tiên theo thứ tự:
    1. JSON array  → parse trực tiếp
    2. JSON object có key 'tasks' / 'action_items'
    3. Regex fallback cho định dạng text tự do từ Qwen
    """
    raw = tasks_raw.strip()

    # ── Thử JSON (kể cả bọc trong ```json ... ```) ───────────────────
    json_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    json_str = json_match.group(1) if json_match else raw

    try:
        parsed = json.loads(json_str)
        if isinstance(parsed, list):
            return _normalize_items(parsed)
        if isinstance(parsed, dict):
            for key in ("tasks", "action_items", "items", "result"):
                if isinstance(parsed.get(key), list):
                    return _normalize_items(parsed[key])
    except (json.JSONDecodeError, ValueError):
        pass

    # ── Regex fallback ───────────────────────────────────────────────
    items = []
    blocks = re.split(r"\n(?=\d+[\.\)]\s|\-\s|\*\s)", raw)

    for block in blocks:
        if not block.strip():
            continue

        block = re.sub(r"^\d+[\.\)]\s*", "", block.strip())
        block = re.sub(r"^[-*•]\s*", "", block)

        task     = _extract_field(block, r"(?:task|công việc|nhiệm vụ|việc cần làm)")
        owner    = _extract_field(block, r"(?:owner|người phụ trách|assignee|phụ trách|người thực hiện)")
        deadline = _extract_field(block, r"(?:deadline|hạn|due date|thời hạn|ngày hạn)")

        if not task:
            first_line = block.split("\n")[0].strip()
            if len(first_line) > 3:
                task = first_line

        if task:
            items.append({
                "task":     task,
                "owner":    owner or "",
                "deadline": deadline or "",
            })

    # Nếu không parse được gì → trả về 1 item chứa toàn bộ raw text
    if not items:
        return [{"task": raw, "owner": "", "deadline": ""}]

    return items


def _extract_field(text: str, pattern: str) -> str:
    """Tìm giá trị sau label khớp pattern."""
    m = re.search(pattern + r"[:\s]+(.+?)(?:\n|$)", text, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _normalize_items(items: list) -> list:
    """Chuẩn hoá các key khác nhau về {task, owner, deadline}."""
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        result.append({
            "task":     item.get("task") or item.get("title") or item.get("description") or "",
            "owner":    item.get("owner") or item.get("assignee") or item.get("responsible") or "",
            "deadline": item.get("deadline") or item.get("due_date") or item.get("due") or "",
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/process-audio")
async def process_audio(request: Request, file: UploadFile = File(...)):
    """
    Nhận file âm thanh từ Frontend:
    1. Gửi file sang Model Service để bóc băng (Transcribe).
    2. Gửi tiếp văn bản sang Model Service để tóm tắt (Summary).
    3. Trả về cả hai kết quả cho Frontend.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Validate định dạng file
    valid_extensions = ('.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm')
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid file type. Only audio files are allowed.")

    try:
        async with httpx.AsyncClient() as client:
            # ── BƯỚC 1: TRANSCRIBE ────────────────────────────────────
            files = {'file': (file.filename, file.file, file.content_type)}
            transcribe_url = f"{MODEL_SERVICE_BASE_URL}/transcribe"

            start_time = time.time()
            response_stt = await client.post(transcribe_url, files=files, timeout=600.0)
            end_time = time.time()

            if response_stt.status_code != 200:
                raise HTTPException(
                    status_code=response_stt.status_code,
                    detail=f"Transcribe Error: {response_stt.text}"
                )

            result_stt = response_stt.json()

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

            transcript_text = result_stt.get("text", "")

            if not transcript_text.strip():
                return {
                    "message": "Không nhận diện được giọng nói trong file audio.",
                    "transcript_result": result_stt,
                    "summary_result": None
                }

            # ── BƯỚC 2: SUMMARY ───────────────────────────────────────
            summary_url = f"{MODEL_SERVICE_BASE_URL}/generate/summary"
            response_summary = await client.post(
                summary_url, json={"text": transcript_text}, timeout=300.0
            )

            if response_summary.status_code != 200:
                raise HTTPException(
                    status_code=response_summary.status_code,
                    detail=f"Summary Error: {response_summary.text}"
                )

            result_summary = response_summary.json()

            return {
                "message": "Xử lý thành công!",
                "transcript_result": result_stt,
                "summary_result": result_summary
            }

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Lỗi không kết nối được tới Model Service: {exc}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TaskRequest(BaseModel):
    text: str


@router.post("/extract-tasks")
async def extract_tasks(request: Request, payload: TaskRequest):
    """
    Nhận văn bản (transcript) từ Frontend, gửi sang Model Service để rút trích
    các công việc cần làm, rồi parse tasks_raw thành list có cấu trúc.
    """
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Văn bản không được để trống")

    try:
        async with httpx.AsyncClient() as client:
            tasks_url = f"{MODEL_SERVICE_BASE_URL}/generate/tasks"
            response = await client.post(
                tasks_url, json={"text": payload.text}, timeout=300.0
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Tasks Error: {response.text}"
                )

            data = response.json()

            # Parse tasks_raw (chuỗi thô từ LLM) → list có cấu trúc
            tasks_raw = data.get("tasks_raw", "")
            action_items = parse_tasks_raw(tasks_raw) if tasks_raw else []

            return {
                "action_items": action_items,      # [{task, owner, deadline}] đã parse
                "tasks_raw":    tasks_raw,          # giữ lại raw để debug
                "latency_ms":   data.get("latency_ms"),
            }

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Lỗi không kết nối được tới Model Service: {exc}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
