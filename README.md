# Smart Meeting Assistant

## Project Overview

A full-stack NLP application that transforms raw meeting audio into structured, actionable intelligence. Users upload meeting recordings and the system automatically:

- **Transcribes** speech to text using `faster-whisper` (Whisper large-v3)
- **Diarizes** audio to identify and separate individual speakers using `pyannote.audio`
- **Summarizes** the meeting content via a locally-hosted Qwen 2.5 14B LLM
- **Extracts action items** (tasks, assignees, deadlines) in structured JSON form
- **Synchronizes tasks** to Google Calendar via an autonomous AI Agent that resolves relative deadlines (e.g., "next Friday") and deduplicates existing events

The heavy inference pipeline (ASR + Diarization + LLM) runs on a remote GPU service (Kaggle T4), while the lightweight web application (API + UI) runs locally or in Docker.

---

## Repository Structure

```
project-root/
├── src/
│   ├── app/
│   │   ├── backend/        # FastAPI REST API (core source code)
│   │   └── frontend/       # React/Vite web application
│   ├── notebooks/          # Inference notebook (Kaggle runtime)
│   └── training/           # Training & evaluation Jupyter notebooks
├── data/                   # Data download scripts & README
├── models/                 # Model weights & download_checkpoints.py script
├── configs/                # NLP rules, thresholds (nlp_rules.json)
├── tests/                  # Unit tests & E2E pipeline test
├── docker-compose.yml      # Orchestrates backend + frontend containers
├── pyproject.toml          # Build system & pytest config
└── README.md
```

---

## Environment Setup Instructions

You need to configure environment variables for both the frontend and backend before running.

### 1. Frontend (Google OAuth & Calendar Integration)

Copy the example file and fill in your credentials:
```bash
cp src/app/frontend/.env.example src/app/frontend/.env
```

Required variable:
- `VITE_GOOGLE_CLIENT_ID`: Your Google OAuth 2.0 Client ID.

*How to get a Client ID:*
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**.
2. Create an **OAuth 2.0 Client ID** (Web application type).
3. Add `http://localhost:3000` and `http://localhost:5173` to **Authorized JavaScript origins**.
4. Copy the Client ID into the `.env` file.

> **For convenience**, you may use the pre-configured Client ID:
> `1070673665720-a4a6qeq55nkm5grt0m65k4n0f23mcnv3.apps.googleusercontent.com`

### 2. Backend (API & Model Service)

Copy the example file and fill in the required values:
```bash
cp src/app/backend/.env.example src/app/backend/.env
```

Required variables:
- `MODEL_SERVICE_BASE_URL`: The public URL of the external GPU inference service (e.g., your Kaggle tunnel URL).
- `DEFAULT_TIMEZONE` & `DEFAULT_TZ_OFFSET`: System timezone (e.g., `Asia/Ho_Chi_Minh` / `7`).

---

## Dependency Installation Steps

### Option A: Docker
No manual installation required. Docker handles all dependencies. See [Running the Deployed System](#running-the-deployed-system-web-app) below.

### Option B: Local (Manual)

**Backend:**
```bash
cd src/app/backend
pip install -r requirements.txt
```

**Frontend:**
```bash
cd src/app/frontend
npm install
```

**Data scripts** (only if you need to download training datasets):
```bash
pip install -r data/requirements.txt
```

**Testing tools:**
```bash
# From project root
pip install pytest requests
```

---

## How to Train the Model

The models are trained using Jupyter notebooks on a GPU-enabled environment
### Step 1: Prepare the Data

Download and preprocess the datasets using the scripts in the `data/` directory:
```bash
# Download & format LibriSpeech (for ASR training/evaluation)
python data/prepare_librispeech.py

# Download & format VoxConverse (for Diarization training/evaluation)
python data/prepare_voxconverse.py
```
See `data/README.md` for detailed instructions on each dataset.

### Step 2: Run Training Notebooks

Upload the processed datasets and the following notebooks to your Kaggle session:

| Notebook | Task | Location |
|---|---|---|
| `Train_ASR.ipynb` | Fine-tune Whisper on meeting audio | `src/training/` |
| `Train_Diarizaion.ipynb` | Fine-tune Pyannote Diarization | `src/training/` |

### Step 3: Evaluate

| Notebook | Metric | Location |
|---|---|---|
| `Evaluate_ASR.ipynb` | WER on LibriSpeech test-clean / test-other | `src/training/` |
| `Evaluate_Diarizaion.ipynb` | DER on VoxConverse | `src/training/` |

See `models/README.md` for expected benchmark results and checkpoint download instructions.

---

## How to Run Inference or the Deployed System

### Running the Inference Service (GPU — Kaggle)

The ASR, Diarization, and LLM inference runs on a separate GPU service because it requires ~14 GB VRAM. The full inference notebook is located at:

```
src/notebooks/nlp-app.ipynb
```

1. Upload this notebook to a Kaggle session with **GPU T4 x2** and **Internet** enabled.
2. Run all cells. The notebook will start a FastAPI server and expose a public URL via Cloudflare Tunnel.
3. Copy the tunnel URL and set it as `MODEL_SERVICE_BASE_URL` in `src/app/backend/.env`.

### Running the Deployed System (Web App)

The web application (Frontend + Backend API) runs via Docker Compose from the project root.

**Prerequisites:** Docker and Docker Compose installed, `.env` files configured.

```bash
# From the project root directory
docker compose up --build -d
```

| Service | URL |
|---|---|
| Frontend (Web UI) | http://localhost:3000 |
| Backend API (Swagger UI) | http://localhost:8000/docs |



### Running Locally (without Docker)

```bash
# Terminal 1 — Backend
cd src/app/backend
python main.py

# Terminal 2 — Frontend
cd src/app/frontend
npm run dev
```

### Running Tests

```bash
# From the project root

# Unit tests (Date Resolver, Metrics Monitor)
python -m pytest

# E2E pipeline test (requires backend running at localhost:8000)
python tests/test_e2e_pipeline.py
```

---

## Description of Deployment Method

The system uses a **two-tier deployment architecture**:

### Tier 1 — Web Application (Docker)

Both the API and UI are containerized and orchestrated via `docker-compose.yml` at the project root:

- **Backend container:** Python 3.10 slim image, runs `uvicorn` (FastAPI). Handles authentication (Google OAuth), per-user file workspace management, NLP rule processing, and MLOps metrics logging to `metrics.jsonl`.
- **Frontend container:** Node 18 Alpine image, serves the compiled Vite/React application.
- **Persistent volume:** `workspace_data` is mounted so uploaded audio files, transcripts, and JSON results survive container restarts.
- **Security:** No secrets are hard-coded. All credentials are injected at runtime via `.env` files and Docker environment variables.

### Tier 2 — GPU Inference Service (Kaggle)

Due to the memory requirements of Whisper large-v3 and Qwen 2.5 14B, the ML inference pipeline runs on a separate GPU machine:

- Hosted on Kaggle (T4 GPU, 16 GB VRAM).
- Exposed publicly via Cloudflare Tunnel.
- The web backend communicates with this service over HTTPS.
- **Timeout handling:** All inference endpoints use `StreamingResponse` with periodic heartbeat bytes to prevent Cloudflare's 100-second timeout from killing long-running inference jobs.
