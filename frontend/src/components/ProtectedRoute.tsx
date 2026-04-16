import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../hooks/useOnboarding'
import type { ReactNode } from 'react'

interface ProtectedRouteProps {
  children: ReactNode
  /** When true, redirects the user to /consent or /profile-setup if onboarding is incomplete */
  checkOnboarding?: boolean
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

export default function ProtectedRoute({ children, checkOnboarding = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()

  // Only run onboarding check when authenticated and checkOnboarding=true
  const onboardingStatus = useOnboarding(isAuthenticated && checkOnboarding)

  if (isLoading) {
    return <Spinner />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (checkOnboarding) {
    if (onboardingStatus === 'loading') {
      return <Spinner />
    }
    if (onboardingStatus === 'needs-consent') {
      return <Navigate to="/consent" replace />
    }
    if (onboardingStatus === 'needs-profile') {
      return <Navigate to="/profile-setup" replace />
    }
  }

  return <>{children}</>
}
