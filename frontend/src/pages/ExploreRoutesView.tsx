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

/** Live conditions chip for outdoor routes — Open-Meteo, free, straight from the browser. */
function WeatherChip({ lat, lng }: { lat: number; lng: number }) {
  const [wx, setWx] = useState<{ t: number; wind: number } | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`)
      .then((r) => r.json())
      .then((j) => { if (alive && j?.current) setWx({ t: Math.round(j.current.temperature_2m), wind: Math.round(j.current.wind_speed_10m) }) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [lat, lng])
  if (!wx) return null
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

        {(data?.routes ?? []).map((r, i) => (
          <div key={i} className="flex gap-4 p-4" style={CARD}>
            <RouteSketch polyline={r.polyline} virtual={r.is_virtual} />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="num-display truncate" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{r.name}</span>
                {r.is_virtual ? (
                  <span className="rounded-full px-2 py-0.5" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-strain)', background: 'color-mix(in srgb, var(--color-strain) 14%, transparent)' }}>INDOOR</span>
                ) : (
                  r.start_lat != null && r.start_lng != null && <WeatherChip lat={r.start_lat} lng={r.start_lng} />
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 11.5, color: 'var(--color-ink-2)', fontWeight: 600 }}>
                <span className="inline-flex items-center gap-1"><Repeat size={12} style={{ color: 'var(--color-accent)' }} /> {r.times_ridden}×</span>
                <span className="inline-flex items-center gap-1"><MapIcon size={12} style={{ color: 'var(--color-muted)' }} /> {r.distance_km.toFixed(1)} km</span>
                {r.elevation_m != null && <span className="inline-flex items-center gap-1"><Mountain size={12} style={{ color: 'var(--color-recovery)' }} /> {Math.round(r.elevation_m)} m</span>}
                <span className="inline-flex items-center gap-1"><Timer size={12} style={{ color: 'var(--color-gold)' }} /> {de ? 'Best' : 'PR'} {fmtTime(r.best_time_s)}</span>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>
                {de ? 'Ø' : 'avg'} {fmtTime(r.avg_time_s)}
                {r.last_ridden && ` · ${de ? 'zuletzt' : 'last'} ${format(parseISO(r.last_ridden), de ? 'd. MMM' : 'MMM d', { locale: de ? deLocale : undefined })}`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  )
}
