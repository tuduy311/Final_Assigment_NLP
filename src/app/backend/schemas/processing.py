"""
schemas/processing.py — Pydantic models for AI pipeline endpoints.
"""
from pydantic import BaseModel
from typing import Optional, Dict


class SpeakerMapRequest(BaseModel):
    speaker_map: Dict[str, str]


class SummaryRequest(BaseModel):
    text: str
    audio_id: Optional[str] = None
    user_name: Optional[str] = None
    meeting_date: Optional[str] = None


class CorrectionRequest(BaseModel):
    original_text: str
    corrected_text: str
