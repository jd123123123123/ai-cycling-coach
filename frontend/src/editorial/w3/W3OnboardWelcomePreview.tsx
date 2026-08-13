import { W3_ONBOARD_HERO } from './w3OnboardHero'
import W3OnboardWelcomeView from './W3OnboardWelcomeView'

/** TEMP preview — /e/w3-onboard-welcome-preview (unguarded). */
export default function W3OnboardWelcomePreview() {
  return <W3OnboardWelcomeView heroImageUrl={W3_ONBOARD_HERO} onNext={() => {}} onSkip={() => {}} />
}
