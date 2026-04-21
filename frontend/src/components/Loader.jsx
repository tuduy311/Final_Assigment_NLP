import React from 'react'

export const Loader = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin-fast"></div>
      <p className="mt-4 text-gray-600 font-medium">Processing meeting...</p>
    </div>
  )
}

export default Loader
