import React, { useState } from 'react'
import UploadForm from './components/UploadForm'
import ResultView from './components/ResultView'
import ErrorMessage from './components/ErrorMessage'
import Loader from './components/Loader'
import Login from './components/Login'
import Navbar from './components/Navbar'
import { processMeeting, extractTasks } from './services/api'
import { useAuth } from './context/AuthContext'
import './index.css'

function App() {
  const { isAuthenticated } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('') // mô tả bước đang xử lý
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)

  const handleFileSubmit = async (file) => {
    setIsLoading(true)
    setError(null)

    try {
      // ── BƯỚC 1: Transcribe + Summary ──────────────────────────────
      setLoadingStep('Đang chuyển giọng nói thành văn bản và tóm tắt...')
      const processData = await processMeeting(file)

      // Lấy transcript text từ transcript_result
      const transcriptText = processData.transcript_result?.text || ''
      const summary = processData.summary_result?.summary || ''

      if (!transcriptText.trim()) {
        setError('Không nhận diện được giọng nói trong file audio. Vui lòng thử lại với file khác.')
        return
      }

      // ── BƯỚC 2: Extract Action Items ───────────────────────────────
      setLoadingStep('Đang rút trích action items...')
      let actionItems = []
      try {
        const tasksData = await extractTasks(transcriptText)
        actionItems = tasksData.action_items || []
      } catch (taskErr) {
        // Không dừng app nếu extract tasks thất bại, chỉ log lỗi
        console.warn('Không thể rút trích action items:', taskErr)
      }

      // ── Normalize data để truyền xuống ResultView ─────────────────
      setResults({
        transcript:   transcriptText,
        summary:      summary,
        decisions:    [], // Model Service chưa hỗ trợ endpoint decisions riêng
        action_items: actionItems,
      })
    } catch (err) {
      const errorMessage =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Xử lý thất bại. Vui lòng thử lại.'
      setError(errorMessage)
      console.error('API Error:', err)
    } finally {
      setIsLoading(false)
      setLoadingStep('')
    }
  }

  const handleReset = () => {
    setResults(null)
    setError(null)
  }

  const handleCloseError = () => {
    setError(null)
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Meeting Minutes Extractor
            </h1>
            <p className="text-gray-600 text-lg">
              Upload your meeting audio and get instant summaries, decisions, and action items
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <ErrorMessage message={error} onClose={handleCloseError} />
          )}

          {/* Content */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            {isLoading ? (
              <Loader message={loadingStep} />
            ) : results ? (
              <ResultView data={results} onReset={handleReset} />
            ) : (
              <UploadForm onSubmit={handleFileSubmit} isLoading={isLoading} />
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-8 text-gray-600 text-sm">
            <p>
              Supported formats: MP3, WAV, OGG, M4A, FLAC, WEBM • Maximum file size: 100MB
            </p>
          </div>
        </div>
      </main>
    </>
  )
}

export default App

