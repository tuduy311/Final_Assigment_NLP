import React, { useState } from 'react'
import { Search, Home, Info, Mic, Settings, LogOut, Trash2, Activity } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const Sidebar = ({ history, onSelectWorkspace, onHomeClick, onDashboardClick, onDeleteWorkspace, currentWorkspaceId, isLoadingHistory, isDashboardView }) => {
  const { user, logout } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')

  const formatDuration = (seconds) => {
    if (!seconds) return '0 mins'
    const m = Math.round(seconds / 60)
    return `${m} mins`
  }

  const formatDateTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp * 1000)
    const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) // DD/MM/YY
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return { dateStr, timeStr }
  }

  const filteredHistory = history.filter(item =>
    (item.filename || 'Unknown Audio').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full bg-white text-gray-800">
      {/* Top Header with fake window controls */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400"></div>
          <div className="w-3 h-3 rounded-full bg-amber-400"></div>
          <div className="w-3 h-3 rounded-full bg-green-400"></div>
          <span className="ml-2 font-semibold text-gray-700">Smart Assistant</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="px-4 pb-3 border-b border-gray-100 space-y-1">
        <button
          onClick={onHomeClick}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${!currentWorkspaceId && !isDashboardView ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
        >
          <Home className="w-4 h-4" />
          Home
        </button>
        <button
          onClick={onDashboardClick}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isDashboardView ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
            }`}
        >
          <Activity className="w-4 h-4" />
          System Dashboard
        </button>
      </div>

      {/* All Notes Header */}
      <div className="px-4 py-4 flex items-center gap-2">
        <h3 className="text-sm font-bold text-gray-800">All Notes</h3>
        <Info className="w-3.5 h-3.5 text-gray-400" />
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto px-2">
        {isLoadingHistory ? (
          <div className="text-center py-4 text-gray-400 text-sm">Loading...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">No meetings found</div>
        ) : (
          <ul className="space-y-1">
            {filteredHistory.map((item) => {
              const { dateStr, timeStr } = formatDateTime(item.created_at)
              const isSelected = currentWorkspaceId === item.audio_id

              return (
                <li key={item.audio_id} className="relative group">
                  <button
                    onClick={() => onSelectWorkspace(item)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                  >
                    <div className={`text-sm font-semibold truncate mb-1 pr-6 ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                      {item.filename || 'Unknown Audio'}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span>{timeStr}</span>
                      <span className="text-gray-400 ml-auto">{formatDuration(item.duration)}</span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteWorkspace(item.audio_id)
                    }}
                    className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete meeting"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="p-4 mt-auto border-t border-gray-100 space-y-2">
        <button
          onClick={onHomeClick}
          className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors shadow-sm"
        >
          <Mic className="w-4 h-4" />
          Start Recording
        </button>

        {user && (
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 truncate">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">{user.name?.[0]}</div>
              )}
              <span className="text-xs font-medium text-gray-600 truncate">{user.name}</span>
            </div>
            <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Sidebar
