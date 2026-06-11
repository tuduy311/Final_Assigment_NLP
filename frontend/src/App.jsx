import React, { useState, useEffect } from 'react'
import UploadForm from './components/UploadForm'
import ErrorMessage from './components/ErrorMessage'
import Loader from './components/Loader'
import Login from './components/Login'
import Navbar from './components/Navbar'
import AudioWorkspace from './components/AudioWorkspace'
import AudioRecorder from './components/AudioRecorder'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import { uploadAudio, getHistory, deleteWorkspace } from './services/api'
import { useAuth } from './context/AuthContext'
import './index.css'

function App() {
  const { isAuthenticated } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState(null)
  const [showDashboard, setShowDashboard] = useState(false)

  // Track the audio workspace data after a successful upload
  const [workspaceData, setWorkspaceData] = useState(null)

  const [history, setHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const fetchHistory = async () => {
    try {
      setIsLoadingHistory(true)
      const data = await getHistory()
      setHistory(data)
    } catch (err) {
      console.error('Failed to fetch history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleDeleteWorkspace = async (audioId) => {
    try {
      if (!window.confirm('Are you sure you want to delete this meeting?')) return
      await deleteWorkspace(audioId)
      if (workspaceData?.audio_id === audioId) {
        setWorkspaceData(null)
      }
      fetchHistory()
    } catch (err) {
      console.error('Failed to delete workspace:', err)
      alert('Failed to delete workspace.')
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchHistory()
    }
  }, [isAuthenticated])

  const handleFileSubmit = async (file) => {
    setIsLoading(true)
    setError(null)
    setShowDashboard(false)
    setLoadingStep('Uploading and preparing audio workspace...')

    try {
      const data = await uploadAudio(file)
      setWorkspaceData(data)
      fetchHistory() // Refresh history after new upload
    } catch (err) {
      const errorMessage =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Upload failed. Please try again.'
      setError(errorMessage)
      console.error('Upload Error:', err)
    } finally {
      setIsLoading(false)
      setLoadingStep('')
    }
  }

  const handleReset = () => {
    setWorkspaceData(null)
    setError(null)
    setShowDashboard(false)
  }

  const handleDashboardClick = () => {
    setShowDashboard(true)
    setWorkspaceData(null)
    setError(null)
  }

  const handleCloseError = () => {
    setError(null)
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar Area */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white">
        <Sidebar
          history={history}
          onSelectWorkspace={(workspace) => {
            setWorkspaceData(workspace)
            setShowDashboard(false)
          }}
          onHomeClick={handleReset}
          onDashboardClick={handleDashboardClick}
          onDeleteWorkspace={handleDeleteWorkspace}
          currentWorkspaceId={workspaceData?.audio_id}
          isLoadingHistory={isLoadingHistory}
          isDashboardView={showDashboard}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-white flex flex-col">
        {showDashboard ? (
          /* Dashboard: full-width, no max-w constraint */
          <div className="flex-1 flex flex-col p-6">
            <Dashboard />
          </div>
        ) : (
          /* Other views: constrained to max-w-5xl centered */
          <div className="max-w-5xl mx-auto w-full p-8 flex-1 flex flex-col">
            {/* Header */}
            <div className="text-center mb-8 pt-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome to Meetily Pro!
              </h1>
              <p className="text-gray-500">
                Click the <span className="inline-block mx-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg></span> icon to start live transcription
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <ErrorMessage message={error} onClose={handleCloseError} />
            )}

            <div className={`transition-all duration-300 flex-1 flex flex-col ${workspaceData ? '' : 'justify-center max-w-2xl mx-auto w-full'}`}>
              {isLoading ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
                  <Loader message={loadingStep} />
                </div>
              ) : workspaceData ? (
                <AudioWorkspace workspaceData={workspaceData} onReset={handleReset} />
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-2xl mx-auto w-full space-y-8">
                  <AudioRecorder onRecordingComplete={handleFileSubmit} isUploading={isLoading} />
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-gray-100" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-white text-gray-500">Or upload existing file</span>
                    </div>
                  </div>
                  <UploadForm onSubmit={handleFileSubmit} isLoading={isLoading} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

}

export default App
