"""
api/v1/calendar.py — Google Calendar integration endpoints.
"""
import json
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request

from core.config import settings
from schemas.calendar import CandidatePair, CheckConflictsRequest, CreateEventsRequest, EventInput

router = APIRouter(prefix="/calendar", tags=["Google Calendar"])


def _get_access_token(request: Request) -> str:
    token = request.headers.get("X-Google-Access-Token")
    if not token:
        raise HTTPException(status_code=401, detail="Thiếu Google access token. Vui lòng đăng nhập lại.")
    return token


def _parse_deadline(deadline_str: str):
    if not deadline_str or not deadline_str.strip():
        return None
    deadline_str = deadline_str.strip()
    try:
        iso_str = deadline_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(iso_str)
        return {"dateTime": dt.isoformat(), "timeZone": settings.DEFAULT_TIMEZONE}
    except ValueError:
        pass
    formats = ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"]
    for fmt in formats:
        try:
            dt = datetime.strptime(deadline_str, fmt)
            if fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
                return {"date": dt.strftime("%Y-%m-%d")}
            else:
                return {"dateTime": dt.isoformat(), "timeZone": settings.DEFAULT_TIMEZONE}
        except ValueError:
            continue
    return None


def _build_event_body(event: EventInput) -> dict:
    start_time = _parse_deadline(event.deadline)
    if start_time is None:
        tomorrow = datetime.now(timezone(timedelta(hours=settings.DEFAULT_TZ_OFFSET))) + timedelta(days=1)
        start_dt = tomorrow.replace(hour=9, minute=0, second=0, microsecond=0)
        end_dt = start_dt + timedelta(hours=1)
        start_time = {"dateTime": start_dt.isoformat(), "timeZone": settings.DEFAULT_TIMEZONE}
        end_time = {"dateTime": end_dt.isoformat(), "timeZone": settings.DEFAULT_TIMEZONE}
    elif "date" in start_time:
        start_date = datetime.strptime(start_time["date"], "%Y-%m-%d")
        end_date = start_date + timedelta(days=1)
        end_time = {"date": end_date.strftime("%Y-%m-%d")}
    else:
        start_dt = datetime.fromisoformat(start_time["dateTime"])
        end_dt = start_dt + timedelta(hours=1)
        end_time = {"dateTime": end_dt.isoformat(), "timeZone": settings.DEFAULT_TIMEZONE}

    description = event.description or ""
    if event.owner:
        description += f"\n\n👤 Người phụ trách: {event.owner}"

    return {
        "summary": event.title,
        "description": description.strip(),
        "start": start_time,
        "end": end_time,
        "reminders": {"useDefault": False, "overrides": [{"method": "popup", "minutes": 30}]},
    }


@router.post("/create-events")
async def create_calendar_events(request: Request, payload: CreateEventsRequest):
    """Receive action items and create Google Calendar events."""
    access_token = _get_access_token(request)
    if not payload.events:
        raise HTTPException(status_code=400, detail="Danh sách sự kiện không được để trống")

    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    created, failed = [], []

    async with httpx.AsyncClient() as client:
        for event in payload.events:
            body = _build_event_body(event)
            try:
                response = await client.post(
                    f"{settings.GOOGLE_CALENDAR_API}/calendars/primary/events",
                    json=body, headers=headers, timeout=settings.CALENDAR_API_TIMEOUT,
                )
                if response.status_code in (200, 201):
                    data = response.json()
                    created.append({"title": event.title, "event_id": data.get("id"), "html_link": data.get("htmlLink")})
                elif response.status_code == 401:
                    raise HTTPException(status_code=401, detail="Google access token hết hạn. Vui lòng đăng nhập lại.")
                else:
                    failed.append({"title": event.title, "error": response.text})
            except httpx.RequestError as exc:
                failed.append({"title": event.title, "error": str(exc)})

    return {"message": f"Đã tạo {len(created)}/{len(payload.events)} sự kiện thành công", "created": created, "failed": failed}


@router.get("/events")
async def get_calendar_events(request: Request):
    """Fetch upcoming events from the user's Google Calendar."""
    access_token = _get_access_token(request)
    headers = {"Authorization": f"Bearer {access_token}"}
    now = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{settings.GOOGLE_CALENDAR_API}/calendars/primary/events",
                headers=headers,
                params={"timeMin": now, "maxResults": settings.CALENDAR_MAX_RESULTS, "singleEvents": True, "orderBy": "startTime"},
                timeout=settings.CALENDAR_API_TIMEOUT,
            )
            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="Google access token hết hạn. Vui lòng đăng nhập lại.")
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"Google Calendar API lỗi: {response.text}")
            return {"events": response.json().get("items", [])}
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail=f"Không kết nối được Google Calendar API: {exc}")


@router.post("/check-conflicts")
async def check_conflicts(payload: CheckConflictsRequest):
    """Compare candidate (task, event) pairs via LLM to detect duplicates."""
    if not payload.candidate_pairs:
        return {"conflicts": []}

    prompt = f"""You are a calendar conflict detector.
Compare each pair and determine if they refer to the same logical task.
Rules:
- Same topic AND same date = DUPLICATE (suggest: skip or patch)
- Same topic BUT different dates = RELATED (suggest: ask_reschedule)
- Different topic entirely = omit from results
Return ONLY valid JSON, no markdown:
{{"conflicts": [{{"task_id": <int>, "event_id": "<string>", "verdict": "DUPLICATE" | "RELATED", "reason": "<sentence>", "suggested_action": "skip" | "ask_reschedule"}}]}}
Pairs to check:
{json.dumps([p.dict() for p in payload.candidate_pairs], ensure_ascii=False, indent=2)}"""

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{settings.MODEL_SERVICE_BASE_URL}/generate/check-conflicts",
                json={"text": prompt},
                timeout=settings.MODEL_SERVICE_TIMEOUT,
            )
        if res.status_code != 200:
            return {"conflicts": []}

        try:
            text_res = res.json()
        except Exception:
            text_res = res.text

        raw_text = ""
        if isinstance(text_res, dict):
            if "conflicts" in text_res:
                val = text_res["conflicts"]
                if isinstance(val, list):
                    return {"conflicts": val}
                elif isinstance(val, str):
                    raw_text = val
            else:
                raw_text = text_res.get("text", "") or str(text_res)
        elif isinstance(text_res, str):
            raw_text = text_res

        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(0))
                return {"conflicts": parsed.get("conflicts", [])}
            except Exception:
                pass

        return {"conflicts": []}

    except Exception as e:
        print(f"[calendar] check-conflicts error: {e}")
        return {"conflicts": []}
