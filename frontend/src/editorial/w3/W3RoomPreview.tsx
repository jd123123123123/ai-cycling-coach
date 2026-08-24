import { NavLink, Outlet, Route, Routes } from 'react-router-dom'
import W3HeroShell, { useHeroPanel } from './W3HeroShell'
import W3TodayDock from './W3TodayDock'
import W3PartsDock from './W3PartsDock'
import { T } from './w3tokens'

/**
 * The room, without a login — so the ONE thing this shell exists for can be
 * looked at rather than argued about: click between the two screens and watch
 * whether the bike moves. If it flashes, the shell is broken, and no amount of
 * passing types would have told us.
 */

const VM = {
  handle: '@jannis',
  role: 'FUNSEEKER',
  rider: null,
  bike: null,
  bikeInScene: false,
  bikeName: 'Canyon Ultimate',
  coins: '2.480',
  streak: 6,
  bonus: null,
}

function Panel({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function ReadinessScreen() {
  const { portal } = useHeroPanel(
    <W3TodayDock
      vm={{ score: 74, state: 'BEREIT', scoreNote: null, bonus: '1,4×',
        stats: [
          { label: 'HRV', value: '68 ms', note: 'stabil', noteHue: undefined },
          { label: 'RUHEPULS', value: '48', note: null, noteHue: undefined },
          { label: 'SCHLAF', value: '7:12', note: 'gut', noteHue: undefined },
        ],
        showStats: true, expand: 0 }}
      onOpen={() => {}} />,
  )
  return (
    <Panel>
      {portal}
      <div style={{ padding: '18px 16px 40px', color: T.ink }}>
        <p style={{ fontSize: 13, color: T.mid }}>Inhalt von HEUTE. Nur das hier tauscht.</p>
      </div>
    </Panel>
  )
}

/** Enough of a catalogue to exercise the shelf: something fitted, something
 *  owned and not fitted, and something priced out of reach — the three states
 *  the row has to tell apart. `gear={null}` drew a dock with a dead empty
 *  message, which showed nothing this harness exists to show. */
const PREVIEW_GEAR = {
  balance: 900,
  slots: { wheels: 'Laufräder', tyres: 'Reifen', bars: 'Lenker', bags: 'Taschen', charm: 'Talisman' },
  items: [
    { id: 'deep_carbon', name_de: 'Deep Carbon 50', slot: 'wheels', slot_label: 'Laufräder', rarity: 'rare' as const, pct: 9, price_rc: 2400, why: 'im Flachen', flavour_de: '', owned: true, equipped: true, affordable: true },
    { id: 'climbing_wheels', name_de: 'Kletterlaufräder', slot: 'wheels', slot_label: 'Laufräder', rarity: 'rare' as const, pct: 7, price_rc: 2100, why: 'über 800 hm', flavour_de: '', owned: true, equipped: false, affordable: true },
    { id: 'aero_wheels', name_de: 'Aero 65', slot: 'wheels', slot_label: 'Laufräder', rarity: 'legendary' as const, pct: 11, price_rc: 4800, why: 'ab 30 km/h', flavour_de: '', owned: false, equipped: false, affordable: false },
    { id: 'slicks', name_de: 'Slicks 25', slot: 'tyres', slot_label: 'Reifen', rarity: 'common' as const, pct: 4, price_rc: 600, why: 'auf Asphalt', flavour_de: '', owned: false, equipped: false, affordable: true },
  ],
}

function PartsScreen() {
  const { portal } = useHeroPanel(
    <W3PartsDock gear={PREVIEW_GEAR} onOpenWorkshop={() => {}} workshopBonus={140} />,
  )
  return (
    <Panel>
      {portal}
      <div style={{ padding: '18px 16px 40px', color: T.ink }}>
        <p style={{ fontSize: 13, color: T.mid }}>Inhalt der GARAGE. Das Rad darüber bleibt stehen.</p>
      </div>
    </Panel>
  )
}

function Switcher() {
  const link = (active: boolean) => ({
    padding: '8px 14px', borderRadius: 100, fontSize: 11, fontWeight: 700,
    letterSpacing: 0.6, textDecoration: 'none',
    background: active ? T.ink : T.surface, color: active ? T.bg : T.mid,
  })
  return (
    <div style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 99, display: 'flex', gap: 8 }}>
      <NavLink to="/e/w3-room-preview" end style={({ isActive }) => link(isActive)}>HEUTE</NavLink>
      <NavLink to="/e/w3-room-preview/garage" style={({ isActive }) => link(isActive)}>GARAGE</NavLink>
    </div>
  )
}

export default function W3RoomPreview() {
  return (
    <>
      <Switcher />
      <Routes>
        <Route element={<W3HeroShell vm={VM}><Outlet /></W3HeroShell>}>
          <Route index element={<ReadinessScreen />} />
          <Route path="garage" element={<PartsScreen />} />
        </Route>
      </Routes>
    </>
  )
}
