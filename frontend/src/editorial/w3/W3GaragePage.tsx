import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGear, useBuyGear, useEquipGear } from '../../hooks/useGear'
import { useBackdrops, useBuyPlace, useSelectStage } from '../../hooks/useGarage'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { bikeSoul } from './w3BikeSoul'
import W3GarageView from './W3GarageView'
import W3Loading from './W3Loading'
import W3LoadError from './W3LoadError'
import { useEnsureBuildRender, useEquipItem, useGarageCollection } from '../../hooks/useShop'
import type { ShopItem } from './w3shop'

/**
 * W3 · GARAGE (the GARAGE tab), wired. Route /e/w3-garage.
 *
 * ALL REAL:
 *  · balance ..... `GET /shop` (the same wallet the rest of the app spends from)
 *  · owned ....... `garage_items` — what this rider actually holds
 *  · loadout ..... `garage_loadout` — what they're actually riding
 *
 * The catalogue (names, prices, blurbs, art) is static and shipped with the
 * app, so this screen needs exactly one request and browsing costs nothing.
 *
 * The free starter bike is granted server-side on first read of `/shop`, which
 * is why there is no "claim your bike" step anywhere in the client: a rider who
 * has never opened the garage still owns a bike the moment they look.
 */
export default function W3GaragePage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch, isFetching } = useGarageCollection()
  const equip = useEquipItem()
  // The garage is where a build is looked at, so it is where one gets made.
  // A stock build asks for nothing; anything else is composed once, ever, for
  // every rider who assembles the same bike.
  const { isRendering } = useEnsureBuildRender()

  // ── the slot browser's data: the real gear economy and the real places ──
  const { data: gear } = useGear()
  const { data: stagesData } = useBackdrops()
  const buyGear = useBuyGear()
  const equipGear = useEquipGear()
  const buyPlace = useBuyPlace()
  const selectStage = useSelectStage()
  // One spinner id across four mutations: only one of them can be in flight for
  // a given row, and threading four separate pending states through the view
  // would let two rows spin at once for one tap.
  const busyId =
    (buyGear.isPending ? buyGear.variables : null)
    ?? (equipGear.isPending ? equipGear.variables : null)
    ?? (buyPlace.isPending ? buyPlace.variables : null)
    ?? (selectStage.isPending ? selectStage.variables : null)
    ?? null

  const owned = useMemo(() => new Set(data?.owned ?? []), [data?.owned])

  // ── What the bike has been through ────────────────────────────────────────
  // Two weeks is enough to answer every question the hero asks: how much road
  // is still on it (7 days), and how long since it moved (up to 14). Anything
  // older changes nothing on screen, so it is not worth fetching.
  const [from, to] = useMemo(() => {
    const start = new Date()
    start.setDate(start.getDate() - 14)
    return [start, new Date()] as const
  }, [])
  const { data: recent, isSuccess: ridesLoaded } = useActivitiesRange(from, to)

  const soul = useMemo(() => {
    // No answer yet → no mood. The hero renders unlit rather than guessing.
    if (!ridesLoaded) return null
    const acts = recent?.activities ?? []
    const now = new Date()
    const dayMs = 86_400_000
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

    let km7d = 0
    let lastRide: number | null = null
    let rodeToday = false
    for (const a of acts) {
      const t = new Date(a.started_at).getTime()
      if (!Number.isFinite(t)) continue
      const km = (a.distance_meters ?? 0) / 1000
      if (now.getTime() - t <= 7 * dayMs) km7d += km
      if (t >= startOfToday) rodeToday = true
      if (lastRide == null || t > lastRide) lastRide = t
    }

    return bikeSoul({
      now,
      // THE SERVER'S NUMBER, NOT THE RIDER'S LIFETIME. This is drawn on the
      // frame, so it has to be what this frame did: km since the bike was
      // claimed. Rider lifetime distance used to sit here, which meant a bike
      // claimed this morning announced years of riding it never did.
      km: data?.bike_km ?? null,
      km7d,
      rodeToday,
      // The plan is not read here — a bike with no ride yet today is "ready",
      // which is the honest default and the one that invites a ride.
      hasSessionToday: !rodeToday,
      daysSinceRide: lastRide == null ? null : Math.floor((startOfToday - lastRide) / dayMs) + (rodeToday ? 0 : 1),
    })
  }, [ridesLoaded, recent, data?.bike_km])

  if (isLoading && !data) return <W3Loading label="Lade deine Garage…" />
  // A failed load must never render as an empty garage — see W3LoadError.
  if (isError && !data) {
    return (
      <W3LoadError
        title="Deine Garage lädt nicht"
        detail="Wir konnten nicht abrufen, was dir gehört. Deine Räder sind sicher — das ist nur die Verbindung."
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    )
  }

  return (
    <W3GarageView
      balance={data?.balance ?? null}
      owned={owned}
      loadout={data?.loadout}
      busyId={equip.isPending ? (equip.variables ?? null) : null}
      soul={soul}
      render={data?.render ?? null}
      rendering={isRendering}
      onEquip={(item: ShopItem) => equip.mutate(item.id)}
      onOpenShop={() => navigate('/e/w3-gear')}
      slots={{
        // The REAL economy, not the fixture catalogue the bike list above still
        // reads from: `/garage/gear` knows what is owned, worn, priced and
        // affordable, and `/garage/backdrops` knows the same about places.
        slots: Object.entries(gear?.slots ?? {}).map(([id, label]) => ({ id, label })),
        gear: gear?.items ?? [],
        places: stagesData?.places ?? [],
        backdrops: stagesData?.backdrops ?? [],
        balance: gear?.balance ?? data?.balance ?? null,
        busyId,
        onBuyGear: (id) => buyGear.mutate(id),
        onEquipGear: (id) => equipGear.mutate(id),
        onBuyPlace: (slug) => buyPlace.mutate(slug),
        onSelectStage: (id) => selectStage.mutate(id),
      }}
    />
  )
}
