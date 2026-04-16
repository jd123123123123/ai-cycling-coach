import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { setAccessToken, setAuthClearedCallback } from '../api/client'
import * as authApi from '../api/auth'
import type { User, RegisterRequest } from '../types/auth'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearAuth = useCallback(() => {
    setAccessToken(null)
    setUser(null)
  }, [])

  // On mount: register the "auth cleared" callback so the interceptor can
  // notify us when a refresh attempt fails
  useEffect(() => {
    setAuthClearedCallback(clearAuth)
  }, [clearAuth])

  // On mount: attempt to restore session from httpOnly refresh token cookie
  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      try {
        const tokenResponse = await authApi.refreshToken()
        setAccessToken(tokenResponse.access_token)
        const userData = await authApi.getMe()
        if (mounted) {
          setUser(userData)
        }
      } catch {
        // No valid session — user needs to log in
        if (mounted) {
          clearAuth()
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      mounted = false
    }
  }, [clearAuth])

  const login = useCallback(async (email: string, password: string) => {
    const tokenResponse = await authApi.login(email, password)
    setAccessToken(tokenResponse.access_token)
    const userData = await authApi.getMe()
    setUser(userData)
  }, [])

  const register = useCallback(async (data: RegisterRequest) => {
    const tokenResponse = await authApi.register(data)
    setAccessToken(tokenResponse.access_token)
    const userData = await authApi.getMe()
    setUser(userData)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Server-side logout may fail if token already expired — ignore
    } finally {
      clearAuth()
    }
  }, [clearAuth])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
