import { useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Share2, Users, Flag, Circle, Mountain, Info } from 'lucide-react'
import { useLocale } from '../contexts/LocaleContext'
import { useRaceDebrief } from '../hooks/useRaceDebrief'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { fetchStreamAnalysis } from '../api/streamAnalysis'
import type { RoutePoint } from '../api/debrief'
import ReactionBar from '../components/social/ReactionBar'

// ── Effort/gradient colour ramp (green → amber → red), shared with the
// debrief RouteMap so the course line reads the same everywhere. ──
const LOW = [22, 224, 138] // #16E08A
const MID = [255, 176, 32] // #FFB020
const HIGH = [250, 30, 85] // #FA1E55
function ramp(t: number): string {
  const c = t < 0.5
    ? LOW.map((lo, i) => lo + (MID[i] - lo) * (t / 0.5))
    : MID.map((mid, i) => mid + (HIGH[i] - mid) * ((t - 0.5) / 0.5))
  return `rgb(${c.map((v) => Math.round(v)).join(',')})`
}

const HERO_W = 390
const HERO_H = 290
const PAD = 34

// Effort-coloured route line drawn over a dark hero. Reuses the debrief
// RoutePoint stream (lat/lng/power). No tiles / network.
function RouteHero({ route }: { route: RoutePoint[] }) {
  const { locale } = useLocale(); const de = locale === 'de'
  const model = useMemo(() => {
    if (route.length < 2) return null
    const lats = route.map((p) => p.lat), lngs = route.map((p) => p.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const latSpan = maxLat - minLat || 1e-6, lngSpan = maxLng - minLng || 1e-6
    const scale = Math.min((HERO_W - PAD * 2) / lngSpan, (HERO_H - PAD * 2) / latSpan)
    const offX = (HERO_W - lngSpan * scale) / 2
    const offY = (HERO_H - latSpan * scale) / 2
    const pts = route.map((p) => [
      offX + (p.lng - minLng) * scale,
      offY + (maxLat - p.lat) * scale,
    ] as [number, number])
    const powers = route.map((p) => p.power).filter((v): v is number => v != null && isFinite(v))
    const sorted = [...powers].sort((a, b) => a - b)
    const pct = (q: number) => (sorted.length ? sorted[Math.floor(q * (sorted.length - 1))] : 0)
    const lo = pct(0.1), hi = pct(0.9) || lo + 1
    const colorAt = (i: number) => {
      const p = route[i].power
      if (p == null) return 'rgba(235,235,245,0.4)'
      return ramp(Math.max(0, Math.min(1, (p - lo) / (hi - lo))))
    }
    return { pts, colorAt }
  }, [route])

  if (!model) return null
  const { pts, colorAt } = model
  const [sx, sy] = pts[0]
  const [ex, ey] = pts[pts.length - 1]
  return (
    <svg
      viewBox={`0 0 ${HERO_W} ${HERO_H}`}
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={de ? 'Streckenkarte, nach Leistung eingefärbt' : 'Route map, coloured by power'}
    >
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
      {pts.slice(1).map(([x, y], i) => {
        const [px, py] = pts[i]
        return <line key={i} x1={px} y1={py} x2={x} y2={y} stroke={colorAt(i + 1)} strokeWidth={4.5} strokeLinecap="round" />
      })}
      <circle cx={sx} cy={sy} r={7} fill="var(--color-recovery)" stroke="#FFFFFF" strokeWidth={2.5} />
      <circle cx={ex} cy={ey} r={7} fill="var(--color-accent)" stroke="#FFFFFF" strokeWidth={2.5} />
    </svg>
  )
}

// Elevation area + per-point gradient strip, from the debrief altitude/grade
// streams. Honest empty when altitude is absent.
function ElevationProfile({ altitude, grade, de }: {
  altitude: (number | null)[]
  grade: (number | null)[]
  de: boolean
}) {
  const W = 318, H = 130
  const model = useMemo(() => {
    const alt = altitude.map((a) => (a == null ? null : a))
    const defined = alt.filter((a): a is number => a != null)
    if (defined.length < 2) return null
    const min = Math.min(...defined), max = Math.max(...defined)
    const span = max - min || 1
    const n = alt.length
    const x = (i: number) => (i / (n - 1)) * W
    const y = (a: number) => H - ((a - min) / span) * (H - 10) - 5
    let d = ''
    let started = false
    for (let i = 0; i < n; i++) {
      const a = alt[i]
      if (a == null) continue
      d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)} `
      started = true
    }
    const area = `${d}L${W},${H} L0,${H} Z`
    return { line: d.trim(), area, min, max }
  }, [altitude])

  // Gradient strip: one cell per sampled point, coloured by |grade|.
  const cells = useMemo(() => {
    const g = grade
    if (g.length === 0) return []
    const step = Math.max(1, Math.floor(g.length / 60))
    const out: string[] = []
    for (let i = 0; i < g.length; i += step) {
      const v = g[i]
      if (v == null) { out.push('#39424E'); continue }
      const mag = Math.min(1, Math.abs(v) / 10)
      out.push(v < -1 ? '#4E8C5A' : ramp(mag))
    }
    return out
  }, [grade])

  if (!model) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
        {de ? 'Kein Höhenprofil für diese Fahrt.' : 'No elevation profile for this ride.'}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none" style={{ maxHeight: 130 }}>
        <path d={model.area} fill="url(#elevfill)" stroke="none" />
        <path d={model.line} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <defs>
          <linearGradient id="elevfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FA1E5545" />
            <stop offset="0.5" stopColor="#FFB02026" />
            <stop offset="1" stopColor="#16E08A0F" />
          </linearGradient>
        </defs>
      </svg>
      {cells.length > 0 && (
        <div className="flex gap-px rounded-[3px] overflow-hidden" style={{ height: 9 }}>
          {cells.map((c, i) => (
            <span key={i} style={{ flex: 1, background: c }} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{Math.round(model.min)} m</span>
        <div className="flex items-center gap-1.5">
          <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.06em' }}>{de ? 'FLACH' : 'FLAT'}</span>
          <span style={{ width: 40, height: 4, borderRadius: 2, background: 'linear-gradient(90deg,#16E08A,#FFB020,#FA1E55)' }} />
          <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.06em' }}>{de ? 'STEIL' : 'STEEP'}</span>
        </div>
        <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{Math.round(model.max)} m</span>
      </div>
    </div>
  )
}

// Horizontal zone bars (time %) — used for both power and HR zones.
function ZoneBars({ entries, color }: { entries: [string, number][]; color: string }) {
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([label, pct]) => (
        <div key={label} className="flex items-center gap-2.5">
          <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', width: 24 }}>{label}</span>
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: 'var(--color-rule)' }}>
            <div style={{ width: `${(pct / max) * 100}%`, height: '100%', background: color, transition: 'width 500ms var(--ease-apple-default)' }} />
          </div>
          <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-ink-2)', width: 36, textAlign: 'right' }}>{Math.round(pct)}%</span>
        </div>
      ))}
    </div>
  )
}

function Stat({ value, unit, label, color }: { value: string; unit?: string; label: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1">
        <span className="num-display" style={{ fontSize: 21, color: color ?? 'var(--color-ink)' }}>{value}</span>
        {unit && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{unit}</span>}
      </div>
      <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{label}</span>
    </div>
  )
}

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function CrewRideDetailView() {
  const { activityId: idParam } = useParams()
  const activityId = idParam ? Number(idParam) : undefined
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()

  const { data: debrief, isLoading, isError } = useRaceDebrief(activityId)
  const { data: profile } = useAthleteProfile()
  const { data: stream } = useQuery({
    queryKey: ['activity', 'stream-analysis', activityId],
    queryFn: () => fetchStreamAnalysis(activityId as number),
    enabled: activityId != null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const header = debrief?.header
  const story = debrief?.story
  const weightKg = profile?.weight_kg ?? null

  // Avg power: prefer the stream summary, else the debrief power stream mean.
  const avgPower = useMemo(() => {
    if (stream?.avg_power != null) return stream.avg_power
    const p = story?.power?.filter((v) => v != null && isFinite(v)) as number[] | undefined
    if (!p || p.length === 0) return null
    return p.reduce((s, v) => s + v, 0) / p.length
  }, [stream, story])
  const avgHr = stream?.avg_hr ?? debrief?.efficiency?.avg_hr ?? null
  const maxHr = stream?.max_hr ?? null
  const np = header?.np_watts ?? null
  const wkg = np != null && weightKg && weightKg > 0 ? np / weightKg : null

  const powerZones = useMemo<[string, number][]>(() => {
    const z = debrief?.pacing?.zone_time_pct
    if (!z) return []
    return Object.entries(z).filter(([, v]) => v > 0).map(([k, v]) => [k.replace('zone', 'Z'), v])
  }, [debrief])

  const hrZones = useMemo<[string, number][]>(() => {
    const hz = stream?.hr_zones
    if (!hz || !hz.secs || hz.secs.length === 0) return []
    const total = hz.secs.reduce((s, v) => s + v, 0) || 1
    return hz.secs.map((secs, i) => [`Z${i + 1}`, (secs / total) * 100] as [string, number]).filter(([, v]) => v > 0)
  }, [stream])

  const dateLabel = useMemo(() => {
    if (!header?.date) return ''
    try {
      return new Date(header.date).toLocaleDateString(de ? 'de-DE' : 'en-US', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return header.date
    }
  }, [header, de])

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 430 }}>
        {/* ── MAP HERO ── */}
        <div className="relative" style={{ height: HERO_H, background: 'linear-gradient(160deg,#12161C,#0A0C0F)', overflow: 'hidden' }}>
          {story?.route && story.route.length > 1 ? (
            <RouteHero route={story.route} />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-2">
                <Mountain size={30} style={{ color: 'var(--color-muted)' }} />
                <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>{de ? 'Keine GPS-Spur' : 'No GPS track'}</span>
              </div>
            </div>
          )}
          {/* bottom scrim */}
          <div className="absolute inset-x-0 bottom-0" style={{ height: 180, background: 'linear-gradient(180deg,rgba(10,12,15,0) 0%,#0A0C0F 100%)' }} />
          {/* nav */}
          <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'}
            className="absolute grid place-items-center rounded-full"
            style={{ top: 16, left: 16, width: 40, height: 40, background: 'rgba(10,12,15,0.65)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)' }}>
            <ArrowLeft size={20} style={{ color: '#FFFFFF' }} />
          </button>
          <button type="button"
            onClick={() => { try { navigator.share?.({ title: header?.title ?? 'Ride', url: window.location.href }) } catch { /* noop */ } }}
            aria-label={de ? 'Teilen' : 'Share'}
            className="absolute grid place-items-center rounded-full"
            style={{ top: 16, right: 16, width: 40, height: 40, background: 'rgba(10,12,15,0.65)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)' }}>
            <Share2 size={18} style={{ color: '#FFFFFF' }} />
          </button>
          {/* title overlay */}
          <div className="absolute" style={{ left: 20, right: 20, bottom: 18 }}>
            <h1 className="num-display" style={{ fontSize: 25, color: '#FFFFFF', lineHeight: 1.1 }}>
              {header?.title ?? (isLoading ? (de ? 'Lädt…' : 'Loading…') : (de ? 'Fahrt' : 'Ride'))}
            </h1>
            {dateLabel && <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{dateLabel}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
          {isError && (
            <div className="rounded-[16px] p-4" style={cardStyle}>
              <p style={{ fontSize: 13, color: 'var(--color-bad)' }}>
                {de ? 'Diese Fahrt konnte nicht geladen werden. Hat sie Leistungsdaten?' : "Couldn't load this ride. Does it have power data?"}
              </p>
              <Link to="/dashboard?tab=social" className="inline-flex items-center gap-1.5 mt-3" style={{ fontSize: 12.5, color: 'var(--color-accent)' }}>
                <Users size={14} /> {de ? 'Zurück zur Crew' : 'Back to crew'}
              </Link>
            </div>
          )}

          {/* ── STAT STRIP ── */}
          {header && (
            <div className="rounded-[20px] p-4 grid grid-cols-4 gap-y-4" style={cardStyle}>
              <Stat value={`${header.distance_km.toFixed(1)}`} unit="km" label={de ? 'DISTANZ' : 'DISTANCE'} />
              <Stat value={`${Math.round(header.elevation_m)}`} unit="m" label={de ? 'HÖHE' : 'ELEV'} />
              <Stat value={fmtDuration(header.moving_time_s)} label={de ? 'ZEIT' : 'TIME'} />
              <Stat value={`${header.avg_speed_kmh.toFixed(1)}`} unit="km/h" label={de ? 'SCHNITT' : 'AVG SPD'} />
            </div>
          )}

          {/* ── POWER / HR STATS ── */}
          {header && (
            <div className="rounded-[20px] p-4 flex flex-col gap-3.5" style={cardStyle}>
              <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Leistung & Puls' : 'Power & Heart Rate'}</span>
              <div className="grid grid-cols-4 gap-y-4">
                <Stat value={avgPower != null ? `${Math.round(avgPower)}` : '—'} unit="W" label={de ? 'Ø LEISTUNG' : 'AVG PWR'} />
                <Stat value={np != null ? `${Math.round(np)}` : '—'} unit="W" label="NP" />
                <Stat value={header.if_ != null ? header.if_.toFixed(2) : '—'} label="IF" color="var(--color-amber)" />
                <Stat value={`${Math.round(header.tss)}`} label="TSS" color="var(--color-accent)" />
                <Stat value={wkg != null ? wkg.toFixed(1) : '—'} unit="W/kg" label={de ? 'NP · W/kg' : 'NP · W/kg'} />
                <Stat value={avgHr != null ? `${Math.round(avgHr)}` : '—'} unit="bpm" label={de ? 'Ø PULS' : 'AVG HR'} />
                <Stat value={maxHr != null ? `${Math.round(maxHr)}` : '—'} unit="bpm" label={de ? 'MAX PULS' : 'MAX HR'} color="var(--color-strain)" />
                <Stat value={`${Math.round(header.total_kj).toLocaleString(de ? 'de' : 'en')}`} unit="kJ" label={de ? 'ARBEIT' : 'WORK'} />
              </div>
              {wkg == null && np != null && (
                <div className="flex items-center gap-1.5">
                  <Info size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'W/kg braucht dein Gewicht im Profil.' : 'W/kg needs your weight in your profile.'}</span>
                </div>
              )}
            </div>
          )}

          {/* ── ELEVATION + GRADIENT PROFILE ── */}
          {story && (
            <div className="rounded-[20px] p-4 flex flex-col gap-3" style={cardStyle}>
              <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Höhenprofil' : 'Elevation'}</span>
              <ElevationProfile
                altitude={story.altitude ?? []}
                grade={story.route?.map((p) => p.grade) ?? []}
                de={de}
              />
            </div>
          )}

          {/* ── POWER ZONES ── */}
          {powerZones.length > 0 && (
            <div className="rounded-[20px] p-4 flex flex-col gap-3" style={cardStyle}>
              <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Leistungszonen' : 'Power Zones'}</span>
              <ZoneBars entries={powerZones} color="var(--color-accent)" />
            </div>
          )}

          {/* ── HR ZONES ── */}
          {hrZones.length > 0 && (
            <div className="rounded-[20px] p-4 flex flex-col gap-3" style={cardStyle}>
              <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Pulszonen' : 'Heart Rate Zones'}</span>
              <ZoneBars entries={hrZones} color="var(--color-strain)" />
            </div>
          )}

          {/* ── REACTIONS + BACK TO CREW ── */}
          {activityId != null && (
            <div className="rounded-[20px] p-4 flex flex-col gap-3" style={cardStyle}>
              <div className="flex items-center gap-2">
                <Circle size={8} style={{ color: 'var(--color-accent)', fill: 'var(--color-accent)' }} />
                <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Anfeuern' : 'Cheer this ride'}</span>
              </div>
              <ReactionBar targetType="ride" targetId={activityId} de={de} />
            </div>
          )}

          <Link to="/dashboard?tab=social"
            className="inline-flex items-center justify-center gap-2 rounded-full"
            style={{ padding: '12px 0', background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
            <ArrowLeft size={16} style={{ color: 'var(--color-ink-2)' }} />
            <Flag size={15} style={{ color: 'var(--color-ink-2)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Zurück zur Crew' : 'Back to crew'}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
