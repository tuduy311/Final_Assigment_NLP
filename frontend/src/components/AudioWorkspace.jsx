import React, { useState, useMemo, useEffect, useRef } from 'react'
import { generateTranscript, detectSpeakers, generateSummaryText, generateActionItems, getAudioResults, saveSpeakerMap, submitCorrection } from '../services/api'
import { buildEditableTranscriptSegments, buildMergedTranscriptSegments, mergeTranscriptAndDiarization } from '../utils/mergeTranscript'
import { Loader2, FileAudio, Clock, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import ActionItemTable from './ActionItemTable'
import ReactMarkdown from 'react-markdown'
import SpeakerTimeline from './SpeakerTimeline'

const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return '00:00:000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(3, '0');
  if (h > 0) return `${h}:${mStr}:${sStr}:${msStr}`;
  return `${mStr}:${sStr}:${msStr}`;
}

export const AudioWorkspace = ({ workspaceData, onReset }) => {
  const [transcriptResult, setTranscriptResult] = useState(null)
  const [diarizationResult, setDiarizationResult] = useState(null)
  const [mergedTranscriptResult, setMergedTranscriptResult] = useState(null)
  const [summaryResult, setSummaryResult] = useState(null)
  const [isMergedView, setIsMergedView] = useState(false)

  const [isLoading, setIsLoading] = useState({
    transcript: false,
    diarize: false,
    merge: false,
    summary: false
  })

  const [error, setError] = useState(null)

  const [speakerMap, setSpeakerMap] = useState({})
  const speakerMapLoadedRef = useRef(false)

  // Agentic: user real name state
  const [userName, setUserName] = useState('')
  const [agentState, setAgentState] = useState('idle') // 'idle' | 'asking' | 'confirmed'
  const [agentInput, setAgentInput] = useState('')

  // Correction states
  const [isEditing, setIsEditing] = useState(false)
  const [editedSegments, setEditedSegments] = useState([])
  const [isSavingCorrection, setIsSavingCorrection] = useState(false)

  const uniqueSpeakers = useMemo(() => {
    if (!diarizationResult) return [];
    const segments = diarizationResult.segments || diarizationResult || [];
    const speakers = new Set(Array.isArray(segments) ? segments.map(s => s.speaker || s.label || 'Unknown') : []);
    return Array.from(speakers).sort();
  }, [diarizationResult]);

  useEffect(() => {
    const fetchResults = async () => {
      if (!workspaceData?.audio_id) return

      setTranscriptResult(null)
      setDiarizationResult(null)
      setMergedTranscriptResult(null)
      setSummaryResult(null)
      setSpeakerMap({})
      speakerMapLoadedRef.current = false
      setError(null)
      setIsMergedView(false)
      setAgentState('idle')
      setAgentInput('')
      setUserName('')
      setIsEditing(false)
      setEditedSegments([])

      try {
        const results = await getAudioResults(workspaceData.audio_id)
        if (results.transcript) setTranscriptResult(results.transcript)
        if (results.diarization) setDiarizationResult(results.diarization)
        if (results.summary) setSummaryResult(results.summary)
        setSpeakerMap(results.speaker_map || {})
      } catch (err) {
        console.error('Failed to load existing results:', err)
      } finally {
        speakerMapLoadedRef.current = true
      }
    }

    fetchResults()
  }, [workspaceData?.audio_id])

  useEffect(() => {
    if (!workspaceData?.audio_id || !speakerMapLoadedRef.current) return

    const timeoutId = window.setTimeout(() => {
      saveSpeakerMap(workspaceData.audio_id, speakerMap).catch(err => {
        console.error('Failed to save speaker map:', err)
      })
    }, 400)

    return () => window.clearTimeout(timeoutId)
  }, [speakerMap, workspaceData?.audio_id])

  useEffect(() => {
    if (!isMergedView || !transcriptResult || !diarizationResult) return
    const mergedStr = mergeTranscriptAndDiarization(transcriptResult, diarizationResult, speakerMap)
    setMergedTranscriptResult(mergedStr)
  }, [isMergedView, transcriptResult, diarizationResult, speakerMap])

  const handleAction = async (actionType) => {
    setError(null)
    setIsLoading(prev => ({ ...prev, [actionType]: true }))

    try {
      const audioId = workspaceData.audio_id

      switch (actionType) {
        case 'transcript':
          const tRes = await generateTranscript(audioId)
          setTranscriptResult(tRes)
          setIsMergedView(false)
          break;
        case 'diarize':
          const dRes = await detectSpeakers(audioId)
          setDiarizationResult(dRes)
          setIsMergedView(false)
          break;
        case 'merge':
          if (isMergedView) {
            setIsMergedView(false)
          } else {
            const mergedStr = mergeTranscriptAndDiarization(transcriptResult, diarizationResult, speakerMap)
            setMergedTranscriptResult(mergedStr)
            setIsMergedView(true)
          }
          break;
        case 'summary':
          let textToSummarize = '';
          if (isMergedView) {
            textToSummarize = mergedTranscriptResult || mergeTranscriptAndDiarization(transcriptResult, diarizationResult, speakerMap);
          } else if (transcriptResult?.segments) {
            textToSummarize = transcriptResult.segments.map(seg => `[${formatDuration(seg.start)} - ${formatDuration(seg.end)}] ${seg.text}`).join('\n');
          } else {
            textToSummarize = transcriptResult?.text || '';
          }
          
          setSummaryResult({ summary: '', action_items: [] })
          setIsLoading(prev => ({ ...prev, summaryText: true, summaryTasks: true, summary: true }))

          const summaryTextPromise = generateSummaryText(textToSummarize, audioId, userName || null)
            .then(res => {
               setSummaryResult(prev => ({ ...prev, summary: res.summary, summary_latency_ms: res.summary_latency_ms }))
            })
            .catch(err => {
               console.error(err)
               setError("Error generating summary text: " + (err.response?.data?.detail || err.message))
            })
            .finally(() => {
               setIsLoading(prev => ({ ...prev, summaryText: false }))
            });

          const summaryTasksPromise = generateActionItems(textToSummarize, audioId, userName || null)
            .then(res => {
               setSummaryResult(prev => ({ ...prev, action_items: res.action_items, tasks_latency_ms: res.tasks_latency_ms }))
            })
            .catch(err => {
               console.error(err)
               setError("Error generating action items: " + (err.response?.data?.detail || err.message))
            })
            .finally(() => {
               setIsLoading(prev => ({ ...prev, summaryTasks: false }))
            });

          await Promise.allSettled([summaryTextPromise, summaryTasksPromise])
          break;
      }
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.detail || err.message || `Error during ${actionType}`)
    } finally {
      setIsLoading(prev => ({ ...prev, [actionType]: false }))
    }
  }

  const handleEditStart = () => {
    if (!transcriptResult || !transcriptResult.segments) return;
    setIsEditing(true);
    setEditedSegments(transcriptResult.segments.map(s => s.text.trim()));
  }

  const handleEditSave = async () => {
    setIsSavingCorrection(true);
    try {
       const originalText = transcriptResult.segments.map(s => s.text.trim()).join(" ");
       const correctedText = editedSegments.join(" ");

       const newSegments = [...transcriptResult.segments];
       newSegments.forEach((seg, idx) => {
           seg.text = " " + editedSegments[idx];
       });

       const updatedTranscript = { ...transcriptResult, segments: newSegments, text: correctedText };
       setTranscriptResult(updatedTranscript);

       if (diarizationResult) {
           const mergedStr = mergeTranscriptAndDiarization(updatedTranscript, diarizationResult, speakerMap);
           setMergedTranscriptResult(mergedStr);
       }

       await submitCorrection(workspaceData.audio_id, originalText, correctedText);
       setIsEditing(false);
    } catch (err) {
       console.error(err);
       setError("Failed to save correction");
    } finally {
       setIsSavingCorrection(false);
    }
  }

  const handleEditCancel = () => {
    setIsEditing(false);
  }

  // Conditions to enable buttons
  const canMerge = transcriptResult && diarizationResult
  const canSummarize = transcriptResult
  const showSpeakerColumn = Boolean(diarizationResult && isMergedView)

  const editableTranscriptSegments = useMemo(() => {
    if (!transcriptResult?.segments) return []
    return buildEditableTranscriptSegments(transcriptResult, diarizationResult, speakerMap)
  }, [diarizationResult, speakerMap, transcriptResult])

  const mergedDisplayLines = useMemo(() => {
    if (!isMergedView || !transcriptResult || !diarizationResult) return []
    return buildMergedTranscriptSegments(transcriptResult, diarizationResult, speakerMap)
  }, [isMergedView, transcriptResult, diarizationResult, speakerMap])

  // --- Agentic handlers ---
  const handleSpeakerMapChange = (speaker, value) => {
    setSpeakerMap(prev => {
      const next = { ...prev, [speaker]: value }
      if (value === 'Me' && agentState === 'idle') {
        setAgentState('asking')
      }
      return next
    })
  }

  const handleAgentNameSelect = (name) => {
    setUserName(name)
    setAgentState('confirmed')
    setAgentInput('')
  }

  const handleAgentCustomSubmit = () => {
    const trimmed = agentInput.trim()
    if (trimmed) {
      setUserName(trimmed)
      setAgentState('confirmed')
      setAgentInput('')
    }
  }

  const handleAgentSkip = () => {
    setAgentState('confirmed')
  }

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
          title={isMergedView ? 'Unmerge' : 'Merge'}
          onClick={() => handleAction('merge')}
          isLoading={isLoading.merge}
          isDone={isMergedView}
          activeStyle={isMergedView}
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
                    onChange={(e) => handleSpeakerMapChange(speaker, e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <button
                      onClick={() => handleSpeakerMapChange(speaker, 'Me')}
                      className="px-2 py-1 text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full border border-blue-200 transition-colors shadow-sm"
                    >
                      Me
                    </button>
                    {(transcriptResult?.suggested_names || []).map(name => (
                      <button
                        key={name}
                        onClick={() => handleSpeakerMapChange(speaker, name)}
                        className="px-2 py-1 text-[11px] font-medium bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-full border border-gray-200 transition-colors shadow-sm"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Agentic Agent UI */}
            {agentState === 'asking' && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col gap-3">
                <p className="text-sm font-medium text-blue-800">
                  🤖 Agent: To extract your tasks more accurately, what is your name in this meeting?
                </p>
                <div className="flex flex-wrap gap-2">
                  {(transcriptResult?.suggested_names || []).map(name => (
                    <button
                      key={name}
                      onClick={() => handleAgentNameSelect(name)}
                      className="px-3 py-1.5 text-sm font-medium bg-white text-blue-700 hover:bg-blue-100 rounded-full border border-blue-300 transition-colors shadow-sm"
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAgentCustomSubmit()}
                    placeholder="Or type your name..."
                    className="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAgentCustomSubmit}
                    className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={handleAgentSkip}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
            {agentState === 'confirmed' && userName && (
              <div className="mt-3 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                ✅ Agent: Got it! I will map all tasks assigned to <strong>{userName}</strong> as <strong>Me</strong>.
              </div>
            )}

            <SpeakerTimeline segments={diarizationResult.segments || diarizationResult} duration={workspaceData?.metadata?.duration} speakerMap={speakerMap} />
          </ResultSection>
        )}

        {summaryResult && (
          <ResultSection title="Summary & Action Items" defaultOpen={true}>
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-semibold mb-2">Summary</h4>
                <div className="markdown-body">
                  <ReactMarkdown>{summaryResult.summary}</ReactMarkdown>
                </div>
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
            <div className="flex justify-end mb-4">
               {!isEditing ? (
                 <button onClick={handleEditStart} className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-200 shadow-sm">
                   Edit Transcript
                 </button>
               ) : (
                 <div className="flex gap-2">
                   <button onClick={handleEditCancel} className="px-4 py-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-200 shadow-sm">
                     Cancel
                   </button>
                   <button onClick={handleEditSave} disabled={isSavingCorrection} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                     {isSavingCorrection && <Loader2 className="w-4 h-4 animate-spin" />}
                     Save Corrections
                   </button>
                 </div>
               )}
            </div>

            {isEditing ? (
               <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                 {editableTranscriptSegments.map((seg, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 md:grid-cols-[max-content_max-content_minmax(0,1fr)] gap-2 md:gap-3 rounded-lg border border-blue-100 bg-blue-50/30 px-4 py-3"
                    >
                       <div className="font-semibold text-gray-400 whitespace-nowrap font-mono text-xs md:mt-2">
                         [{formatDuration(seg.start)} - {formatDuration(seg.end)}]
                       </div>
                       <div className="flex flex-wrap items-center gap-2 self-start md:mt-1">
                         {showSpeakerColumn && seg.speaker && (
                           <span className="max-w-[180px] truncate rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                             {seg.speaker}
                           </span>
                         )}
                         {showSpeakerColumn && seg.mixed && (
                           <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                             Mixed
                           </span>
                         )}
                         {showSpeakerColumn && !seg.mixed && seg.lowOverlap && (
                           <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200">
                             Low overlap
                           </span>
                         )}
                       </div>
                       <textarea
                         value={editedSegments[idx]}
                         onChange={(e) => {
                            const newArr = [...editedSegments];
                            newArr[idx] = e.target.value;
                            setEditedSegments(newArr);
                         }}
                         className="min-w-0 w-full px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[44px] text-gray-800 text-sm shadow-sm bg-white"
                         rows={2}
                       />
                    </div>
                 ))}
               </div>
            ) : diarizationResult && isMergedView ? (
              <div className="text-gray-700 space-y-3">
                {mergedDisplayLines.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-[max-content_max-content_minmax(0,1fr)] gap-2 md:gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-4 py-3"
                  >
                    <div className="font-semibold text-gray-400 whitespace-nowrap font-mono text-xs md:mt-1">
                      {item.start !== null && item.end !== null
                        ? `[${formatDuration(item.start)} - ${formatDuration(item.end)}]`
                        : ''}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 self-start">
                      {item.speaker && (
                        <span className="max-w-[180px] truncate rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                          {item.speaker}
                        </span>
                      )}
                      {item.mixed && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                          Mixed
                        </span>
                      )}
                      {!item.mixed && item.lowOverlap && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200">
                          Low overlap
                        </span>
                      )}
                    </div>
                    <p className="min-w-0 leading-relaxed text-gray-800 break-words">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-700 space-y-3">
                {transcriptResult.segments && transcriptResult.segments.length > 0
                  ? transcriptResult.segments.map((seg, idx) => (
                      <div key={idx} className="flex gap-3">
                        <span className="font-semibold text-gray-400 whitespace-nowrap font-mono text-xs mt-1 w-[145px]">
                          [{formatDuration(seg.start)} - {formatDuration(seg.end)}]:
                        </span>
                        <span className="leading-relaxed"> {seg.text.trim()}</span>
                      </div>
                    ))
                  : <p className="whitespace-pre-wrap leading-relaxed">{transcriptResult.text}</p>
                }
              </div>
            )}
          </ResultSection>
        )}
      </div>
    </div>
  )
}

const ActionButton = ({ title, onClick, isLoading, isDone, disabled, activeStyle = false }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative p-4 rounded-xl border-2 text-left transition-all ${
        disabled && !isDone
          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
          : activeStyle
          ? 'border-amber-500 bg-amber-50 text-amber-800 shadow-sm hover:border-amber-600 hover:bg-amber-100 hover:shadow-md cursor-pointer'
          : isDone
          ? 'border-green-600 bg-green-100 text-green-800 shadow-sm hover:border-green-700 hover:bg-green-200 hover:shadow-md cursor-pointer'
          : 'border-blue-200 bg-white hover:border-blue-500 hover:shadow-md text-gray-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        {isLoading && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
        {activeStyle && !isLoading && <RotateCcw className="w-5 h-5 text-amber-600" />}
        {isDone && !isLoading && !activeStyle && <CheckCircle2 className="w-5 h-5 text-green-500" />}
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
