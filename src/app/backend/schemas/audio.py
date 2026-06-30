"""
schemas/audio.py — Pydantic models for workspace/audio CRUD endpoints.
"""
from pydantic import BaseModel


class RenameRequest(BaseModel):
    filename: str


class ActionItemsRequest(BaseModel):
    action_items: list
