import { useQuery } from '@tanstack/react-query'
import { getConsents } from '../api/consent'
import { getProfile } from '../api/athletes'

export type OnboardingStatus = 'loading' | 'needs-consent' | 'needs-profile' | 'complete'

/** Shared cache key — invalidate this after a flow that completes onboarding. */
export const ONBOARDING_STATUS_KEY = ['onboarding', 'status'] as const

/**
 * Determines where a user should be redirected based on their onboarding state.
 *
 * - needs-consent: user has not granted health_data consent
 * - needs-profile: user consented but hasn't set any profile data yet
 * - complete: user can go to dashboard
 *
 * ── Why this is a react-query hook and not useState + useEffect ────────────
 * `ProtectedRoute` renders a full-screen spinner while this reads 'loading',
 * and every routed page is its own <ProtectedRoute> element — so a route change
 * unmounts one and mounts another. As a local `useState('loading')` + effect,
 * that meant EVERY navigation reset to 'loading' and fired two uncached
 * requests (`/consents` + `/athletes/me`) before the next screen could paint.
 * That spinner, not the lazy-chunk splash, was the bulk of the interstitial.
 *
 * Cached, the answer is already in memory on the second and every later
 * navigation, so the status is known during the first render pass and the
 * spinner never appears again. A stale entry still revalidates in the
 * background — it just no longer blocks the paint.
 */
export function useOnboarding(enabled: boolean): OnboardingStatus {
  const { data } = useQuery<Exclude<OnboardingStatus, 'loading'>>({
    queryKey: ONBOARDING_STATUS_KEY,
    enabled,
    // The status only changes when the athlete finishes a setup flow, and those
    // flows invalidate this key explicitly. Five minutes keeps it self-healing
    // without re-asking on every screen.
    staleTime: 5 * 60_000,
    // Never evict within a session: an evicted entry would make the next
    // navigation flash the spinner again.
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      try {
        const [consents, profile] = await Promise.all([getConsents(), getProfile()])

        // Check if health_data consent is granted and not withdrawn
        const healthDataConsent = consents.find(
          (c) =>
            c.consent_type === 'health_data' &&
            c.granted === true &&
            c.withdrawn_at === null,
        )
        if (!healthDataConsent) return 'needs-consent'

        // Check if the profile has been filled in (any key metric set)
        const profileFilled =
          profile.ftp_watts != null ||
          profile.weight_kg != null ||
          profile.primary_sport != null ||
          profile.weekly_hours_available != null
        if (!profileFilled) return 'needs-profile'

        return 'complete'
      } catch {
        // On error, don't block the user — let them through
        return 'complete'
      }
    },
  })

  if (!enabled) return 'complete'
  return data ?? 'loading'
}
