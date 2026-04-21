# Meeting Minutes & Action Item Extraction System

Complete full-stack application for automatic meeting transcription and analysis.

## 📁 Project Structure

```
.
├── frontend/                  # React frontend application
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── services/          # API client
│   │   ├── App.jsx           # Main app component
│   │   ├── main.jsx          # React entry point
│   │   └── index.css         # Global styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── README.md             # Frontend documentation
│
├── backend/                   # Backend API server
│   ├── (API implementation)
│   └── README.md             # Backend documentation
│
├── README.md                 # This file
└── .gitignore
```

## 🚀 Quick Start

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: `http://localhost:3000`

### Backend Setup

```bash
cd backend
# Follow backend-specific setup in backend/README.md
```

Backend should run on: `http://localhost:5000`

## 📦 Technologies

**Frontend:**
- React 18 with Hooks
- Vite (fast bundler)
- TailwindCSS (styling)
- Axios (HTTP client)
- Lucide React (icons)

**Backend:**
- (To be implemented)

## 🔌 API Specification

### POST /process-meeting

**Request:**
```
Content-Type: multipart/form-data
- audio: File (audio file)
```

**Response (200 OK):**
```json
{
  "transcript": "string",
  "summary": "string",
  "decisions": ["string"],
  "action_items": [
    {
      "task": "string",
      "owner": "string",
      "deadline": "string"
    }
  ]
}
```

## 📖 Documentation

- See `frontend/README.md` for frontend details
- See `backend/README.md` for backend details

## 🔗 Development Workflow

1. **Frontend** listens on port 3000
2. **Backend** listens on port 5000
3. Frontend proxies API calls to `/api` → `http://localhost:5000`
4. Edit `frontend/vite.config.js` if backend URL changes

## 📝 Notes

- Both services should run independently
- Frontend can be deployed separately from backend
- API communication is JSON-based
- Audio file support: MP3, WAV, OGG, M4A
