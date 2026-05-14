import axios from 'axios'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

// Add authorization token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
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
    // Token expired or invalid
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    window.location.href = '/'
  }
  return Promise.reject(error)
})

export const processMeeting = async (audioFile) => {
  const formData = new FormData()
  formData.append('audio', audioFile)

  const response = await api.post('/process-meeting', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}

export default api
