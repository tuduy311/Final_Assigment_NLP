import React from 'react'
import { useAuth } from '../context/AuthContext'
import { LogOut } from 'lucide-react'

export default function Navbar() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <nav className="bg-white shadow-md">
      <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {user.picture && (
            <img
              src={user.picture}
              alt={user.name}
              className="w-10 h-10 rounded-full"
            />
          )}
          <div>
            <p className="font-semibold text-gray-900">{user.name}</p>
            <p className="text-sm text-gray-600">{user.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </nav>
  )
}
