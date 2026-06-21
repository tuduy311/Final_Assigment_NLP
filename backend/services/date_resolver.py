import re
from datetime import datetime, timezone, timedelta

try:
    import dateparser
    DATEPARSER_AVAILABLE = True
except ImportError:
    DATEPARSER_AVAILABLE = False

VN_TZ = timezone(timedelta(hours=7))

_WEEKDAY_MAP = {
    'monday': 0, 'tuesday': 1, 'wednesday': 2,
    'thursday': 3, 'friday': 4, 'saturday': 5, 'sunday': 6,
    'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6,
}

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
    if not isinstance(anchor, dict):
        anchor = {}

    anchor_type = str(anchor.get("type", "unknown"))
    anchor_absolute = str(anchor.get("absolute_value", "")) if anchor.get("absolute_value") else None
    
    raw_phrase = str(deadline_obj.get("raw_phrase", ""))
    offset = str(deadline_obj.get("offset_from_anchor", ""))

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
        if base_date is None and raw_phrase:
            base_date = _try_parse_absolute_date(raw_phrase, now)
    elif anchor_type == "event_in_transcript":
        return None
    else:
        if raw_phrase:
            parsed = _try_parse_absolute_date(raw_phrase, now)
            if parsed:
                return parsed.strftime("%Y-%m-%d")
        return None

    if base_date and offset:
        resolved = _apply_offset(base_date, offset)
        if resolved:
            return resolved.strftime("%Y-%m-%d")

    if base_date:
        return base_date.strftime("%Y-%m-%d")

    return None

def process_action_item_deadlines(action_items: list) -> list:
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
            item["deadline_info"] = {"raw_phrase": dl}
            continue

        if isinstance(dl, dict):
            item["deadline_info"] = dl

            resolved = _resolve_deadline_obj(dl, now)
            if resolved:
                dl["resolved"] = resolved
                item["deadline"] = resolved
            else:
                item["deadline"] = dl.get("raw_phrase") or ""
        else:
            item["deadline"] = ""
            item["deadline_info"] = None

    return action_items
