# Smart Meeting Assistant

## Project Overview
This is a full-stack application for automatic meeting transcription, diarization (speaker detection), and analysis. It allows users to upload meeting audio recordings and automatically extracts the full transcript, generates a concise summary, and extracts actionable items (tasks) with assignees and deadlines. It also features an **Agentic Component for Autonomous Google Calendar Synchronization**, which intelligently resolves relative deadlines (e.g., "next Friday") and automatically schedules tasks to the user's calendar while avoiding duplicates.

## Environment Setup Instructions
You need to set up environment variables for both the frontend and backend.

1. **Frontend (Google Calendar Integration):**
   Copy `src/app/frontend/.env.example` to `src/app/frontend/.env`. You must provide a valid `VITE_GOOGLE_CLIENT_ID`.
   *How to get a Google Client ID:*
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Create a new project, go to **APIs & Services > Credentials**.
   - Create an **OAuth client ID** (Web application), add `http://localhost:5173` to the Authorized JavaScript origins.
   - Copy the generated Client ID and paste it into `VITE_GOOGLE_CLIENT_ID`.
   *(Note: For convenience during evaluation, you can use `1070673665720-a4a6qeq55nkm5grt0m65k4n0f23mcnv3.apps.googleusercontent.com`)*


2. **Backend:**
   Copy `src/app/backend/.env.example` to `src/app/backend/.env` and fill in the required values:
   - `MODEL_SERVICE_BASE_URL`: The URL of the external AI model service.
   - `DEFAULT_TIMEZONE` & `DEFAULT_TZ_OFFSET`: System timezone settings.

## Dependency Installation Steps
If you run the system locally without Docker, you must install dependencies manually.

**Frontend Dependencies:**
```bash
cd src/app/frontend
npm install
```

**Backend Dependencies:**
```bash
cd src/app/backend
pip install -r requirements.txt
```

**Testing Dependencies:**
If you wish to run the unit tests or E2E pipeline scripts in the `test/` folder, install the Python test packages from the project root:
```bash
pip install pytest requests

```
To run the tests:
```bash
python -m pytest
```
## How to Train the Model


## How to Run Inference or the Deployed System

### Running the Inference Notebooks
The inference notebooks contain heavy ML components that require significant GPU resources. **The inference notebook must be run on Kaggle** (or a machine with equivalent VRAM) to function properly without Out-Of-Memory errors.

### Running the Deployed System (Web App)
The recommended way to run the entire system reproducibly is via Docker Compose.

1. Ensure Docker and Docker Compose are installed on your machine.
2. Ensure you have configured the `.env` files.
3. Run the following command from the root of the project:
   ```bash
   cd src/app
   docker compose up --build -d
   ```
4. Access the frontend application at `http://localhost:3000`.
5. Access the backend API documentation (Swagger UI) at `http://localhost:8000/docs`.

### Running Tests
To run the automated tests locally:
- **Unit Tests:** Run `pytest` from the root directory to test the Date Resolver Agent and ML Drift Monitor logic.
- **E2E Integration Test:** Run `python test/test_e2e_pipeline.py` to simulate the full transcription pipeline.

## Description of Deployment Method
The deployment uses **Docker containerization** for robust reproducibility and isolation.

- **Backend Container:** Packaged in a Python 3.10 slim container running `uvicorn` (FastAPI). It handles API routing, NLP rules processing, and MLOps metrics.
- **Frontend Container:** Packaged in a Node 18 Alpine container running Vite.
- **Docker Compose:** Orchestrates both microservices, exposing port `5173` for the UI and `8000` for the API. It mounts a persistent volume for `workspace_data` so audio files and JSON results are kept safe across container restarts. Configuration parameters are injected dynamically via environment variables.
