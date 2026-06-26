FROM python:3.10-slim

WORKDIR /app

# System deps: libmagic1 for python-magic (MIME type validation)
# build-essential and python3-dev are needed to compile native extensions (like blis for spacy) on ARM64
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirement list and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model for NER-based speaker name extraction
RUN python -m spacy download en_core_web_sm

# Copy source code
COPY . .

# Pre-create the workspace directory (volume will mount here)
RUN mkdir -p /app/audio-workspaces

# Expose backend port
EXPOSE 8000

# Start FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
