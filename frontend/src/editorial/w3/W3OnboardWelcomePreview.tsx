import { SHOWCASE_RIDER } from './showcaseRider'
import W3OnboardWelcomeView from './W3OnboardWelcomeView'

/** TEMP preview — /e/w3-onboard-welcome-preview (unguarded). */
export default function W3OnboardWelcomePreview() {
  return <W3OnboardWelcomeView heroImageUrl={SHOWCASE_RIDER} onNext={() => {}} onSkip={() => {}} />
}
