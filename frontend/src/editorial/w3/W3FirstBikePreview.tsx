import W3FirstBikeView from './W3FirstBikeView'
import { STARTER_BIKE } from './starterBike'

/** TEMP preview — /e/w3-first-bike-preview (unguarded). */
export default function W3FirstBikePreview() {
  return <W3FirstBikeView bikeImageUrl={STARTER_BIKE} onContinue={() => {}} />
}
