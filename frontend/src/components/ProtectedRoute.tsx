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
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full animate-spin"
          style={{
            border: '3px solid var(--color-rule)',
            borderTopColor: 'var(--color-forest-2)',
          }}
        />
        <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
          Loading...
        </p>
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
    // Both incomplete-onboarding states route to the unified science-based
    // wizard (which folds consent + Garmin + profile into one flow).
    if (onboardingStatus === 'needs-consent' || onboardingStatus === 'needs-profile') {
      return <Navigate to="/onboarding" replace />
    }
  }

  return <>{children}</>
}
