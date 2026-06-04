from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import httpx
from datetime import datetime, timezone, timedelta

router = APIRouter(
    prefix="/calendar",
    tags=["Google Calendar"],
)

GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


def _get_access_token(request: Request) -> str:
    """Lấy Google access_token từ header X-Google-Access-Token."""
    token = request.headers.get("X-Google-Access-Token")
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Thiếu Google access token. Vui lòng đăng nhập lại."
        )
    return token


# ─────────────────────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class EventInput(BaseModel):
    title: str
    description: Optional[str] = ""
    deadline: Optional[str] = ""   # ISO 8601 hoặc string tự do, vd "2024-06-15"
    owner: Optional[str] = ""


class CreateEventsRequest(BaseModel):
    events: List[EventInput]


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_deadline(deadline_str: str) -> Optional[dict]:
    """
    Chuyển chuỗi deadline thành Google Calendar dateTime/date.
    Trả về None nếu không parse được → dùng ngày mai mặc định.
    """
    if not deadline_str or not deadline_str.strip():
        return None

    deadline_str = deadline_str.strip()

    # Thử parse ISO format trước (hỗ trợ .000Z từ frontend JS)
    try:
        # Nếu có Z ở cuối, thay bằng +00:00 để fromisoformat parse được (cho python < 3.11)
        iso_str = deadline_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(iso_str)
        vn_tz = timezone(timedelta(hours=7))
        if dt.tzinfo:
            dt = dt.astimezone(vn_tz)
        else:
            dt = dt.replace(tzinfo=vn_tz)
        return {"dateTime": dt.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"}
    except ValueError:
        pass

    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(deadline_str, fmt)
            # Nếu chỉ có ngày (không có giờ), dùng all-day event
            if fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
                return {"date": dt.strftime("%Y-%m-%d")}
            else:
                vn_tz = timezone(timedelta(hours=7))
                dt = dt.replace(tzinfo=vn_tz)
                return {"dateTime": dt.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"}
        except ValueError:
            continue

    return None


def _build_event_body(event: EventInput) -> dict:
    """Tạo body theo định dạng Google Calendar API."""
    # Parse deadline
    start_time = _parse_deadline(event.deadline)

    if start_time is None:
        # Mặc định: ngày mai lúc 9:00 sáng
        tomorrow = datetime.now(timezone(timedelta(hours=7))) + timedelta(days=1)
        start_dt = tomorrow.replace(hour=9, minute=0, second=0, microsecond=0)
        end_dt = start_dt + timedelta(hours=1)
        start_time = {"dateTime": start_dt.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"}
        end_time = {"dateTime": end_dt.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"}
    elif "date" in start_time:
        # All-day event: end = start + 1 ngày
        start_date = datetime.strptime(start_time["date"], "%Y-%m-%d")
        end_date = start_date + timedelta(days=1)
        end_time = {"date": end_date.strftime("%Y-%m-%d")}
    else:
        # Có giờ cụ thể: end = start + 1 giờ
        start_dt = datetime.fromisoformat(start_time["dateTime"])
        end_dt = start_dt + timedelta(hours=1)
        end_time = {"dateTime": end_dt.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"}

    description = event.description or ""
    if event.owner:
        description += f"\n\n👤 Người phụ trách: {event.owner}"

    return {
        "summary": event.title,
        "description": description.strip(),
        "start": start_time,
        "end": end_time,
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": 30},
            ],
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/create-events")
async def create_calendar_events(request: Request, payload: CreateEventsRequest):
    """
    Nhận danh sách action items, tạo sự kiện trên Google Calendar của user.
    Frontend phải gửi Google access_token qua header X-Google-Access-Token.
    """
    access_token = _get_access_token(request)

    if not payload.events:
        raise HTTPException(status_code=400, detail="Danh sách sự kiện không được để trống")

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    created = []
    failed = []

    async with httpx.AsyncClient() as client:
        for event in payload.events:
            body = _build_event_body(event)
            try:
                response = await client.post(
                    f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
                    json=body,
                    headers=headers,
                    timeout=30.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    created.append({
                        "title": event.title,
                        "event_id": data.get("id"),
                        "html_link": data.get("htmlLink"),
                    })
                elif response.status_code == 401:
                    raise HTTPException(
                        status_code=401,
                        detail="Google access token hết hạn. Vui lòng đăng nhập lại."
                    )
                else:
                    print(f"GOOGLE CALENDAR API ERROR: {response.text}")
                    failed.append({
                        "title": event.title,
                        "error": response.text,
                    })

            except httpx.RequestError as exc:
                failed.append({
                    "title": event.title,
                    "error": str(exc),
                })

    return {
        "message": f"Đã tạo {len(created)}/{len(payload.events)} sự kiện thành công",
        "created": created,
        "failed": failed,
    }


@router.get("/events")
async def get_calendar_events(request: Request):
    """
    Lấy danh sách sự kiện sắp tới từ Google Calendar của user.
    """
    access_token = _get_access_token(request)

    headers = {"Authorization": f"Bearer {access_token}"}
    now = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
                headers=headers,
                params={
                    "timeMin": now,
                    "maxResults": 20,
                    "singleEvents": True,
                    "orderBy": "startTime",
                },
                timeout=30.0,
            )

            if response.status_code == 401:
                raise HTTPException(
                    status_code=401,
                    detail="Google access token hết hạn. Vui lòng đăng nhập lại."
                )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Google Calendar API lỗi: {response.text}"
                )

            data = response.json()
            return {"events": data.get("items", [])}

        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Không kết nối được Google Calendar API: {exc}"
            )
