# Meeting Minutes & Action Item Extraction System

## Project Overview
This is a full-stack application for automatic meeting transcription, diarization (speaker detection), and analysis. It allows users to upload meeting audio recordings and automatically extracts the full transcript, generates a concise summary, and extracts actionable items (tasks) with assignees and deadlines. It also features an AI Agent Chatbot that can answer questions about the meeting and help users schedule tasks on Google Calendar.

## Project Structure
```
.
├── frontend/                  # React frontend application
│   ├── src/                   # React source code (components, API)
│   ├── Dockerfile             # Docker instructions for frontend
│   └── package.json           # Node.js dependencies
│
├── backend/                   # FastAPI backend server
│   ├── routers/               # API endpoint handlers (audio, agent, calendar, metrics)
│   ├── Dockerfile             # Docker instructions for backend
│   └── requirements.txt       # Python dependencies
│
├── docker-compose.yml         # Docker compose configuration
└── README.md                  # This documentation file
```

## Environment Setup Instructions
You need to set up environment variables for both the frontend and backend.

1. **Frontend:**
   Copy `frontend/.env.example` to `frontend/.env` (if applicable) or configure Google OAuth credentials in your frontend code as instructed in `frontend/README.md`.
2. **Backend:**
   Copy `backend/.env.example` to `backend/.env` and fill in the required values:
   - `MODEL_SERVICE_BASE_URL`: The URL of the external AI model service.
   - `GEMINI_API_KEY`: Your Google Gemini API Key (get it from Google AI Studio) for the Agentic AI chatbot feature.

## Dependency Installation Steps
If you run without Docker, you must install dependencies manually:

**Frontend:**
```bash
cd frontend
npm install
```

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

*(Note: We highly recommend using Docker to automatically handle dependencies as shown below).*

## How to Train the Model
**No training is required in this repository.** 
This project focuses on the application layer (System Integration, Agentic AI, UI/UX, and Pipeline). The heavy ML components (Speech-to-Text via Whisper, Diarization, and LLM text generation via Qwen) are decoupled and hosted externally on a separate Model Service API (configured via `MODEL_SERVICE_BASE_URL`). The Agentic AI relies on the Google Gemini API, which is a pre-trained foundation model.

## How to Run Inference or the Deployed System
The recommended way to run the entire system reproducibly is via Docker Compose.

1. Make sure Docker and Docker Compose are installed on your machine.
2. Ensure you have configured the `.env` files.
3. Run the following command from the root of the project:
   ```bash
   docker compose up --build
   ```
4. Access the frontend application at `http://localhost:3000`.
5. Access the backend API documentation (Swagger UI) at `http://localhost:8000/docs`.

To run inference:
1. Open the UI at `http://localhost:3000`.
2. Upload an audio file.
3. Click "Generate Transcript" and "Detect Speakers" to trigger the backend inference pipeline.
4. Chat with the AI Agent at the bottom of the workspace to interact with the extracted data.

## Description of Deployment Method
The deployment uses **Docker containerization**. 
- The **Backend** is packaged in a Python 3.10 slim container running `uvicorn` (FastAPI).
- The **Frontend** is packaged in a Node 18 Alpine container running Vite.
- **Docker Compose** is used to orchestrate both services, exposing port `3000` for the UI and `8000` for the API. It mounts volumes for hot-reloading code during development and persists the `workspace_data` volume so audio files and JSON results are kept across container restarts.

## Code Quality Highlights
- **Well-organized and modular:** The frontend is strictly component-based. The backend uses FastAPI routers to split logic (`audio`, `metrics`, `agent`, `calendar`).
- **Reproducible:** Docker and `docker-compose.yml` are provided.
- **No Hard-coded Secrets:** All credentials, API keys, and model URLs are managed via `.env` files.
- **Large datasets:** Audio files are stored in the local `workspace_data` volume which is added to `.gitignore`. No large datasets or model weights are committed to the repository.
