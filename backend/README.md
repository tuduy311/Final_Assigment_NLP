# Backend API - Meeting Minutes Extractor

Backend API server for processing meeting audio and extracting transcripts, summaries, decisions, and action items.

## 📋 Requirements

Build a backend API that:

1. **Accepts audio uploads** via multipart/form-data
2. **Processes the audio** (transcription, analysis, extraction)
3. **Returns structured data** with:
   - Full meeting transcript
   - AI-generated summary
   - Key decisions extracted
   - Action items (task, owner, deadline)

## 🔌 API Endpoint

### POST /process-meeting

**Request:**
```
Content-Type: multipart/form-data

Field: audio (File)
- Supported formats: MP3, WAV, OGG, M4A
- Max size: 100MB
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

**Error Response (400/500):**
```json
{
  "message": "Error description"
}
```

## 🛠 Tech Stack (Suggested)

- **Node.js + Express** - Web framework
- **Multer** - File upload handling
- **Whisper / AssemblyAI / Google Speech-to-Text** - Audio transcription
- **OpenAI API / Claude API** - NLP for summary & extraction
- **Cors** - Cross-origin requests
- **dotenv** - Environment variables

## 📝 Example Implementation (Node.js + Express)

```javascript
import express from 'express'
import multer from 'multer'
import cors from 'cors'

const app = express()
const upload = multer({ dest: 'uploads/' })

app.use(cors())
app.use(express.json())

app.post('/process-meeting', upload.single('audio'), async (req, res) => {
  try {
    const audioFile = req.file
    
    // 1. Transcribe audio
    const transcript = await transcribeAudio(audioFile.path)
    
    // 2. Generate summary
    const summary = await generateSummary(transcript)
    
    // 3. Extract decisions
    const decisions = await extractDecisions(transcript)
    
    // 4. Extract action items
    const actionItems = await extractActionItems(transcript)
    
    res.json({
      transcript,
      summary,
      decisions,
      action_items: actionItems
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.listen(5000, () => {
  console.log('Backend running on port 5000')
})
```

## 🔐 Environment Variables

Create `.env` file:
```
PORT=5000
CORS_ORIGIN=http://localhost:3000
OPENAI_API_KEY=your_key_here
SPEECH_TO_TEXT_API_KEY=your_key_here
```

## 📦 Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "multer": "^1.4.5",
    "cors": "^2.8.5",
    "axios": "^1.4.0",
    "dotenv": "^16.3.1",
    "openai": "^3.3.0"
  }
}
```

## 🚀 Setup Instructions

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start server
npm start

# Should output: "Backend running on port 5000"
```

## 🧪 Testing

```bash
# Example curl request
curl -X POST http://localhost:5000/process-meeting \
  -F "audio=@meeting.mp3"

# Response:
# {
#   "transcript": "...",
#   "summary": "...",
#   "decisions": ["..."],
#   "action_items": [{"task": "...", "owner": "...", "deadline": "..."}]
# }
```

## 📝 Notes

- Ensure CORS is configured to allow frontend (`http://localhost:3000`)
- Handle large file uploads (implement streaming if needed)
- Implement proper error handling and validation
- Use environment variables for API keys
- Consider implementing request logging
- Add rate limiting for production
- Test with various audio formats and sizes

## 🔗 Frontend Integration

The frontend (`../frontend/`) will call `POST /process-meeting` and expects the response format above.

If running on a different port, update:
- `frontend/vite.config.js` - proxy configuration
- Or update `frontend/src/services/api.js` - API base URL
