import React from 'react'

export const Loader = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin-fast"></div>
      <p className="mt-4 text-gray-600 font-medium">
        {message || 'Đang xử lý cuộc họp...'}
      </p>
      <p className="mt-2 text-sm text-gray-400">Quá trình có thể mất vài phút, vui lòng chờ</p>
    </div>
  )
}

export default Loader
