import axios from 'axios'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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
