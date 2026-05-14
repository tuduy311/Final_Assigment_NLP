import React, { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('authToken'))
  const [isLoading, setIsLoading] = useState(false)

  const login = useCallback((credentialResponse) => {
    try {
     const token = credentialResponse.credential
    
    // Properly decode base64 with UTF-8 support
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    const decoded = JSON.parse(jsonPayload)
      
      setUser({
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
       // picture: decoded.picture,
      })
      setToken(token)
      localStorage.setItem('authToken', token)
      localStorage.setItem('user', JSON.stringify({
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        //picture: decoded.picture,
      }))
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
  }, [])

  const isAuthenticated = !!user && !!token

  const value = {
    user,
    token,
    isLoading,
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
