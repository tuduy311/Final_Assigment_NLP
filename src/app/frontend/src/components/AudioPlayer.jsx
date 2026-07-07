import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Play, Pause, Volume2, VolumeX, Volume1 } from 'lucide-react'

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds) || isNaN(seconds)) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const AudioPlayer = forwardRef(({ src, duration: initialDuration }, ref) => {
  const audioRef = useRef(null)
  const progressRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(initialDuration || 0)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoaded, setIsLoaded] = useState(!!initialDuration)

  // Duration hack helper refs
  const durationHackedRef = useRef(false)
  const hasHackedRef = useRef(false)

  // Hover states for progress bar time tooltip
  const [hoverTime, setHoverTime] = useState(null)
  const [hoverLeft, setHoverLeft] = useState(0)

  // Volume states (0.0 to 2.0 to support up to 200% boost)
  const [volume, setVolume] = useState(1.0)
  const [isMuted, setIsMuted] = useState(false)
  const prevVolumeRef = useRef(1.0)

  // Web Audio API refs for volume boost
  const audioContextRef = useRef(null)
  const gainNodeRef = useRef(null)
  const sourceNodeRef = useRef(null)

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

  const initAudioContext = () => {
    if (audioContextRef.current) return
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaElementSource(audioRef.current)
      const gainNode = ctx.createGain()
      
      gainNode.gain.value = isMuted ? 0 : volume
      source.connect(gainNode)
      gainNode.connect(ctx.destination)
      
      audioContextRef.current = ctx
      gainNodeRef.current = gainNode
      sourceNodeRef.current = source
    } catch (e) {
      console.warn("Failed to initialize Web Audio API for volume boost:", e)
    }
  }

  // Update volume gain node & fallback volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume
    }
    if (audioRef.current) {
      audioRef.current.volume = Math.min(volume, 1.0)
    }
  }, [volume, isMuted])

  useEffect(() => {
    if (initialDuration) {
      setDuration(initialDuration)
      setIsLoaded(true)
    }
  }, [initialDuration])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoaded = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
        setIsLoaded(true)
      } else if (!initialDuration && !hasHackedRef.current) {
        // WebM from MediaRecorder often has Infinity duration.
        // Workaround: seek to a large time to force browser to calculate real duration.
        hasHackedRef.current = true
        durationHackedRef.current = true
        audio.currentTime = 1e10
      }
    }

    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
        setIsLoaded(true)
        // If we seeked to force duration calculation, seek back to start
        if (durationHackedRef.current && (audio.currentTime > audio.duration || audio.currentTime === 1e10 || Math.abs(audio.currentTime - audio.duration) < 1.0)) {
          audio.currentTime = 0
          durationHackedRef.current = false
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
  }, [isDragging, initialDuration])

  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(initialDuration || 0)
    setIsLoaded(!!initialDuration)
    durationHackedRef.current = false
    hasHackedRef.current = false
  }, [src, initialDuration])

  // Cleanup Web Audio Context
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  const togglePlay = () => {
    if (!audioRef.current) return
    initAudioContext()
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
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

  const onProgressMouseMove = useCallback((e) => {
    const bar = progressRef.current
    if (!bar || !duration) return
    const rect = bar.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const pct = (x / rect.width) * 100
    const time = (x / rect.width) * duration
    setHoverTime(time)
    setHoverLeft(pct)
  }, [duration])

  const onProgressMouseLeave = useCallback(() => {
    setHoverTime(null)
  }, [])

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

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (val > 0) {
      setIsMuted(false)
    }
  }

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false)
      setVolume(prevVolumeRef.current)
    } else {
      prevVolumeRef.current = volume
      setIsMuted(true)
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
      <audio ref={audioRef} src={src} preload="metadata" crossOrigin="anonymous" />

      <button
        onClick={togglePlay}
        disabled={!isLoaded}
        className="p-1.5 text-red-600 hover:text-red-700 disabled:text-gray-300 transition-colors flex-shrink-0"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>

      <span className="text-[11px] text-gray-500 font-mono w-16 text-right flex-shrink-0">{formatTime(currentTime)}</span>

      <div
        ref={progressRef}
        className="flex-1 h-1.5 bg-gray-200 rounded-full cursor-pointer relative group"
        onMouseDown={onMouseDown}
        onMouseMove={onProgressMouseMove}
        onMouseLeave={onProgressMouseLeave}
      >
        <div
          className="absolute top-0 left-0 h-full bg-red-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 6px)` }}
        />

        {/* Hover Time Tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute bottom-full mb-2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none opacity-90 transition-opacity font-mono z-10"
            style={{ left: `${hoverLeft}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      <span className="text-[11px] text-gray-500 font-mono w-16 flex-shrink-0 pr-1">{formatTime(duration)}</span>

      {/* Volume Control */}
      <div className="flex items-center gap-2 ml-2 pr-1 border-l border-gray-200 pl-3 flex-shrink-0">
        <button
          onClick={toggleMute}
          className="text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4 text-gray-400" />
          ) : volume > 1.0 ? (
            <Volume2 className="w-4 h-4 text-red-500 font-bold" />
          ) : volume > 0.5 ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <Volume1 className="w-4 h-4" />
          )}
        </button>
        <input
          type="range"
          min="0"
          max="2.0"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none"
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
        <span className={`text-[10px] w-14 text-left font-mono font-medium ${volume > 1.0 ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
          {volume > 1.0 ? `Boost ${Math.round(volume * 100)}%` : `${Math.round(volume * 100)}%`}
        </span>
      </div>
    </div>
  )
})

AudioPlayer.displayName = 'AudioPlayer'
export default AudioPlayer
