import React from 'react'
import { AlertCircle, X } from 'lucide-react'

export const ErrorMessage = ({ message, onClose }) => {
  if (!message) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="font-semibold text-red-800">Error</h3>
        <p className="text-red-700 text-sm mt-1">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-red-600 hover:text-red-800 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

export default ErrorMessage
