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
    // ── ONE JOURNEY, AND IT IS THE W3 ONE ─────────────────────────────
    // This sent every incomplete rider to `/onboarding`, the v4 wizard — so a
    // rider who had just signed up on the W3 register screen was dropped into
    // the OLD design, walked through three screens in another visual language,
    // and finished on the v4 dashboard. They never saw the app they signed up
    // for.
    //
    // The W3 chain answers the same two questions the gate asks about (a
    // health-data consent and a filled profile): `W3OnboardNumbersPage` writes
    // both. So the gate points at the W3 welcome, and the v4 wizard is no
    // longer reachable by anybody who did not type its URL.
    if (onboardingStatus === 'needs-consent' || onboardingStatus === 'needs-profile') {
      return <Navigate to="/e/w3-onboard-welcome" replace />
    }
  }

  return <>{children}</>
}
