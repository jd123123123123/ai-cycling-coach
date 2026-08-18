import { useState } from 'react'
import W3GarageView from './W3GarageView'
import { T } from './w3tokens'
import { bikeSoul } from './w3BikeSoul'
import { STARTER_BIKE_ID } from './w3bikes'
import { STOCK_PARTS } from './w3parts'
import type { Loadout } from '../../api/shop'

/**
 * PREVIEW — the garage on fixtures, no auth and no backend.
 *
 * This twin is not optional decoration: `W3TabBar` rewrites every tab to its
 * `-preview` route while you are inside the preview flow, so a tab whose twin
 * is missing navigates to a dead route and the design review hits a blank
 * screen. The GARAGE tab moved from `w3-bike-studio` to `w3-garage`, and this
 * is what keeps that tab alive in preview mode.
 *
 * The two cases that actually differ are the ones worth switching between: the
 * rider on their first minute (starter bike, stock everything — the state every
 * new account is in) and a rider who has spent (several bikes, a part on).
 */

const STOCK: Loadout = {
  bike: STARTER_BIKE_ID, frame: null, wheels: null, bars: null, saddle: null,
}

const CASES = {
  'first minute': {
    balance: 400,
    owned: [STARTER_BIKE_ID, ...Object.values(STOCK_PARTS)],
    loadout: STOCK,
  },
  collector: {
    balance: 2480,
    owned: [STARTER_BIKE_ID, ...Object.values(STOCK_PARTS),
      'steel-fixie', 'steel-tourer', 'alloy-allez', 'bars-lime', 'saddle-lime'],
    loadout: { bike: 'alloy-allez', frame: null, wheels: null, bars: 'bars-lime', saddle: 'saddle-lime' } as Loadout,
  },
  'wallet down': {
    balance: null as number | null,
    owned: [STARTER_BIKE_ID, ...Object.values(STOCK_PARTS)],
    loadout: STOCK,
  },
} as const
type CaseKey = keyof typeof CASES

export default function W3GaragePreview() {
  const [key, setKey] = useState<CaseKey>('collector')
  const c = CASES[key]
  const chip = (on: boolean) => ({
    fontSize: 9, padding: '3px 7px', borderRadius: 5, border: 0,
    background: on ? T.acid : T.surface2, color: on ? T.bg : T.mid, cursor: 'pointer',
  })
  return (
    <div>
      <div style={{ position: 'fixed', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', gap: 4, background: '#0008', padding: 4, borderRadius: 8 }}>
        {(Object.keys(CASES) as CaseKey[]).map((k) => (
          <button key={k} onClick={() => setKey(k)} style={chip(k === key)}>{k}</button>
        ))}
      </div>
      <W3GarageView
        // The preview has no server, so no composed build — the hero falls back
        // to the bike's catalogue photo, which is the same path a rider sees
        // before their first render lands.
        render={null}
        soul={bikeSoul({
          now: new Date(2026, 7, 18, 18, 30),   // dusk, so the wash is visible
          km: 8214, km7d: 218, rodeToday: false,
          hasSessionToday: true, daysSinceRide: 1,
        })}
        balance={c.balance}
        owned={new Set<string>(c.owned)}
        loadout={c.loadout}
        busyId={null}
        onEquip={() => {}}
        onOpenShop={() => {}}
      />
    </div>
  )
}
