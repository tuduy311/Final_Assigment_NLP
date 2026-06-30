import React, { useState, useRef, useEffect } from 'react'
import { Mic, Monitor, Square, Play, UploadCloud, Loader2 } from 'lucide-react'

const AudioRecorder = ({ onRecordingComplete, isUploading }) => {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingType, setRecordingType] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [recordedBlob, setRecordedBlob] = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const chunksRef = useRef([])
  
  const canvasRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const animationFrameRef = useRef(null)

  useEffect(() => {
    if (isRecording && analyserRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const canvasCtx = canvas.getContext('2d')
      const analyser = analyserRef.current
      
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      
      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw)
        
        analyser.getByteFrequencyData(dataArray)
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
        
        // Use a subset of frequencies focusing on human voice
        const activeBins = Math.min(50, bufferLength) 
        const barWidth = canvas.width / activeBins
        
        let x = 0
        for (let i = 0; i < activeBins; i++) {
          // Normalize height and add a minimum height of 4px
          const normalized = dataArray[i] / 255
          const barHeight = Math.max(4, normalized * canvas.height * 0.8)
          
          // Center the bars vertically
          const y = (canvas.height - barHeight) / 2
          
          // Draw with safe fillRect (roundRect can crash on older Mac browsers)
          canvasCtx.fillStyle = 'rgb(239, 68, 68)' // Tailwind red-500
          canvasCtx.fillRect(x + 1, y, barWidth - 2, barHeight)
          
          x += barWidth
        }
      }
      
      draw()
      
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
      }
    }
  }, [isRecording])

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const startRecording = async (type) => {
    try {
      let stream;
      if (type === 'mic') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } else if (type === 'screen') {
        // Need to request screen sharing to capture system audio
        stream = await navigator.mediaDevices.getDisplayMedia({ 
          audio: true, 
          video: true // browsers usually require video to be requested for getDisplayMedia, we'll just ignore the video track
        })
      }
      
      streamRef.current = stream
      setRecordingType(type)
      chunksRef.current = []

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      
      const source = audioCtx.createMediaStreamSource(stream)
      
      // Workaround for browser bug: connect to a muted gain node, then to destination 
      // to force the audio graph to process the stream without silencing the MediaRecorder
      const gainNode = audioCtx.createGain()
      gainNode.gain.value = 0
      
      source.connect(analyser)
      analyser.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      
      audioContextRef.current = audioCtx
      analyserRef.current = analyser
      sourceRef.current = source

      // Try to use webm if supported, otherwise let the browser decide
      const options = MediaRecorder.isTypeSupported('audio/webm') 
        ? { mimeType: 'audio/webm' } 
        : {}
        
      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        // Safari records in mp4, Chrome in webm. We must use the actual mime type
        const actualMimeType = mediaRecorder.mimeType || (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4')
        const blob = new Blob(chunksRef.current, { type: actualMimeType })
        setRecordedBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
        }
        clearInterval(timerRef.current)
      }

      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)
      setRecordingTime(0)
      setAudioUrl(null)
      setRecordedBlob(null)

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

    } catch (err) {
      console.error('Error starting recording:', err)
      alert(`Could not start recording: ${err.message}`)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setRecordingType(null)
      
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      analyserRef.current = null
      
      if (sourceRef.current) {
        sourceRef.current.disconnect()
        sourceRef.current = null
      }
    }
  }

  const handleUpload = () => {
    if (recordedBlob) {
      // Determine correct extension based on actual blob type
      const isMp4 = recordedBlob.type.includes('mp4') || recordedBlob.type.includes('m4a')
      const ext = isMp4 ? 'mp4' : 'webm'
      
      // Create a File object from the blob with the exact correct mime type
      const file = new File([recordedBlob], `recording-${Date.now()}.${ext}`, {
        type: recordedBlob.type
      })
      onRecordingComplete(file)
    }
  }

  const handleDiscard = () => {
    setRecordedBlob(null)
    setAudioUrl(null)
    setRecordingTime(0)
  }

  return (
    <div className="w-full">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">Record Audio</h2>
        <p className="text-gray-500 text-sm mt-1">Record from microphone or system audio</p>
      </div>

      {!isRecording && !recordedBlob && (
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button 
            onClick={() => startRecording('mic')}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium border border-blue-200"
          >
            <Mic className="w-5 h-5" />
            Record Microphone
          </button>
          <button 
            onClick={() => startRecording('screen')}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors font-medium border border-indigo-200"
            title="Note: You must choose to share a tab or screen with audio"
          >
            <Monitor className="w-5 h-5" />
            Record System Audio
          </button>
        </div>
      )}

      {isRecording && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="text-3xl font-mono font-light text-red-500 flex items-center gap-3">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
            {formatTime(recordingTime)}
          </div>
          <div className="text-sm text-gray-500 mb-2">
            Recording {recordingType === 'mic' ? 'Microphone' : 'System Audio'}...
          </div>
          
          <div className="w-full max-w-sm h-16 mb-4 flex justify-center items-center">
            <canvas ref={canvasRef} width="300" height="64" className="w-full h-full object-contain" />
          </div>

          <button 
            onClick={stopRecording}
            className="flex items-center gap-2 px-6 py-3 bg-red-100 text-red-700 rounded-full hover:bg-red-200 transition-colors font-medium"
          >
            <Square className="w-5 h-5 fill-current" />
            Stop Recording
          </button>
        </div>
      )}

      {recordedBlob && !isRecording && (
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="w-full max-w-md bg-gray-50 p-4 rounded-xl border border-gray-200">
            <audio controls src={audioUrl} className="w-full" />
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={handleDiscard}
              disabled={isUploading}
              className="px-6 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              Discard
            </button>
            <button 
              onClick={handleUpload}
              disabled={isUploading}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <UploadCloud className="w-5 h-5" />
                  Use this recording
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AudioRecorder
