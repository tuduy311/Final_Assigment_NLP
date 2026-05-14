import React from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { LogIn } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()

  const handleLoginSuccess = (credentialResponse) => {
    try {
      login(credentialResponse)
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const handleLoginError = () => {
    console.log('Login Failed')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <LogIn className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Meeting Minutes Extractor
            </h1>
            <p className="text-gray-600">
              Please sign in with Google to continue
            </p>
          </div>

          {/* Google Login Button */}
          <div className="flex justify-center mb-6">
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={handleLoginError}
              theme="outline"
              size="large"
              text="signin_with"
            />
          </div>

          {/* Features */}
          <div className="border-t pt-6 mt-6">
            <p className="text-sm text-gray-600 text-center mb-4">
              Features available after login:
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-indigo-600 rounded-full mr-3"></span>
                Extract action items from meetings
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-indigo-600 rounded-full mr-3"></span>
                Generate meeting summaries
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-indigo-600 rounded-full mr-3"></span>
                Track decisions and action items
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
