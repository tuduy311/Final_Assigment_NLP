import React, { useState, useEffect } from 'react'
import UploadForm from './components/UploadForm'
import ResultView from './components/ResultView'
import ErrorMessage from './components/ErrorMessage'
import Loader from './components/Loader'
import Login from './components/Login'
import Navbar from './components/Navbar'
import { processMeeting } from './services/api'
import { useAuth } from './context/AuthContext'
import './index.css'

function App() {
  const { isAuthenticated } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)

  const handleFileSubmit = async (file) => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await processMeeting(file)
      setResults(data)
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        'Failed to process the meeting. Please try again.'
      setError(errorMessage)
      console.error('API Error:', err)
    } finally {
      setIsLoading(false)
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
              <Loader />
            ) : results ? (
              <ResultView data={results} onReset={handleReset} />
            ) : (
              <UploadForm onSubmit={handleFileSubmit} isLoading={isLoading} />
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-8 text-gray-600 text-sm">
            <p>
              Supported formats: MP3, WAV, OGG, M4A • Maximum file size: 100MB
            </p>
          </div>
        </div>
      </main>
    </>
  )
}

export default App
