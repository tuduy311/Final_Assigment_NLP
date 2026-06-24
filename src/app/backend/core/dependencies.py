"""
core/dependencies.py — FastAPI Depends() providers.
All shared dependencies are declared here for DI consistency.
"""
from fastapi import Depends, HTTPException, Request

from core.user_resolver import resolve_user_id
from services.metrics_service import MetricsService, get_metrics_service

# Re-export metrics provider for routers
__all__ = ["get_metrics_service", "MetricsService", "get_current_user_id"]


async def get_current_user_id(request: Request) -> str:
    """
    FastAPI dependency: extract and verify Google access token from request header.
    Returns the stable Google 'sub' (user ID) for workspace isolation.
    Raises HTTP 401 if token is missing or invalid.
    """
    token = request.headers.get("X-Google-Access-Token")
    if not token:
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Vui lòng đăng nhập để sử dụng tính năng này.",
        )
    return await resolve_user_id(token)
