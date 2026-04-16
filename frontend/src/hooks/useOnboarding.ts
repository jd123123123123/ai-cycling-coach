import { useState, useEffect } from 'react'
import { getConsents } from '../api/consent'
import { getProfile } from '../api/athletes'

export type OnboardingStatus = 'loading' | 'needs-consent' | 'needs-profile' | 'complete'

/**
 * Determines where a user should be redirected based on their onboarding state.
 *
 * - needs-consent: user has not granted health_data consent
 * - needs-profile: user consented but hasn't set any profile data yet
 * - complete: user can go to dashboard
 */
export function useOnboarding(enabled: boolean) {
  const [status, setStatus] = useState<OnboardingStatus>('loading')

  useEffect(() => {
    if (!enabled) {
      setStatus('complete')
      return
    }

    let mounted = true

    async function checkOnboarding() {
      try {
        const [consents, profile] = await Promise.all([getConsents(), getProfile()])

        if (!mounted) return

        // Check if health_data consent is granted and not withdrawn
        const healthDataConsent = consents.find(
          (c) =>
            c.consent_type === 'health_data' &&
            c.granted === true &&
            c.withdrawn_at === null,
        )

        if (!healthDataConsent) {
          setStatus('needs-consent')
          return
        }

        // Check if the profile has been filled in (any key metric set)
        const profileFilled =
          profile.ftp_watts != null ||
          profile.weight_kg != null ||
          profile.primary_sport != null ||
          profile.weekly_hours_available != null

        if (!profileFilled) {
          setStatus('needs-profile')
          return
        }

        setStatus('complete')
      } catch {
        // On error, don't block the user — let them through
        if (mounted) setStatus('complete')
      }
    }

    checkOnboarding()

    return () => {
      mounted = false
    }
  }, [enabled])

  return status
}
