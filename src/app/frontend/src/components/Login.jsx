import React from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { LogIn, Calendar, FileText, CheckSquare, AlertCircle } from 'lucide-react'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

// ── Inner component: chỉ render khi đã có CLIENT_ID ──────────────────────────
function GoogleLoginButton() {
  const { login } = useAuth()

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        await login(tokenResponse)
      } catch (error) {
        console.error('Login failed:', error)
      }
    },
    onError: () => {
      console.log('Login Failed')
    },
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' '),
  })

  return (
    <button
      id="google-login-btn"
      onClick={() => googleLogin()}
      className="flex items-center gap-3 px-6 py-3 border border-gray-300 rounded-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all duration-200 font-medium text-gray-700 bg-white"
    >
      <svg width="20" height="20" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        <path fill="none" d="M0 0h48v48H0z"/>
      </svg>
      Sign in with Google
    </button>
  )
}

// ── Main Login page ───────────────────────────────────────────────────────────
export default function Login() {
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
              Smart Meeting Assistant
            </h1>
            <p className="text-gray-600">
              Sign in with Google to get started
            </p>
          </div>

          {/* Google Login Button hoặc thông báo lỗi */}
          <div className="flex justify-center mb-6">
            {!CLIENT_ID ? (
              <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Thiếu cấu hình Google OAuth</p>
                  <p>Tạo file <code className="font-mono bg-red-100 px-1 rounded">.env</code> với nội dung:</p>
                  <pre className="mt-1 bg-red-100 rounded p-2 text-xs">VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com</pre>
                </div>
              </div>
            ) : (
              <GoogleLoginButton />
            )}
          </div>

          {/* Calendar permission notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-xs text-blue-700 text-center">
              🗓️ Ứng dụng sẽ xin quyền <strong>Google Calendar</strong> để tự động tạo sự kiện từ action items của cuộc họp.
            </p>
          </div>

          {/* Features */}
          <div className="border-t pt-6 mt-2">
            <p className="text-sm text-gray-600 text-center mb-4">
              Features available after login:
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                Extract action items from meetings
              </li>
              <li className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                Generate meeting summaries
              </li>
              <li className="flex items-center gap-3">
                <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                Track decisions and action items
              </li>
              <li className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                Auto-create Google Calendar events
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
