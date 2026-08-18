import { useState } from 'react'
import W3FirstBikeView from './W3FirstBikeView'
import { SHOP_BIKES } from './w3shop'
import { T } from './w3tokens'

/**
 * PREVIEW — /e/w3-first-bike-preview (unguarded).
 *
 * The three states that matter are the ones a rider can actually be in: the
 * offer, the moment after the server granted it (the stamp), and a refusal.
 * It no longer previews `STARTER_BIKE` — that base64 stock photo was the stand-in
 * the ladder replaced, and previewing it would keep alive the exact thing this
 * screen exists to end.
 */
const OPTIONS = SHOP_BIKES.filter((b) => b.price === 0)

export default function W3FirstBikePreview() {
  const [state, setState] = useState<'offer' | 'claiming' | 'claimed' | 'error'>('offer')
  const chip = (on: boolean) => ({
    fontSize: 9, padding: '3px 7px', borderRadius: 5, border: 0,
    background: on ? T.acid : T.surface2, color: on ? T.bg : T.mid, cursor: 'pointer',
  })
  return (
    <div>
      <div style={{ position: 'fixed', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', gap: 4, background: '#0008', padding: 4, borderRadius: 8 }}>
        {(['offer', 'claiming', 'claimed', 'error'] as const).map((s) => (
          <button key={s} onClick={() => setState(s)} style={chip(state === s)}>{s}</button>
        ))}
      </div>
      <W3FirstBikeView
        options={OPTIONS}
        claiming={state === 'claiming'}
        claimed={state === 'claimed'}
        error={state === 'error' ? 'Du hast schon ein Rad — es steht in deiner Garage.' : null}
        onClaim={() => setState('claimed')}
        onEnter={() => {}}
      />
    </div>
  )
}
