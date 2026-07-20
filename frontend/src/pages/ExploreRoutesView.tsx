/**
 * ExploreRoutesView — built against pencil-new.pen "V2 · Explore Routes"
 * (K3PVt), honestly scoped: YOUR ridden routes, clustered from your own GPS
 * activities (no external route service). Each card: an SVG sketch of the
 * real track (no map tiles — free and offline), times ridden, distance,
 * elevation, best/avg time, live Open-Meteo weather for outdoor routes.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Map as MapIcon, Repeat, Mountain, Timer, Wind } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { apiClient } from '../api/client'
import { useRideCounts } from '../hooks/usePowerProfile'
import { useLocale } from '../contexts/LocaleContext'

interface RouteItem {
  name: string
  times_ridden: number
  distance_km: number
  elevation_m: number | null
  best_time_s: number | null
  avg_time_s: number | null
  last_ridden: string | null
  start_lat: number | null
  start_lng: number | null
  is_virtual: boolean
  polyline: [number, number][]
}
interface RoutesResponse { available: boolean; n_gps_rides: number; routes: RouteItem[] }

const CARD = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 24 } as const

const fmtTime = (s: number | null) => {
  if (s == null) return '—'
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`
}

/** SVG sketch of the GPS track — normalized to the card, no tiles. */
function RouteSketch({ polyline, virtual }: { polyline: [number, number][]; virtual: boolean }) {
  const d = useMemo(() => {
    if (!polyline || polyline.length < 2) return null
    const lats = polyline.map((p) => p[0]), lngs = polyline.map((p) => p[1])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const spanLat = Math.max(1e-6, maxLat - minLat), spanLng = Math.max(1e-6, maxLng - minLng)
    const W = 120, H = 76, pad = 6
    // Keep aspect: scale by the larger span, center the smaller.
    const s = Math.min((W - 2 * pad) / spanLng, (H - 2 * pad) / spanLat)
    const ox = (W - spanLng * s) / 2, oy = (H - spanLat * s) / 2
    return polyline
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(ox + (p[1] - minLng) * s).toFixed(1)},${(oy + (maxLat - p[0]) * s).toFixed(1)}`)
      .join(' ')
  }, [polyline])
  if (!d) return null
  return (
    <svg viewBox="0 0 120 76" style={{ width: 120, height: 76, flexShrink: 0 }}>
      <rect x="0" y="0" width="120" height="76" rx="14" fill="var(--color-surface-2)" />
      <path d={d} fill="none" stroke={virtual ? 'var(--color-strain)' : 'var(--color-accent)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Live conditions for outdoor routes — Open-Meteo, batched + session-cached. ──
// Audit P2-16 (routes): the old per-card fetch fired one request per route and
// open-meteo's 429 rate limit dropped chips with console noise. Now: routes are
// grouped into location clusters (coords rounded to 2dp ≈ 1.1 km), ONE request
// covers every cluster the view needs, and results live in a module-level map
// for the session. On 429 / network failure the chip simply doesn't render —
// no placeholder, no console spam, no fake zeros.

interface Wx { t: number; wind: number }

/** Cluster key: 2-decimal rounding — nearby starts share one forecast. */
export const wxClusterKey = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`

/** key → weather; null = fetch failed/absent this session (never retried, never rendered). */
const wxCache = new Map<string, Wx | null>()

/** Test hook — the session cache is module state. */
export function __resetWxCacheForTests() {
  wxCache.clear()
}

/**
 * One batched request for every cluster key not already in the session cache
 * (Open-Meteo accepts comma-separated coordinate lists). Missing/failed
 * clusters resolve to null — callers drop the chip, silently.
 */
export async function fetchWeatherClusters(
  keys: string[],
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, Wx | null>> {
  const missing = keys.filter((k) => !wxCache.has(k))
  if (missing.length > 0) {
    // Claim the keys up front so a re-render can never duplicate the request.
    for (const k of missing) wxCache.set(k, null)
    try {
      const lats = missing.map((k) => k.split(',')[0]).join(',')
      const lngs = missing.map((k) => k.split(',')[1]).join(',')
      const r = await fetchFn(
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,wind_speed_10m`,
      )
      if (r.ok) {
        const j = await r.json()
        // Single location answers an object, multiple answer an array.
        const list: unknown[] = Array.isArray(j) ? j : [j]
        missing.forEach((k, i) => {
          const c = (list[i] as { current?: { temperature_2m?: unknown; wind_speed_10m?: unknown } } | undefined)?.current
          if (c && Number.isFinite(c.temperature_2m) && Number.isFinite(c.wind_speed_10m)) {
            wxCache.set(k, { t: Math.round(c.temperature_2m as number), wind: Math.round(c.wind_speed_10m as number) })
          }
        })
      }
      // !r.ok (429 etc.) → keys stay null: chip absent, no retry storm, no console error.
    } catch {
      // Network failure → same silent absence.
    }
  }
  return new Map(keys.map((k) => [k, wxCache.get(k) ?? null]))
}

/** Presentational chip — only mounted when real weather exists for the cluster. */
function WeatherChip({ wx }: { wx: Wx }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: 'var(--color-surface-2)', fontSize: 10.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
      <Wind size={11} style={{ color: 'var(--color-strain)' }} /> {wx.t}° · {wx.wind} km/h
    </span>
  )
}

export default function ExploreRoutesView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const { data } = useQuery<RoutesResponse>({
    queryKey: ['routes', 'mine'],
    queryFn: async () => (await apiClient.get<RoutesResponse>('/routes/mine')).data,
    staleTime: 30 * 60 * 1000,
  })
  // ONE honest denominator (audit P0-5): shared GPS-ride count, label states it.
  const { data: rideCounts } = useRideCounts()
  const gpsRides = rideCounts?.rides_with_gps ?? data?.n_gps_rides ?? null

  // ONE batched weather fetch for all distinct outdoor start clusters (see
  // fetchWeatherClusters above) — chips read from the resolved map.
  const clusterKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const r of data?.routes ?? []) {
      if (!r.is_virtual && r.start_lat != null && r.start_lng != null) keys.add(wxClusterKey(r.start_lat, r.start_lng))
    }
    return Array.from(keys)
  }, [data])
  const [wxByCluster, setWxByCluster] = useState<Map<string, Wx | null> | null>(null)
  useEffect(() => {
    if (clusterKeys.length === 0) return
    let alive = true
    fetchWeatherClusters(clusterKeys)
      .then((m) => { if (alive) setWxByCluster(m) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [clusterKeys])

  return (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'} className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
            <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
          </button>
          <div className="flex flex-col">
            <h1 className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)' }}>{de ? 'Deine Strecken' : 'Your routes'}</h1>
            {data && (
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {de
                  ? `${data.routes.length} Strecken aus ${gpsRides ?? data.n_gps_rides} GPS-Fahrten erkannt`
                  : `${data.routes.length} routes recognized from ${gpsRides ?? data.n_gps_rides} GPS rides`}
              </span>
            )}
          </div>
        </div>

        {data && data.routes.length === 0 && (
          <div className="p-5" style={CARD}>
            <p style={{ fontSize: 13.5, color: 'var(--color-muted)', lineHeight: 1.5 }}>
              {de
                ? 'Noch keine Strecken — sobald du Fahrten mit GPS synchronisierst, erkennen wir deine wiederkehrenden Runden automatisch.'
                : 'No routes yet — once you sync rides with GPS, we recognize your recurring loops automatically.'}
            </p>
          </div>
        )}

        {(data?.routes ?? []).map((r, i) => {
          const wx = !r.is_virtual && r.start_lat != null && r.start_lng != null
            ? wxByCluster?.get(wxClusterKey(r.start_lat, r.start_lng)) ?? null
            : null
          return (
          <div key={i} className="flex gap-4 p-4" style={CARD}>
            <RouteSketch polyline={r.polyline} virtual={r.is_virtual} />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="num-display truncate" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{r.name}</span>
                {r.is_virtual ? (
                  <span className="rounded-full px-2 py-0.5" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-strain)', background: 'color-mix(in srgb, var(--color-strain) 14%, transparent)' }}>INDOOR</span>
                ) : (
                  wx && <WeatherChip wx={wx} />
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 11.5, color: 'var(--color-ink-2)', fontWeight: 600 }}>
                <span className="inline-flex items-center gap-1"><Repeat size={12} style={{ color: 'var(--color-accent)' }} /> {r.times_ridden}×</span>
                <span className="inline-flex items-center gap-1"><MapIcon size={12} style={{ color: 'var(--color-muted)' }} /> {r.distance_km.toFixed(1)} km</span>
                {r.elevation_m != null && <span className="inline-flex items-center gap-1"><Mountain size={12} style={{ color: 'var(--color-recovery)' }} /> {Math.round(r.elevation_m)} m</span>}
                <span className="inline-flex items-center gap-1"><Timer size={12} style={{ color: 'var(--color-gold)' }} /> {de ? 'Bestwert' : 'PR'} {fmtTime(r.best_time_s)}</span>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>
                {de ? 'Ø' : 'avg'} {fmtTime(r.avg_time_s)}
                {r.last_ridden && ` · ${de ? 'zuletzt' : 'last'} ${format(parseISO(r.last_ridden), de ? 'd. MMM' : 'MMM d', { locale: de ? deLocale : undefined })}`}
              </span>
            </div>
          </div>
          )
        })}
      </div>
    </DashboardShell>
  )
}
