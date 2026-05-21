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
 * Bước 1: Upload audio → transcribe + summary
 * Field name phải là 'file' (khớp với FastAPI UploadFile = File(...))\
 * Endpoint: POST /api/v1/audio/process-audio
 */
export const processMeeting = async (audioFile) => {
  const formData = new FormData()
  formData.append('file', audioFile)

  const response = await api.post('/v1/audio/process-audio', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}

/**
 * Bước 2: Gửi transcript để rút trích action items
 * Endpoint: POST /api/v1/audio/extract-tasks
 */
export const extractTasks = async (text) => {
  const response = await api.post('/v1/audio/extract-tasks', { text })
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

export default api
