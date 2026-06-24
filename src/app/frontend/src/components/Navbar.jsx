import React from 'react'
import { useAuth } from '../context/AuthContext'
import { LogOut, Bot } from 'lucide-react'

export default function Navbar() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-600 rounded-lg">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">
            Smart Meeting Assistant
          </span>
        </div>

        {/* User info + Logout */}
        <div className="flex items-center gap-3">
          {user.picture && (
            <img
              src={user.picture}
              alt={user.name}
              className="w-8 h-8 rounded-full ring-2 ring-indigo-100"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="hidden sm:block text-right">
            <p className="text-sm font-semibold text-gray-900 leading-tight">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
