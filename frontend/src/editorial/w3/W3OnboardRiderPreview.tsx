import { useState } from 'react'
import W3OnboardRiderView, { type RiderSlot, type RiderPhase } from './W3OnboardRiderView'

/** TEMP preview — /e/w3-onboard-rider-preview (unguarded, no backend). Cycles
 *  the local state so the flow is inspectable without generating. */
export default function W3OnboardRiderPreview() {
  const [thumbs, setThumbs] = useState<Record<RiderSlot, string | null>>({ self: null, bike: null, helmet: null })
  const [phase, setPhase] = useState<RiderPhase>('pick')
  return (
    <W3OnboardRiderView
      thumbs={thumbs}
      phase={phase}
      resultImage={null}
      onPick={(s) => setThumbs((t) => ({ ...t, [s]: t[s] ? null : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E' }))}
      onCreate={() => { setPhase('generating'); setTimeout(() => setPhase('unavailable'), 1200) }}
      onAccept={() => {}}
      onRetry={() => setPhase('pick')}
      onSkip={() => {}}
    />
  )
}
