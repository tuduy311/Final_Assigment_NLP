"""
core/user_resolver.py — Google OAuth token → stable user_id (sub).

Google's 'sub' is a permanent, unique identifier per Google account.
It remains constant across logout/login cycles, unlike the access_token.

In-memory cache (token → sub) with 55-minute TTL avoids calling
Google Userinfo API on every request.
"""
import time

import httpx
from fastapi import HTTPException

# Cache: { access_token: (sub, expires_at_timestamp) }
_token_cache: dict[str, tuple[str, float]] = {}

_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
_CACHE_TTL_SECONDS = 55 * 60  # 55 minutes (access_token valid for ~60 min)


async def resolve_user_id(token: str) -> str:
    """
    Resolve a Google access_token to a stable user_id (Google 'sub').
    Returns cached value if still valid; otherwise calls Google Userinfo API.
    """
    # Check in-memory cache first
    if token in _token_cache:
        sub, expires_at = _token_cache[token]
        if time.time() < expires_at:
            return sub
        else:
            del _token_cache[token]

    # Call Google Userinfo API
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                _GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Không thể xác thực người dùng (Google Userinfo unreachable): {exc}",
        )

    if res.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail="Google access token hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
        )
    if res.status_code != 200:
        raise HTTPException(
            status_code=503,
            detail=f"Lỗi xác thực người dùng (Google API: {res.status_code}).",
        )

    data = res.json()
    sub = data.get("sub")
    if not sub:
        raise HTTPException(status_code=503, detail="Không lấy được user ID từ Google.")

    # Store in cache
    _token_cache[token] = (sub, time.time() + _CACHE_TTL_SECONDS)
    return sub
