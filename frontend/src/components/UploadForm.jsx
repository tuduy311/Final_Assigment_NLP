import React, { useState, useRef } from 'react'
import { Upload, FileAudio } from 'lucide-react'

export const UploadForm = ({ onSubmit, isLoading }) => {
  const [file, setFile] = useState(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      const droppedFile = files[0]
      if (isAudioFile(droppedFile)) {
        setFile(droppedFile)
      }
    }
  }

  const isAudioFile = (file) => {
    const audioTypes = [
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp3',
      'audio/m4a',
      'audio/flac',
      'audio/webm',
      'audio/x-m4a'
    ]
    return audioTypes.includes(file.type) || /\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(file.name)
  }

  const handleFileInput = (e) => {
    const files = e.target.files
    if (files && files[0]) {
      setFile(files[0])
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (file && !isLoading) {
      onSubmit(file)
    }
  }

  const handleClear = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      {/* Drag & Drop Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileInput}
          disabled={isLoading}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />

        <div className="flex flex-col items-center gap-3">
          {file ? (
            <>
              <FileAudio className="w-12 h-12 text-green-600" />
              <div>
                <p className="text-lg font-semibold text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400" />
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  Drop your audio file here
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  or click to browse (MP3, WAV, OGG, M4A)
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 mt-6 justify-center">
        {file && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isLoading}
            className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Clear
          </button>
        )}
        <button
          type="submit"
          disabled={!file || isLoading}
          className="px-8 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin-fast"></div>
              Processing...
            </>
          ) : (
            'Process Meeting'
          )}
        </button>
      </div>
    </form>
  )
}

export default UploadForm
