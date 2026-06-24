import React, { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [accessToken, setAccessToken] = useState(localStorage.getItem('googleAccessToken'))
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user')
    try {
      return savedUser ? JSON.parse(savedUser) : null
    } catch (e) {
      return null
    }
  })

  /**
   * Được gọi sau khi useGoogleLogin thành công.
   * tokenResponse chứa: access_token, scope, expires_in, ...
   * Cần decode id_token riêng nếu muốn lấy thông tin user.
   */
  const login = useCallback(async (tokenResponse) => {
    try {
      const token = tokenResponse.access_token

      // Lấy thông tin user từ Google UserInfo API bằng access_token
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) throw new Error('Không lấy được thông tin người dùng từ Google')

      const profile = await res.json()

      const userData = {
        id: profile.sub,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      }

      setUser(userData)
      setAccessToken(token)
      localStorage.setItem('googleAccessToken', token)
      localStorage.setItem('user', JSON.stringify(userData))
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setAccessToken(null)
    localStorage.removeItem('googleAccessToken')
    localStorage.removeItem('user')
  }, [])

  const isAuthenticated = !!user && !!accessToken

  const value = {
    user,
    accessToken,
    isAuthenticated,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
