"""
main.py — Smart Meeting Assistant Backend
FastAPI app with CORS; routes all requests through the versioned api/v1 layer.

Router layout:
  /api/v1/audio     ← api/v1/audio.py      (Workspace CRUD)
  /api/v1/audio     ← api/v1/processing.py (ASR, Diarization, Correction)
  /api/v1/audio     ← api/v1/generation.py (LLM Summary & Tasks)
  /api/v1/calendar  ← api/v1/calendar.py
  /api/v1/metrics   ← api/v1/metrics.py
"""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import uvicorn

# Load .env before importing routers (so settings picks up env vars)
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from api.v1 import audio, processing, generation, calendar, metrics

app = FastAPI(
    title="Smart Meeting Assistant API",
    description="Backend gateway connecting the frontend to NLP model services.",
    version="2.0.0",
)

# CORS — restrict to your frontend origin in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers — audio, processing, generation all use /audio prefix (FastAPI merges correctly)
app.include_router(audio.router,      prefix="/api/v1")
app.include_router(processing.router, prefix="/api/v1")
app.include_router(generation.router, prefix="/api/v1")
app.include_router(calendar.router,   prefix="/api/v1")
app.include_router(metrics.router,    prefix="/api/v1")


@app.get("/", tags=["Health"])
async def root():
    return {
        "message": "Smart Meeting Assistant API is running.",
        "docs": "/docs",
        "version": app.version,
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
