import { useNavigate } from 'react-router-dom'
import { W3_ONBOARD_HERO } from './w3OnboardHero'
import { markW3OnboardingSeen } from './w3Onboarding'
import W3OnboardWelcomeView from './W3OnboardWelcomeView'

/**
 * W3 · Onboarding 01, wired. Route /e/w3-onboard-welcome. First screen of the
 * first-open flow → devices. Skip finishes onboarding and lands on Today.
 */
export default function W3OnboardWelcomePage() {
  const navigate = useNavigate()
  // ── SKIP CANNOT MEAN "STRAIGHT TO TODAY" ANY MORE ────────────────────
  // The gate is satisfied by a consent and a filled profile, and the screen
  // that writes both is `/e/w3-onboard-numbers`. Skipping to Today from here
  // would land on a guarded route, be bounced straight back to the welcome
  // screen, and bounce forever. So skipping means "not the optional parts" —
  // it jumps past them to the one screen that has to happen.
  const skip = () => {
    markW3OnboardingSeen()
    navigate('/e/w3-onboard-numbers', { replace: true })
  }
  return (
    <W3OnboardWelcomeView
      heroImageUrl={W3_ONBOARD_HERO}
      onNext={() => navigate('/e/w3-onboard-devices')}
      onSkip={skip}
    />
  )
}
