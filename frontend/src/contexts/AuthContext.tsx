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
  /** Re-fetch the current user from the server (e.g. after a profile save). */
  refreshUser: () => Promise<void>
}

import { queryClient } from '../lib/queryClient'
import {
  clearPersistedQueries, persistedUserId, setPersistUser,
} from '../lib/queryPersist'

const AuthContext = createContext<AuthContextType | null>(null)

/**
 * The persisted cache belongs to exactly one rider.
 *
 * It is hydrated before anyone knows who is signing in — that is the whole
 * point of it, the data has to be on screen before the network answers — so
 * the check happens the moment the session resolves. A shared phone, or a
 * rider with two accounts, must never be shown the other one's numbers.
 */
function adoptOrDiscardCache(userId: number): void {
  const owner = persistedUserId()
  if (owner !== null && owner !== userId) {
    clearPersistedQueries()
    queryClient.clear()
  }
  setPersistUser(userId)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearAuth = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    // Signing out takes the rider's data off the device with it.
    setPersistUser(null)
    clearPersistedQueries()
    queryClient.clear()
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
          adoptOrDiscardCache(userData.id)
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
    adoptOrDiscardCache(userData.id)
    setUser(userData)
  }, [])

  const register = useCallback(async (data: RegisterRequest) => {
    const tokenResponse = await authApi.register(data)
    setAccessToken(tokenResponse.access_token)
    const userData = await authApi.getMe()
    adoptOrDiscardCache(userData.id)
    setUser(userData)
  }, [])

  const refreshUser = useCallback(async () => {
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
        refreshUser,
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
