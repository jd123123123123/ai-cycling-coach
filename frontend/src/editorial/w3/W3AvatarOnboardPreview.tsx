import W3AvatarOnboardView from './W3AvatarOnboardView'
import { SHOWCASE_RIDER } from './showcaseRider'

/** TEMP preview — /e/w3-avatar-onboard-preview (unguarded). Shows an example
 *  cute collectible rider in the showcase box so the payoff is visible. */
export default function W3AvatarOnboardPreview() {
  return <W3AvatarOnboardView heroImageUrl={SHOWCASE_RIDER} onPick={() => {}} onSkip={() => {}} />
}
