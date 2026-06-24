import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Play, Pause } from 'lucide-react'

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds) || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const AudioPlayer = forwardRef(({ src }, ref) => {
  const audioRef = useRef(null)
  const progressRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  useImperativeHandle(ref, () => ({
    seekTo: (time) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time
        setCurrentTime(time)
      }
    },
    play: () => {
      if (audioRef.current) {
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }))

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoaded = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
        setIsLoaded(true)
      } else {
        // WebM from MediaRecorder often has Infinity duration.
        // Workaround: seek to a large time to force browser to calculate real duration.
        audio.currentTime = 1e10
      }
    }

    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
        setIsLoaded(true)
        // If we seeked to force duration calculation, seek back to start
        if (audio.currentTime > audio.duration || audio.currentTime === 1e10) {
          audio.currentTime = 0
        }
      }
    }

    const onTime = () => { if (!isDragging) setCurrentTime(audio.currentTime) }
    const onEnd = () => setIsPlaying(false)

    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [isDragging])

  useEffect(() => {
    setIsPlaying(false); setCurrentTime(0); setDuration(0); setIsLoaded(false)
  }, [src])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) audioRef.current.pause()
    else audioRef.current.play()
    setIsPlaying(!isPlaying)
  }

  const calcTime = useCallback((e) => {
    const bar = progressRef.current
    if (!bar || !duration) return 0
    const rect = bar.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    return (x / rect.width) * duration
  }, [duration])

  const onMouseDown = useCallback((e) => {
    setIsDragging(true)
    setCurrentTime(calcTime(e))
  }, [calcTime])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e) => setCurrentTime(calcTime(e))
    const onUp = (e) => {
      if (audioRef.current) audioRef.current.currentTime = calcTime(e)
      setIsDragging(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, calcTime])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={togglePlay}
        disabled={!isLoaded}
        className="p-1.5 text-red-600 hover:text-red-700 disabled:text-gray-300 transition-colors flex-shrink-0"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>

      <span className="text-[11px] text-gray-500 font-mono w-10 text-right flex-shrink-0">{formatTime(currentTime)}</span>

      <div
        ref={progressRef}
        className="flex-1 h-1.5 bg-gray-200 rounded-full cursor-pointer relative group"
        onMouseDown={onMouseDown}
      >
        <div
          className="absolute top-0 left-0 h-full bg-red-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
      </div>

      <span className="text-[11px] text-gray-500 font-mono w-10 flex-shrink-0">{formatTime(duration)}</span>
    </div>
  )
})

AudioPlayer.displayName = 'AudioPlayer'
export default AudioPlayer
