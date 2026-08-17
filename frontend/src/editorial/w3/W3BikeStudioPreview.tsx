import { useState } from 'react'
import W3BikeStudioView, { type StudioState } from './W3BikeStudioView'
import { STARTER_BIKE } from './starterBike'

/** TEMP preview — drives the studio states with a fixture, no backend.
 *  /e/w3-bike-studio-preview is unguarded; remove before merge. Cycles
 *  intro → analyzing → rendering → reveal so the whole flow is visible. */

// Shaped like the real vision output (the analysis prompt asks for four
// numbered sections), so the preview exercises the spec-sheet parser rather
// than only its prose fallback.
const DESCRIPTION =
  '1. Frame: Aggressive aero road geometry, matte teal hydroformed aluminium tubes with ' +
  'lime-green decals on the down tube.\n' +
  '2. Cockpit: Compact drop bars, lime bar tape, black alloy stem.\n' +
  '3. Wheels: 50mm deep-section black carbon rims, black hubs, black-wall 25c tyres.\n' +
  '4. Components: Black saddle with lime stitching, silver clipless pedals, one bottle cage.'

/** The three reward outcomes the reveal has to handle, as fixtures: credited
 *  just now, already claimed on an earlier bike, and no answer from the wallet
 *  (which must print no RideCoin at all). The amounts mirror the backend
 *  constants (`ONBOARDING_GRANT_RC.bike` = 150). */
const REWARDS = {
  granted: { granted: 150, balance: 400 },
  claimed: { granted: 0, balance: 400 },
  none: null,
} as const
type RewardCase = keyof typeof REWARDS

export default function W3BikeStudioPreview() {
  const [state, setState] = useState<StudioState>('reveal')
  const [celebrate, setCelebrate] = useState(true)
  const [rewardCase, setRewardCase] = useState<RewardCase>('granted')
  const chip = (on: boolean) => ({ fontSize: 9, padding: '3px 6px', borderRadius: 5, border: 0, background: on ? '#C8FF00' : '#222', color: on ? '#000' : '#aaa', cursor: 'pointer' })
  return (
    <div>
      {/* dev state switcher */}
      <div style={{ position: 'fixed', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 4, background: '#0008', padding: 4, borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['intro', 'analyzing', 'rendering', 'reveal', 'error'] as StudioState[]).map((s) => (
            <button key={s} onClick={() => setState(s)} style={chip(state === s)}>{s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setCelebrate((v) => !v)} style={chip(celebrate)}>{celebrate ? 'unlock' : 'owned'}</button>
          {(Object.keys(REWARDS) as RewardCase[]).map((r) => (
            <button key={r} onClick={() => setRewardCase(r)} style={chip(rewardCase === r)}>{r}</button>
          ))}
        </div>
      </div>
      <W3BikeStudioView
        state={state}
        photoUrl={null}
        description={state === 'intro' ? null : DESCRIPTION}
        imageUrl={state === 'reveal' ? STARTER_BIKE : null}   // fixture render → shows the BIKE UNLOCKED celebration
        renderStatus={state === 'reveal' ? 'ok' : null}
        bikeName="Specialized Allez"
        celebrate={state === 'reveal' && celebrate}
        // fixture: the wired Page passes what /rewards/onboarding/bike really
        // credited — this preview only chooses which outcome to look at.
        reward={state === 'reveal' ? REWARDS[rewardCase] : null}
        rewardPending={state === 'reveal' && rewardCase === 'none'}
        prompt="A single road bicycle, matte teal frame, lime accents, deep-section carbon wheels, drop bars…"
        error={state === 'error' ? 'Auf dem Foto war kein Bike zu finden. Nimm das ganze Bike, von der Seite.' : null}
        onBack={() => setState('intro')}
        onPick={() => setState('analyzing')}
        onReset={() => setState('intro')}
        onSave={() => { /* preview: no real image to download */ }}
      />
    </div>
  )
}
