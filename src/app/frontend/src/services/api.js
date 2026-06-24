import axios from 'axios'

const API_BASE_URL = '/api'

// Timeout 11 phút — đủ cho STT (600s) + summary (300s) + buffer
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 660000,
})

// Tự động đính kèm Google access_token vào mọi request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('googleAccessToken')
  if (token) {
    config.headers['X-Google-Access-Token'] = token
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

// Handle 401 Unauthorized responses
api.interceptors.response.use((response) => {
  return response
}, (error) => {
  if (error.response?.status === 401) {
    localStorage.removeItem('googleAccessToken')
    localStorage.removeItem('user')
    window.location.href = '/'
  }
  return Promise.reject(error)
})

/**
 * Bước 1: Upload audio
 * Endpoint: POST /api/v1/audio/upload
 */
export const uploadAudio = async (audioFile) => {
  const formData = new FormData()
  formData.append('file', audioFile)

  const response = await api.post('/v1/audio/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

/**
 * Bước 2: Generate Transcript
 * Endpoint: POST /api/v1/audio/{audioId}/transcribe
 */
export const generateTranscript = async (audioId) => {
  const response = await api.post(`/v1/audio/${audioId}/transcribe`)
  return response.data
}

/**
 * Bước 3: Detect Speakers (Diarization)
 * Endpoint: POST /api/v1/audio/{audioId}/diarize
 */
export const detectSpeakers = async (audioId) => {
  const response = await api.post(`/v1/audio/${audioId}/diarize`)
  return response.data
}

/**
 * Bước 4: Generate Summary
 * Endpoint: POST /api/v1/audio/summary/generate
 */
export const generateSummaryText = async (text, audioId = null, userName = null) => {
  const payload = { text }
  if (audioId) payload.audio_id = audioId
  if (userName) payload.user_name = userName
  const response = await api.post('/v1/audio/summary/generate-text', payload)
  return response.data
}

export const generateActionItems = async (text, audioId = null, userName = null) => {
  const payload = { text }
  if (audioId) payload.audio_id = audioId
  if (userName) payload.user_name = userName
  const response = await api.post('/v1/audio/summary/generate-tasks', payload)
  return response.data
}

export const saveActionItems = async (audioId, actionItems) => {
  const response = await api.put(`/v1/audio/${audioId}/action-items`, { action_items: actionItems })
  return response.data
}

export const deleteWorkspace = async (audioId) => {
  const response = await api.delete(`/v1/audio/${audioId}`)
  return response.data
}

/**
 * Tạo sự kiện Google Calendar từ action items
 * Endpoint: POST /api/v1/calendar/create-events
 * @param {Array} events - Danh sách sự kiện [{title, description, deadline}]
 */
export const createCalendarEvents = async (events) => {
  const response = await api.post('/v1/calendar/create-events', { events })
  return response.data
}

/**
 * Lấy danh sách sự kiện từ Google Calendar
 * Endpoint: GET /api/v1/calendar/events
 */
export const getCalendarEvents = async () => {
  const response = await api.get('/v1/calendar/events')
  return response.data
}

export const getHistory = async () => {
  const response = await api.get('/v1/audio/history')
  return response.data
}

export const getAudioResults = async (audioId) => {
  const response = await api.get(`/v1/audio/${audioId}/results`)
  return response.data
}

export const submitCorrection = async (audioId, originalText, correctedText) => {
  const payload = { original_text: originalText, corrected_text: correctedText }
  const response = await api.post(`/v1/audio/${audioId}/correction`, payload)
  return response.data
}

export const saveSpeakerMap = async (audioId, speakerMap) => {
  const response = await api.post(`/v1/audio/${audioId}/speaker-map`, {
    speaker_map: speakerMap,
  })
  return response.data
}

export const getAudioFileUrl = (audioId) => {
  const token = localStorage.getItem('googleAccessToken')
  return `/api/v1/audio/${audioId}/file${token ? `?token=${token}` : ''}`
}

export default api
