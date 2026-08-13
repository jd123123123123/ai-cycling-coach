import { useState } from 'react'
import W3BikeStudioView, { type StudioState } from './W3BikeStudioView'
import { STARTER_BIKE } from './starterBike'

/** TEMP preview — drives the studio states with a fixture, no backend.
 *  /e/w3-bike-studio-preview is unguarded; remove before merge. Cycles
 *  intro → analyzing → rendering → reveal so the whole flow is visible. */

const DESCRIPTION =
  'A road bike with a matte teal frame and lime accents, deep-section carbon wheels, ' +
  'Shimano 105 groupset and drop bars — a clean build with lime bar tape and a single bottle cage.'

export default function W3BikeStudioPreview() {
  const [state, setState] = useState<StudioState>('reveal')
  return (
    <div>
      {/* dev state switcher */}
      <div style={{ position: 'fixed', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', gap: 4, background: '#0008', padding: 4, borderRadius: 8 }}>
        {(['intro', 'analyzing', 'rendering', 'reveal', 'error'] as StudioState[]).map((s) => (
          <button key={s} onClick={() => setState(s)} style={{ fontSize: 9, padding: '3px 6px', borderRadius: 5, border: 0, background: state === s ? '#C8FF00' : '#222', color: state === s ? '#000' : '#aaa', cursor: 'pointer' }}>{s}</button>
        ))}
      </div>
      <W3BikeStudioView
        state={state}
        photoUrl={null}
        description={state === 'intro' ? null : DESCRIPTION}
        imageUrl={state === 'reveal' ? STARTER_BIKE : null}   // fixture render → shows the BIKE UNLOCKED celebration
        renderStatus={state === 'reveal' ? 'ok' : null}
        prompt="A single road bicycle, matte teal frame, lime accents, deep-section carbon wheels, drop bars…"
        error={state === 'error' ? 'Couldn’t find a bike in that photo. Try the whole bike, side-on.' : null}
        onBack={() => setState('intro')}
        onPick={() => setState('analyzing')}
        onReset={() => setState('intro')}
        onSave={() => { /* preview: no real image to download */ }}
      />
    </div>
  )
}
