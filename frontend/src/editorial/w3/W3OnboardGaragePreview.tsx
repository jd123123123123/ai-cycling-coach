import W3OnboardGarageView from './W3OnboardGarageView'
import { STARTER_BIKE } from './starterBike'

/** TEMP preview — /e/w3-onboard-garage-preview (unguarded). */
export default function W3OnboardGaragePreview() {
  return <W3OnboardGarageView bikeImageUrl={STARTER_BIKE} onStart={() => {}} onSkip={() => {}} />
}
