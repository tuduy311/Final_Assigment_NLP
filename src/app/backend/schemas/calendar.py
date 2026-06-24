"""
schemas/calendar.py — Pydantic models for Google Calendar endpoints.
"""
from pydantic import BaseModel
from typing import List, Optional


class EventInput(BaseModel):
    title: str
    description: Optional[str] = ""
    deadline: Optional[str] = ""
    owner: Optional[str] = ""


class CreateEventsRequest(BaseModel):
    events: List[EventInput]


class CandidatePair(BaseModel):
    task_id: int
    task_title: str
    task_deadline: str
    event_id: str
    event_title: str
    event_start: str


class CheckConflictsRequest(BaseModel):
    candidate_pairs: List[CandidatePair]
