import W3GarageLane from './W3GarageLane'
import W3PartsDock from './W3PartsDock'
import { bikeArt, BIKES } from './w3bikes'
import { T, FONT } from './w3tokens'
import type { Workshop } from '../../api/workshop'
import type { Gear } from '../../api/gear'
import './w3.css'

/**
 * W3 · GARAGE LANE PREVIEW — the design flow's harness for the room below the
 * fold. Route /e/w3-garage-lane-preview (dev-only, like every preview).
 *
 * A mid-season rider, so every chapter has something to say: coins earned
 * today, an affordable next unlock, a chain half-way through its life, banked
 * Service-Bonus, three owned bikes, and a chosen backdrop.
 */

const WORKSHOP: Workshop = {
  components: [
    {
      id: 'chain', name_de: 'Kette', action_de: 'Kette reinigen und schmieren',
      km_since: 214, interval_km: 250, km_total: 3120, bonus_rc: 128,
      status: 'due', progress: 0.86, accrual_stopped: false,
      days_since: null, interval_days: null, clock: 'km', dormant: false,
      method: 'wax', owned: true,
    } as unknown as Workshop['components'][number],
  ],
  total_bonus_rc: 182,
  drivetrain_fresh: false,
  drivetrain_watts: 8.4,
  chain_km_total: 3120,
  chain_record_km: 412,
  chain_life: {
    life_km: 1710, limit_km: 2800, pct: 0.61, km_left: 1090,
    status: 'fresh', progress: 0.61,
  } as Workshop['chain_life'],
  balance: 1240,
  open_question: null,
  weather_ahead:
    'Morgen steht eine Einheit im Plan — und bis zu 80 % Regen. Kette heute Abend machen zahlt doppelt.',
}

const GEAR: Gear = {
  items: [
    {
      id: 'tyres-gravel', name_de: 'Gravel-Stollen', slot: 'tyres', slot_label: 'REIFEN',
      rarity: 'common', pct: 15, price_rc: 600, why: 'Zählt auf Schotter und Trails.',
      flavour_de: 'Grip ist Geld.', owned: false, equipped: false, affordable: true,
    },
  ],
  slots: { tyres: 'REIFEN', wheels: 'LAUFRÄDER', mounted: 'ANBAU', cockpit: 'COCKPIT', charm: 'GLÜCK', helmet: 'HELM', eyewear: 'BRILLE' },
} as unknown as Gear

export default function W3GarageLanePreview() {
  const owned = new Set(['rustbucket', 'steel-commuter', 'alloy-allez'])
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, background: T.bg, minHeight: '100dvh', paddingBottom: 90 }}>
        <div style={{ padding: '14px 16px 0' }}>
          <W3PartsDock gear={GEAR} workshopBonus={182}
            onOpenWorkshop={() => {}} onOpenGear={() => {}} />
        </div>
        <W3GarageLane
          workshop={WORKSHOP}
          onOpenWorkshop={() => {}}
          onOpenGear={() => {}}
          onOpenShop={() => {}}
          onOpenBikes={() => {}}
          stage={{ id: 'studio', name: 'Studio' }}
          onOpenStages={() => {}}
          stageTheme={{ value: 'mitternacht', busy: false, onSet: () => {} }}
          stageBike={{ value: 'photo', busy: false, onSet: () => {} }}
          balance={1240}
          earnedToday={230}
          nextUnlock={{ name: 'Gravel-Stollen', price: 600, kind: 'gear' }}
          avgEarnPerRide={74}
          equippedBonusPct={null}
          bikes={BIKES.map((b) => ({
            id: b.id, name: b.name, price: b.price, art: bikeArt(b.id),
            owned: owned.has(b.id), active: b.id === 'alloy-allez',
          }))}
        />
      </div>
    </div>
  )
}
