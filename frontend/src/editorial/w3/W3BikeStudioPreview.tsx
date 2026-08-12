import { useState } from 'react'
import W3BikeStudioView, { type BikeAnalysis, type StudioState } from './W3BikeStudioView'

/** TEMP preview — drives the studio states with a fixture, no backend.
 *  /e/w3-bike-studio-preview is unguarded; remove before merge. Cycles
 *  intro → analyzing → rendering → reveal so the whole flow is visible. */

const ANALYSIS: BikeAnalysis = {
  bike_type: 'road', frame_color: 'matte teal', accent_color: 'lime', wheels: 'deep-section carbon',
  groupset: 'Shimano 105', handlebar: 'drop bars', distinctive: 'clean build with a lime bar tape and a single bottle cage', confidence: 0.86,
}

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
        analysis={state === 'intro' ? null : ANALYSIS}
        imageUrl={null}            // no image model → shows the honest styled placeholder
        renderStatus={state === 'reveal' ? 'image_model_unavailable' : null}
        prompt="A single road bicycle, matte teal frame, lime accents, deep-section carbon wheels, drop bars…"
        error={state === 'error' ? 'Couldn’t find a bike in that photo. Try the whole bike, side-on.' : null}
        onPick={() => setState('analyzing')}
        onReset={() => setState('intro')}
        onSave={() => setState('intro')}
      />
    </div>
  )
}
