import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../hooks/useOnboarding'
import AppLoading from './AppLoading'
import type { ReactNode } from 'react'

interface ProtectedRouteProps {
  children: ReactNode
  /** When true, redirects the user to /consent or /profile-setup if onboarding is incomplete */
  checkOnboarding?: boolean
}

export default function ProtectedRoute({ children, checkOnboarding = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()

  // Only run onboarding check when authenticated and checkOnboarding=true
  const onboardingStatus = useOnboarding(isAuthenticated && checkOnboarding)

  if (isLoading) {
    return <AppLoading />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (checkOnboarding) {
    if (onboardingStatus === 'loading') {
      return <AppLoading />
    }
    // Both incomplete-onboarding states route to the unified science-based
    // wizard (which folds consent + Garmin + profile into one flow).
    if (onboardingStatus === 'needs-consent' || onboardingStatus === 'needs-profile') {
      return <Navigate to="/onboarding" replace />
    }
  }

  return <>{children}</>
}
