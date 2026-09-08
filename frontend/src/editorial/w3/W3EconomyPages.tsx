import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { T, FONT } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import W3TabBar from './W3TabBar'
import W3PartsDock from './W3PartsDock'
import W3GarageLane from './W3GarageLane'
import { useHeroPanel } from './W3HeroShell'
import W3GearPanel from './W3GearPanel'
import W3PlacesPanel from './W3PlacesPanel'
import W3WorkshopPanel from './W3WorkshopPanel'
import W3Shops from './W3Shops'
import { useBuyGear, useEquipGear, useGear, useUnequipGear } from '../../hooks/useGear'
import { useWorkshop } from '../../hooks/useWorkshop'
import { useWallet } from '../../hooks/useWallet'
import { useBackdrops, useGarage } from '../../hooks/useGarage'
import { useGarageCollection } from '../../hooks/useShop'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useQueryClient } from '@tanstack/react-query'
import { updateGoals } from '../../api/athletes'

/**
 * The three live screens of the bike economy, wired to real endpoints.
 *
 * They are in ONE file because they are one feature and each is a thin shell:
 * a header, a panel that owns its own data, and the tab bar. Three files of
 * fifteen lines each would spread one idea across a directory.
 *
 * The GARAGE is the hub — the built bike, the five slots, and what they bring.
 * Tapping a slot goes to the shop; tapping the workshop card goes to the
 * workshop. Neither is embedded in the garage: each is a full screen because
 * each is a real activity, and stacking all three would make the one thing the
 * garage is FOR — looking at your bike — a strip at the top of a long scroll.
 */

function Shell({ title, back, right, children }: {
  title: string
  back?: boolean
  right?: React.ReactNode
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.heroBg }}>
        <W3StatusBar />
        {/* ── THE HEADER IS THE APP'S, NOT THIS FILE'S ──────────────────────
            This drew its own back button and a 26px title, and carried neither
            the avatar nor the menu — so the three economy screens were the
            corner of the app with no route to the profile or the settings, and
            the furniture jumped every time a rider stepped in or out of them.
            `W3TopBar` is the same header the rest of W3 wears; the balance is
            real state rather than furniture, so it rides in `extra` where it
            stays next to the rider rather than floating in the page. ── */}
        <W3TopBar
          title={title}
          onBack={back ? () => navigate('/e/w3-garage') : undefined}
          extra={right} />
        {children}
        <W3TabBar />
      </div>
    </div>
  )
}

/** The balance, in the header, on every economy screen — so a rider deciding
 *  whether to buy never has to leave the screen to find out if they can. */
function Balance() {
  const { data: wallet } = useWallet()
  return (
    <span style={{
      fontSize: 15, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums',
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ color: T.lilac }}>✳</span>
      {wallet ? wallet.balance.toLocaleString('de-DE') : '—'}
    </span>
  )
}

/** GARAGE — the hub. Route: /e/w3-garage */
export function W3GarageHome() {
  const navigate = useNavigate()
  const { data: gear } = useGear()
  const { data: workshop } = useWorkshop()
  // The room the bike is in, so the garage can show it and hand the rider one
  // tap to the picker. Cheap: the same cached read the shop's gallery uses.
  const { data: backdrops } = useBackdrops()
  const stage = (() => {
    if (!backdrops) return null
    const id = backdrops.selected
    const b = backdrops.backdrops.find((x) => x.id === id)
    if (b) return { id, name: b.name_de }
    const pl = backdrops.places.find((x) => `place:${x.slug}` === id)
    return pl ? { id, name: pl.name } : null
  })()

  // NO STAGE OF ITS OWN. The garage is the same room as Today, and the room
  // belongs to `W3HeroShell` — so this page contributes the panel that floats
  // over the floor, and the lane the rider scrolls into. That is also the whole
  // feature: switching to the garage changes those two and nothing else, so the
  // machine never flashes.
  // The three verbs the dock's shelf needs. Owned here rather than inside the
  // dock so the dock stays a pure function of props and its preview route can
  // drive it with fixtures — the same split `W3GearPanel` uses for the full
  // catalogue screen. `busyId` is which TILE is in flight, not which verb: all
  // three mutations can be the one running.
  const equip = useEquipGear()
  const unequip = useUnequipGear()
  const buy = useBuyGear()
  const [busyId, setBusyId] = useState<string | null>(null)

  // ── which machine stands on the Bühne ─────────────────────────────────
  // The switch exists only when the rider actually has both machines: a
  // photographed one AND a bought (non-starter) collection bike.
  const { data: garage } = useGarage()
  const { data: collection } = useGarageCollection()
  const { data: profile } = useAthleteProfile()
  const qc = useQueryClient()
  const [stageBusy, setStageBusy] = useState(false)
  const hasPhoto = Boolean(garage?.bike?.image_base64)
  // The room's backdrop — always offered; the choice persists in the same
  // goals JSON the stage-bike switch uses.
  const [themeBusy, setThemeBusy] = useState(false)
  const stageTheme = {
    value: profile?.goals?.stage_theme ?? 'studio',
    busy: themeBusy,
    onSet: (id: string) => {
      setThemeBusy(true)
      void updateGoals({ stage_theme: id })
        .then(() => qc.invalidateQueries({ queryKey: ['athlete', 'me'] }))
        .finally(() => setThemeBusy(false))
    },
  }
  const boughtBike = collection?.loadout.bike && collection.loadout.bike !== 'rustbucket'
  const stageBike = hasPhoto && boughtBike
    ? {
        value: (profile?.goals?.stage_bike ?? 'photo') as 'photo' | 'collection',
        busy: stageBusy,
        onSet: (v: 'photo' | 'collection') => {
          setStageBusy(true)
          void updateGoals({ stage_bike: v })
            .then(() => qc.invalidateQueries({ queryKey: ['athlete', 'me'] }))
            .finally(() => setStageBusy(false))
        },
      }
    : null
  const run = (m: { mutate: (id: string, o: object) => void }) => (id: string) => {
    setBusyId(id)
    m.mutate(id, { onSettled: () => setBusyId(null) })
  }

  const dock = (
    <W3PartsDock
      gear={gear ?? null}
      onOpenWorkshop={() => navigate('/e/w3-workshop')}
      workshopBonus={workshop?.total_bonus_rc ?? null}
      onOpenGear={() => navigate('/e/w3-gear')}
      busyId={busyId}
      onEquip={run(equip)}
      onUnequip={run(unequip)}
      onBuy={run(buy)} />
  )
  const { inShell, portal } = useHeroPanel(dock)

  const lane = (
    <W3GarageLane
      workshop={workshop ?? null}
      onOpenWorkshop={() => navigate('/e/w3-workshop')}
      onOpenGear={() => navigate('/e/w3-gear')}
      onOpenShop={() => navigate('/e/w3-gear')}
      onOpenBikes={() => navigate('/e/w3-shop')}
      stage={stage}
      stageBike={stageBike}
      stageTheme={stageTheme}
      onOpenStages={() => navigate('/e/w3-gear#kulissen')} />
  )

  if (inShell) return <>{portal}{lane}</>

  // Outside the shell — a deep link that skipped it — the garage still draws
  // its own room rather than a bare panel on a black page.
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', padding: '10px 16px 18px' }}>{dock}</div>
        {lane}
        <W3TabBar />
      </div>
    </div>
  )
}

/** AUSRÜSTUNG — the shop. Route: /e/w3-gear */
export function W3GearScreen() {
  // The garage links straight to the backdrops with `#kulissen`; without this
  // the rider lands at the top of a long shop and has to find them again, which
  // is the trip the row exists to remove.
  useEffect(() => {
    if (window.location.hash !== '#kulissen') return
    const t = setTimeout(
      () => document.getElementById('kulissen')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      120,   // after the panels' first paint, or there is nothing to scroll to
    )
    return () => clearTimeout(t)
  }, [])

  return (
    <Shell title="Ausrüstung" back right={<Balance />}>
      <W3GearPanel />
      {/* ── THE BACKDROPS ARE SOLD WHERE THINGS ARE SOLD ─────────────────
          They were behind a "Orte" row in the garage lane, two taps away from
          the only screen a rider goes to in order to spend RideCoin — which is
          how an app ends up with a feature nobody knows about. The gallery is
          the same one; it is just no longer hidden. `/e/w3-places` redirects
          here so an old link still lands on the places. ── */}
      <W3PlacesPanel />
    </Shell>
  )
}

/** WERKSTATT — the harvest. Route: /e/w3-workshop */
export function W3WorkshopScreen() {
  return (
    <Shell title="Werkstatt" back right={<Balance />}>
      <W3WorkshopPanel />
    </Shell>
  )
}

/** The other half of maintenance: the jobs the rider does not do themselves.
 *  A screen rather than a panel inside the workshop, for the same reason the
 *  shop is one — standing in a bike shop is a different activity from standing
 *  at your own workbench, and stacking them makes both a scroll. */
export function W3ShopsScreen() {
  return (
    <Shell title="In der Nähe" back>
      <W3Shops />
    </Shell>
  )
}
