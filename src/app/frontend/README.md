# Meeting Minutes Extractor

Production-ready React frontend for automatic meeting minutes and action item extraction.

## ✨ Features

- **Audio Upload**: Drag & drop or file picker for audio files (MP3, WAV, OGG, M4A)
- **Real-time Processing**: Calls backend API and displays results
- **Rich Results Display**:
  - Full meeting transcript
  - AI-generated summary
  - Key decisions extracted
  - Action items with owner and deadline
- **User Experience**:
  - Loading spinner during processing
  - Error handling with clear messages
  - Copy to clipboard functionality
  - Collapsible sections for better readability
  - Responsive design
  - Clean modern UI with TailwindCSS

## 📁 Project Structure

```
src/
├── components/
│   ├── UploadForm.jsx        # File upload with drag & drop
│   ├── ResultView.jsx        # Results display with collapsible sections
│   ├── ActionItemTable.jsx   # Table for action items
│   ├── Loader.jsx            # Loading spinner
│   ├── ErrorMessage.jsx      # Error display
│   └── index.js              # Component exports
├── services/
│   └── api.js                # API client & requests
├── App.jsx                   # Main app component
├── main.jsx                  # React entry point
└── index.css                 # Global styles & animations

Configuration:
├── vite.config.js            # Vite bundler config with API proxy
├── tailwind.config.js        # TailwindCSS configuration
├── postcss.config.js         # PostCSS setup for TailwindCSS
├── package.json              # Dependencies & scripts
└── index.html                # HTML entry point
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app runs on `http://localhost:3000` with API proxy to `http://localhost:8000`.

## 🔌 API Integration

### Backend Requirements

Your backend should have this endpoint:

```
POST /process-meeting
Content-Type: multipart/form-data

Request:
- audio: File (the audio file)

Response (200 OK):
{
  "transcript": "string",
  "summary": "string",
  "decisions": ["string", "string"],
  "action_items": [
    {
      "task": "string",
      "owner": "string",
      "deadline": "string"
    }
  ]
}
```

### API Configuration

Edit `src/services/api.js` to change the API base URL:

```javascript
const API_BASE_URL = '/api'  // Change this URL
```

Or update the proxy in `vite.config.js`:

```javascript
proxy: {
  '/api': {
    target: 'http://localhost:8000',  // Your backend URL
  }
}
```

## 🎨 Components

### UploadForm
- Drag & drop zone with visual feedback
- File input with validation
- Loading state on submit button
- Clear button to reset selection

### ResultView
- Collapsible sections for each result type
- Copy to clipboard for individual sections
- Copy all results functionality
- Process another meeting button

### ActionItemTable
- Responsive table layout
- Icons for owner and deadline
- Status indicator (pending/completed)
- Empty state handling

### Loader
- Animated spinner
- Processing status message

### ErrorMessage
- Error alert with icon
- Close button
- Clear error messaging

## 🎯 Key Features

✅ Production-ready code
✅ Error handling & edge cases
✅ Loading states
✅ Responsive design
✅ Accessibility considerations
✅ Component separation
✅ Clean code structure
✅ Comments where needed

## 📦 Dependencies

- **react** & **react-dom** - UI framework
- **axios** - HTTP client for API calls
- **tailwindcss** - Utility-first CSS framework
- **lucide-react** - Icon library
- **vite** - Fast bundler
- **postcss** & **autoprefixer** - CSS processing

## 🔧 Development

### Adding New Features
1. Create new components in `src/components/`
2. Import and use in `App.jsx` or other components
3. Keep components focused and reusable

### Styling
- Use TailwindCSS classes for styling
- Custom styles in `src/index.css`
- Responsive breakpoints: sm, md, lg, xl, 2xl

### Building
```bash
npm run build  # Creates optimized dist/ folder
```

## 📝 Notes

- Supports audio files up to 100MB
- Accepts MP3, WAV, OGG, M4A, FLAC, WEBM formats
- API request timeout: 11 minutes (660,000 ms) to support transcription & analysis buffering
- Cross-origin requests handled via Vite proxy

## 📄 License

MIT
