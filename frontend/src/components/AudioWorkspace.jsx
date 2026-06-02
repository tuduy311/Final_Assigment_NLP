import React, { useState, useMemo, useEffect } from 'react'
import { generateTranscript, detectSpeakers, generateSummary, getAudioResults } from '../services/api'
import { mergeTranscriptAndDiarization } from '../utils/mergeTranscript'
import { Loader2, FileAudio, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import ActionItemTable from './ActionItemTable'

const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export const AudioWorkspace = ({ workspaceData, onReset }) => {
  const [transcriptResult, setTranscriptResult] = useState(null)
  const [diarizationResult, setDiarizationResult] = useState(null)
  const [mergedTranscriptResult, setMergedTranscriptResult] = useState(null)
  const [summaryResult, setSummaryResult] = useState(null)

  const [isLoading, setIsLoading] = useState({
    transcript: false,
    diarize: false,
    merge: false,
    summary: false
  })
  
  const [error, setError] = useState(null)

  const [speakerMap, setSpeakerMap] = useState({})
  
  const uniqueSpeakers = useMemo(() => {
    if (!diarizationResult) return [];
    const segments = diarizationResult.segments || diarizationResult || [];
    const speakers = new Set(Array.isArray(segments) ? segments.map(s => s.speaker || s.label || 'Unknown') : []);
    return Array.from(speakers).sort();
  }, [diarizationResult]);

  useEffect(() => {
    const fetchResults = async () => {
      if (!workspaceData?.audio_id) return
      
      // Reset state first
      setTranscriptResult(null)
      setDiarizationResult(null)
      setMergedTranscriptResult(null)
      setSummaryResult(null)
      setSpeakerMap({})
      setError(null)

      try {
        const results = await getAudioResults(workspaceData.audio_id)
        if (results.transcript) setTranscriptResult(results.transcript)
        if (results.diarization) setDiarizationResult(results.diarization)
        if (results.summary) setSummaryResult(results.summary)
      } catch (err) {
        console.error('Failed to load existing results:', err)
      }
    }
    
    fetchResults()
  }, [workspaceData?.audio_id])

  const handleAction = async (actionType) => {
    setError(null)
    setIsLoading(prev => ({ ...prev, [actionType]: true }))

    try {
      const audioId = workspaceData.audio_id

      switch (actionType) {
        case 'transcript':
          const tRes = await generateTranscript(audioId)
          setTranscriptResult(tRes)
          break;
        case 'diarize':
          const dRes = await detectSpeakers(audioId)
          setDiarizationResult(dRes)
          break;
        case 'merge':
          // Thực hiện merge ở frontend
          const mergedStr = mergeTranscriptAndDiarization(transcriptResult, diarizationResult, speakerMap)
          setMergedTranscriptResult(mergedStr)
          break;
        case 'summary':
          // Dùng mergedTranscript nếu có, nếu không thì dùng raw transcript
          const textToSummarize = mergedTranscriptResult || transcriptResult?.text || ''
          const sRes = await generateSummary(textToSummarize, audioId)
          setSummaryResult(sRes)
          break;
      }
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.detail || err.message || `Lỗi khi thực hiện ${actionType}`)
    } finally {
      setIsLoading(prev => ({ ...prev, [actionType]: false }))
    }
  }

  // Conditions to enable buttons
  const canMerge = transcriptResult && diarizationResult
  const canSummarize = transcriptResult || mergedTranscriptResult

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Header Info */}
      <div className="bg-white rounded-xl shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileAudio className="w-6 h-6 text-blue-600" />
            {workspaceData.filename}
          </h2>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Duration: {formatDuration(workspaceData.duration)}
          </p>
        </div>
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Upload New File
        </button>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ActionButton 
          title="Generate Transcript"
          onClick={() => handleAction('transcript')}
          isLoading={isLoading.transcript}
          isDone={!!transcriptResult}
          disabled={isLoading.transcript}
        />
        <ActionButton 
          title="Detect Speakers"
          onClick={() => handleAction('diarize')}
          isLoading={isLoading.diarize}
          isDone={!!diarizationResult}
          disabled={isLoading.diarize}
        />
        <ActionButton 
          title="Merge"
          onClick={() => handleAction('merge')}
          isLoading={isLoading.merge}
          isDone={!!mergedTranscriptResult}
          disabled={!canMerge || isLoading.merge}
        />
        <ActionButton 
          title="Generate Summary"
          onClick={() => handleAction('summary')}
          isLoading={isLoading.summary}
          isDone={!!summaryResult}
          disabled={!canSummarize || isLoading.summary}
        />
      </div>

      {/* Results View */}
      <div className="space-y-6 mt-8">
        {diarizationResult && uniqueSpeakers.length > 0 && (
          <ResultSection title="Speaker Configuration" defaultOpen={true}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {uniqueSpeakers.map(speaker => (
                <div key={speaker} className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">{speaker}</label>
                  <input 
                    type="text" 
                    placeholder="e.g. John"
                    value={speakerMap[speaker] || ''}
                    onChange={(e) => setSpeakerMap(prev => ({ ...prev, [speaker]: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </ResultSection>
        )}

        {summaryResult && (
          <ResultSection title="Summary & Action Items" defaultOpen={true}>
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-semibold mb-2">Summary</h4>
                <p className="whitespace-pre-wrap text-gray-700">{summaryResult.summary}</p>
              </div>
              <div>
                <h4 className="text-lg font-semibold mb-2">Action Items</h4>
                <ActionItemTable items={summaryResult.action_items || []} />
              </div>
            </div>
          </ResultSection>
        )}

        {transcriptResult && (
          <ResultSection title="Transcript" defaultOpen={!summaryResult}>
            {diarizationResult ? (
              <p className="whitespace-pre-wrap text-gray-700">
                {mergedTranscriptResult || mergeTranscriptAndDiarization(transcriptResult, diarizationResult, {})}
              </p>
            ) : (
              <div className="text-gray-700 space-y-2">
                {transcriptResult.segments && transcriptResult.segments.length > 0
                  ? transcriptResult.segments.map((seg, idx) => (
                      <div key={idx}>
                        <span className="font-semibold text-gray-900">
                          ({Number(seg.start).toFixed(2)}-{Number(seg.end).toFixed(2)}):
                        </span>
                        <span> {seg.text.trim()}</span>
                      </div>
                    ))
                  : <p className="whitespace-pre-wrap">{transcriptResult.text}</p>
                }
              </div>
            )}
          </ResultSection>
        )}
      </div>
    </div>
  )
}

const ActionButton = ({ title, onClick, isLoading, isDone, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative p-4 rounded-xl border-2 text-left transition-all ${
        disabled && !isDone
          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
          : isDone
          ? 'border-green-500 bg-green-50 text-green-700'
          : 'border-blue-200 bg-white hover:border-blue-500 hover:shadow-md text-gray-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        {isLoading && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
        {isDone && !isLoading && <CheckCircle2 className="w-5 h-5 text-green-500" />}
      </div>
    </button>
  )
}

const ResultSection = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors border-b border-gray-100"
      >
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <span className="text-sm text-gray-500">{isOpen ? 'Hide' : 'Show'}</span>
      </button>
      {isOpen && (
        <div className="p-6">
          {children}
        </div>
      )}
    </div>
  )
}

export default AudioWorkspace
