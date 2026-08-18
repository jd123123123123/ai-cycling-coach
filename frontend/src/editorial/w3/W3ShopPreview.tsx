import { useState } from 'react'
import W3ShopView from './W3ShopView'
import { T } from './w3tokens'
import { STARTER_BIKE_ID } from './w3bikes'
import { STOCK_PARTS } from './w3parts'
import type { Loadout } from '../../api/shop'

/**
 * PREVIEW — the shop on fixtures, no auth and no backend.
 *
 * The balance is the switch that matters, because it is what decides whether a
 * row shows a live acid price or a muted one, and whether the detail sheet
 * offers "KAUFEN" or "DIR FEHLEN". `broke` is the state a brand-new rider is
 * actually in and the easiest one to forget to look at.
 */

const OWNED_BASE = [STARTER_BIKE_ID, ...Object.values(STOCK_PARTS)]
const LOADOUT: Loadout = {
  bike: 'steel-fixie', frame: null, wheels: null, bars: 'bars-lime', saddle: null,
}

const CASES = {
  broke: { balance: 120, owned: OWNED_BASE },
  spending: { balance: 2480, owned: [...OWNED_BASE, 'steel-fixie', 'bars-lime'] },
  rich: { balance: 99000, owned: [...OWNED_BASE, 'steel-fixie', 'bars-lime'] },
  'wallet down': { balance: null as number | null, owned: OWNED_BASE },
} as const
type CaseKey = keyof typeof CASES

export default function W3ShopPreview() {
  const [key, setKey] = useState<CaseKey>('spending')
  const [error, setError] = useState<string | null>(null)
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
        <button onClick={() => setError(error ? null : 'Dir fehlen noch 12.520 RideCoin.')} style={chip(error != null)}>error</button>
      </div>
      <W3ShopView
        balance={c.balance}
        owned={new Set<string>(c.owned)}
        loadout={LOADOUT}
        busyId={null}
        error={error}
        onBuy={() => {}}
        onEquip={() => {}}
        onBack={() => {}}
        onDismissError={() => setError(null)}
      />
    </div>
  )
}
