/**
 * ClimbCompanionView — built against pencil-new.pen "Screen · Climb Companion"
 * (I3Nzs): Header → climb name + CAT chip → gradient-colored elevation profile
 * (zone tokens by grade) → Elevation-Gain / VAM-Target cards → Pacing Plan by
 * road section with FTP-anchored target watts (the canonical threshold the
 * backend paces from — chip and pacing watts always agree) → Your Standing (PR + attempt
 * deltas — own attempts only, no fabricated leaderboard) → Today on the Climb
 * (live Open-Meteo at the climb's real GPS; omitted for virtual/Zwift climbs).
 * Every climb comes from GET /climbs/mine — detected in the athlete's own ride
 * streams, nothing external.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Mountain, Flag, Timer, Gauge, Medal, TrendingUp, TrendingDown,
  Wind, Thermometer, Droplets, Sparkles,
} from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { apiClient } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'

interface ProfileBin { km: number; gradient_pct: number; alt_m: number }
interface PacingSection {
  from_km: number; to_km: number; gradient_pct: number
  zone: number; effort: string; target_watts: number
}
interface AttemptRow {
  date: string | null; time_s: number; delta_s: number
  avg_power: number | null; vam: number | null
}
interface ClimbSummary {
  name: string | null; category: string
  length_km: number; avg_gradient_pct: number; max_gradient_pct: number
  elevation_m: number; summit_m: number; start_km: number
  best_time_s: number; best_date: string | null; best_avg_power: number | null
  best_vam: number | null; best_wkg: number | null
  attempts: number; last_date: string | null; is_virtual: boolean
  lat: number | null; lng: number | null; bearing_deg: number | null
  profile: ProfileBin[]; pacing: PacingSection[]
  vam_target: number | null; history: AttemptRow[]
}
interface ClimbsResponse {
  available: boolean
  /** Canonical threshold (audit P0-1): manual FTP when set, else sanitized
   *  model eFTP — the SAME number the pacing watts are computed from. */
  threshold_watts: number | null
  threshold_source: 'manual' | 'model' | null
  /** @deprecated backward-compat alias of threshold_watts */
  cp_watts: number | null
  climbs: ClimbSummary[]
}
interface WxCurrent {
  temperature_2m: number; apparent_temperature: number
  relative_humidity_2m: number; wind_speed_10m: number; wind_direction_10m: number
}

const CARD = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 24 } as const

const zoneVar = (z: number) => `var(--color-zone-${Math.min(5, Math.max(1, z))})`
const zoneForGrade = (g: number) => (g < 3 ? 1 : g < 6 ? 2 : g < 9 ? 3 : g < 12 ? 4 : 5)

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = Math.round(s % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function fmtDate(iso: string | null, de: boolean): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric' })
}

/** Strip virtual-platform prefixes for display only ("Zwift - The Gorby · km 1" → "The Gorby · km 1"). */
const displayName = (c: ClimbSummary, de: boolean) =>
  c.name
    ? c.name.replace(/^(zwift|rouvy|mywhoosh|trainerroad)\s*[-–—:]\s*/i, '')
    : de ? `Anstieg · ${c.length_km} km` : `Climb · ${c.length_km} km`

const EFFORT_TIPS: Record<string, [string, string]> = {
  settle: ['Settle in, keep it conversational', 'Einrollen, im Plauderton bleiben'],
  steady: ['Steady rhythm, stay seated', 'Gleichmäßiger Rhythmus, sitzen bleiben'],
  tempo: ['Strong tempo, steady breathing', 'Zügiges Tempo, ruhig weiteratmen'],
  hard: ['Hard but controlled — hold your form', 'Hart, aber kontrolliert — Form halten'],
  max: ['Steep — out of the saddle, dig in', 'Steil — aus dem Sattel, durchbeißen'],
  recover: ['Let it roll, recover', 'Rollen lassen, erholen'],
}

/** Wind relation on the climb: Open-Meteo direction is where wind comes FROM. */
function windRelation(windFromDeg: number, bearingDeg: number | null): 'head' | 'tail' | 'cross' | null {
  if (bearingDeg == null) return null
  const diff = Math.abs((((windFromDeg - bearingDeg) % 360) + 540) % 360 - 180)
  // diff = 0 → wind source straight ahead (headwind); 180 → from behind (tailwind)
  if (diff < 45) return 'head'
  if (diff > 135) return 'tail'
  return 'cross'
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export default function ClimbCompanionView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const [sel, setSel] = useState(0)

  const { data, isLoading } = useQuery<ClimbsResponse>({
    queryKey: ['climbs', 'mine'],
    queryFn: async () => (await apiClient.get<ClimbsResponse>('/climbs/mine')).data,
    staleTime: 30 * 60 * 1000,
  })

  const climbs = data?.climbs ?? []
  const climb = climbs[Math.min(sel, Math.max(0, climbs.length - 1))] ?? null

  const wxEnabled = !!climb && !climb.is_virtual && climb.lat != null && climb.lng != null
  const { data: wx } = useQuery<WxCurrent>({
    queryKey: ['climb-weather', climb?.lat, climb?.lng],
    enabled: wxEnabled,
    retry: 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${climb!.lat}&longitude=${climb!.lng}`
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh'
      const r = await fetch(url)
      if (!r.ok) throw new Error('weather unavailable')
      const body = await r.json()
      if (!body?.current) throw new Error('weather unavailable')
      return body.current as WxCurrent
    },
  })

  const bars = useMemo(() => {
    if (!climb?.profile.length) return []
    const alts = climb.profile.map((b) => b.alt_m)
    const min = Math.min(...alts)
    const span = Math.max(1, Math.max(...alts) - min)
    return climb.profile.map((b) => ({
      ...b,
      h: 22 + Math.round(((b.alt_m - min) / span) * 148),
      color: zoneVar(zoneForGrade(b.gradient_pct)),
    }))
  }, [climb])

  const elevationRank = useMemo(() => {
    if (!climb) return null
    return 1 + climbs.filter((c) => c.elevation_m > climb.elevation_m).length
  }, [climbs, climb])

  const windRel = wx && climb ? windRelation(wx.wind_direction_10m, climb.bearing_deg) : null

  const wxNote = useMemo(() => {
    if (!wx) return null
    let note: string
    if (windRel === 'tail') {
      note = de ? 'Rückenwind heute — ein guter Tag, um den PR zu jagen.' : 'Wind at your back today — a good day to chase that PR.'
    } else if (windRel === 'head') {
      note = de ? 'Gegenwind am Anstieg — nach Watt pacen, nicht nach Tempo.' : 'Headwind on the climb — pace by watts, not speed.'
    } else if (windRel === 'cross') {
      note = de ? 'Seitenwind heute — in offenen Abschnitten gleichmäßig treten.' : 'Crosswind today — hold a steady effort through exposed sections.'
    } else {
      note = de ? 'Live-Bedingungen am Fuß des Anstiegs.' : 'Live conditions at the base of the climb.'
    }
    if (wx.apparent_temperature >= 28) {
      note += de ? ' Es ist heiß — extra Flaschen mitnehmen.' : ' It’s hot — bring extra fluids.'
    }
    return note
  }, [wx, windRel, de])

  // ── header (shared by every state) ──
  const header = (
    <div className="flex items-center justify-between">
      <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'} className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
        <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
      </button>
      <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
        {de ? 'CLIMB-BEGLEITER' : 'CLIMB COMPANION'}
      </span>
      <div style={{ width: 40 }} />
    </div>
  )

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
          {header}
          <p style={{ fontSize: 14, color: 'var(--color-muted)' }}>
            {de ? 'Durchsuche deine Fahrten nach Anstiegen …' : 'Scanning your rides for climbs…'}
          </p>
        </div>
      </DashboardShell>
    )
  }

  if (!climb) {
    return (
      <DashboardShell>
        <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
          {header}
          <div className="flex flex-col items-center gap-3 p-8 text-center" style={CARD}>
            <Mountain size={28} style={{ color: 'var(--color-muted)' }} />
            <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>
              {de ? 'Noch keine Anstiege erkannt' : 'No climbs detected yet'}
            </span>
            <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.55, maxWidth: 420 }}>
              {de
                ? 'Fahre draußen (oder auf Zwift) mit Höhen- und Distanzdaten und synchronisiere — jeder Anstieg ab ca. 500 m Länge und 3 % Steigung taucht hier automatisch auf, mit Pacing-Zielen aus deiner FTP.'
                : 'Ride outdoors (or on Zwift) with altitude and distance data and sync — every climb of roughly 500 m+ at a 3 %+ grade shows up here automatically, with pacing targets from your FTP.'}
            </p>
          </div>
        </div>
      </DashboardShell>
    )
  }

  const catChip = climb.category !== 'uncat'
  const meta: string[] = []
  if (climb.best_date) meta.push(fmtDate(climb.best_date, de))
  if (climb.best_avg_power != null) meta.push(`${Math.round(climb.best_avg_power)} W ${de ? 'Ø' : 'avg'}`)
  if (climb.best_vam != null) meta.push(`${climb.best_vam.toLocaleString(de ? 'de-DE' : 'en-US')} VAM`)

  const ticks = [
    '0 km',
    (climb.length_km * 0.25).toFixed(1),
    (climb.length_km * 0.5).toFixed(1),
    (climb.length_km * 0.75).toFixed(1),
    `${climb.length_km} km`,
  ]

  const legend: { zone: number; label: string }[] = [
    { zone: 1, label: de ? 'Leicht' : 'Easy' },
    { zone: 2, label: de ? 'Ruhig' : 'Steady' },
    { zone: 3, label: 'Tempo' },
    { zone: 4, label: de ? 'Hart' : 'Hard' },
    { zone: 5, label: 'Brutal' },
  ]

  const vamDelta = climb.vam_target != null && climb.best_vam != null ? climb.vam_target - climb.best_vam : null

  return (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        {header}

        {/* ── Title block (.pen DJOmP) ── */}
        <div className="flex flex-col gap-2">
          <h1 className="num-display" style={{ fontSize: 26, lineHeight: 1.15, color: 'var(--color-ink)' }}>
            {displayName(climb, de)}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5">
            {catChip && (
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: 'var(--color-gold-soft)' }}>
                <Mountain size={13} style={{ color: 'var(--color-gold)' }} />
                <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-gold)' }}>
                  {climb.category === 'HC' ? 'HC' : `CAT ${climb.category}`}
                </span>
              </span>
            )}
            {climb.is_virtual && (
              <span className="eyebrow rounded-full px-2.5 py-1" style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, background: 'var(--color-surface-2)', color: 'var(--color-ink-2)' }}>
                {de ? 'INDOOR' : 'VIRTUAL'}
              </span>
            )}
            <span style={{ fontSize: 13.5, color: 'var(--color-ink-2)' }}>
              {de ? `${climb.attempts}× gefahren · zuletzt ${fmtDate(climb.last_date, de)}` : `Ridden ${climb.attempts}× · last ${fmtDate(climb.last_date, de)}`}
            </span>
          </div>
        </div>

        {/* ── Climb selector (own climbs only) ── */}
        {climbs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {climbs.map((c, i) => (
              <button key={i} type="button" onClick={() => setSel(i)} className="shrink-0 rounded-full px-3.5 py-2" style={{
                fontSize: 12, fontWeight: 600, maxWidth: 190, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                background: i === sel ? 'var(--color-surface-2)' : 'var(--color-paper-2)',
                border: `1px solid ${i === sel ? 'var(--color-accent)' : 'var(--color-rule)'}`,
                color: i === sel ? 'var(--color-ink)' : 'var(--color-ink-2)',
              }}>
                {displayName(c, de)}
              </button>
            ))}
          </div>
        )}

        {/* ── Elevation profile (.pen XpbET) ── */}
        <div className="flex flex-col gap-3.5 p-5" style={CARD}>
          <div className="flex items-center justify-between">
            <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
              {de ? 'HÖHENPROFIL' : 'ELEVATION PROFILE'}
            </span>
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'var(--color-surface-2)' }}>
              <Flag size={12} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>
                {climb.summit_m.toLocaleString(de ? 'de-DE' : 'en-US')} m {de ? 'Gipfel' : 'summit'}
              </span>
            </span>
          </div>
          <div className="flex items-end" style={{ height: 180, gap: 2 }}>
            {bars.map((b, i) => (
              <div key={i} className="flex-1 rounded-t-[3px]" title={`${b.gradient_pct}%`} style={{ height: b.h, background: b.color, opacity: 0.92 }} />
            ))}
          </div>
          <div className="flex justify-between">
            {ticks.map((t, i) => (
              <span key={i} style={{ fontSize: 11, color: 'var(--color-muted)' }}>{t}</span>
            ))}
          </div>
          <div className="flex flex-wrap items-center" style={{ gap: 14 }}>
            {legend.map((l) => (
              <span key={l.zone} className="flex items-center gap-1.5">
                <span className="rounded-full" style={{ width: 8, height: 8, background: zoneVar(l.zone) }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{l.label}</span>
              </span>
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--color-rule)' }} />
          <div className="flex">
            {([
              { v: `${climb.length_km} km`, l: de ? 'Länge' : 'Length' },
              { v: `${climb.avg_gradient_pct}%`, l: de ? 'Ø Steigung' : 'Avg grade' },
              { v: `${climb.max_gradient_pct}%`, l: de ? 'Max. Steigung' : 'Max grade' },
            ]).map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={i > 0 ? { borderLeft: '1px solid var(--color-rule)' } : undefined}>
                <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{s.v}</span>
                <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Elevation gain + VAM target (.pen N0i2u) ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2.5 p-4" style={CARD}>
            <div className="flex items-center gap-2">
              <Mountain size={16} style={{ color: 'var(--color-strain)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Höhenmeter' : 'Elevation Gain'}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="num-display" style={{ fontSize: 34, color: 'var(--color-ink)' }}>{climb.elevation_m.toLocaleString(de ? 'de-DE' : 'en-US')}</span>
              <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>m</span>
            </div>
            {elevationRank != null && (
              <span className="flex items-center gap-1" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-violet)' }}>
                <Medal size={14} />
                {elevationRank === 1
                  ? (de ? 'Dein größter Anstieg' : 'Your biggest climb')
                  : (de ? `Dein #${elevationRank}-größter Anstieg` : `Your #${elevationRank} biggest climb`)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2.5 p-4" style={CARD}>
            <div className="flex items-center gap-2">
              <Gauge size={16} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'VAM-Ziel' : 'VAM Target'}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="num-display" style={{ fontSize: 34, color: 'var(--color-ink)' }}>
                {climb.vam_target != null ? climb.vam_target.toLocaleString(de ? 'de-DE' : 'en-US') : '—'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>m/h</span>
            </div>
            {climb.vam_target != null && vamDelta != null ? (
              <span className="flex items-center gap-1" style={{ fontSize: 11.5, fontWeight: 600, color: vamDelta >= 0 ? 'var(--color-recovery)' : 'var(--color-ink-2)' }}>
                {vamDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {`${vamDelta >= 0 ? '+' : ''}${vamDelta} ${de ? 'vs. deine PR-Pace' : 'vs your PR pace'}`}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {de ? 'Braucht Powerdaten an diesem Anstieg' : 'Needs power data on this climb'}
              </span>
            )}
          </div>
        </div>

        {/* ── Pacing plan (.pen lDSpU) — only with a real threshold ── */}
        {climb.pacing.length > 0 && (data?.threshold_watts ?? data?.cp_watts) != null && (
          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between">
              <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{de ? 'Pacing-Plan' : 'Pacing Plan'}</span>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {de
                  ? `Basiert auf deiner FTP · ${data?.threshold_watts ?? data?.cp_watts} W`
                  : `Based on your FTP · ${data?.threshold_watts ?? data?.cp_watts} W`}
              </span>
            </div>
            <div className="flex flex-col px-4 py-1" style={CARD}>
              {climb.pacing.map((p, i) => (
                <div key={i}>
                  {i > 0 && <div style={{ height: 1, background: 'var(--color-rule)' }} />}
                  <div className="flex items-center gap-3" style={{ padding: '13px 0' }}>
                    <div className="rounded-[2px]" style={{ width: 4, height: 42, background: zoneVar(p.zone) }} />
                    <div className="flex flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                          Km {p.from_km.toFixed(1)} – {p.to_km.toFixed(1)}
                        </span>
                        <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: zoneVar(p.zone) }}>{p.gradient_pct}%</span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
                        {(EFFORT_TIPS[p.effort] ?? EFFORT_TIPS.steady)[de ? 1 : 0]}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{p.target_watts}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{de ? 'Watt' : 'watts'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Your standing — own attempts only, no invented leaderboard (.pen Lh84Y) ── */}
        <div className="flex flex-col gap-3">
          <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{de ? 'Deine Bilanz' : 'Your Standing'}</span>
          <div className="flex flex-col gap-3.5 p-4" style={CARD}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5">
                  <Timer size={15} style={{ color: 'var(--color-accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    {de ? 'Persönlicher Rekord' : 'Personal Record'}
                  </span>
                </span>
                <span className="num-display" style={{ fontSize: 36, color: 'var(--color-ink)' }}>{fmtTime(climb.best_time_s)}</span>
                {meta.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{meta.join(' · ')}</span>
                )}
              </div>
              <div className="flex flex-col items-center gap-0.5 rounded-[16px] px-3.5 py-2.5" style={{ background: 'var(--color-accent-soft)' }}>
                <span className="num-display" style={{ fontSize: 22, color: 'var(--color-accent)' }}>{climb.attempts}×</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)' }}>{de ? 'gefahren' : 'ridden'}</span>
              </div>
            </div>
            {climb.history.length > 1 && (
              <>
                <div style={{ height: 1, background: 'var(--color-rule)' }} />
                <div className="flex flex-col gap-1">
                  {climb.history.map((h, i) => {
                    const isPr = h.delta_s === 0
                    return (
                      <div key={i} className="flex items-center gap-2.5 rounded-[12px] px-2.5 py-2" style={isPr ? { background: 'var(--color-accent-soft)' } : undefined}>
                        <span style={{ fontSize: 13, fontWeight: isPr ? 700 : 500, color: 'var(--color-ink)', flex: 1 }}>
                          {fmtDate(h.date, de)}
                          {h.avg_power != null && (
                            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-muted)' }}>
                              {'  ·  '}{Math.round(h.avg_power)} W
                            </span>
                          )}
                        </span>
                        <span className="num-mono" style={{ fontSize: 13, fontWeight: 600, color: isPr ? 'var(--color-accent)' : 'var(--color-ink-2)' }}>
                          {fmtTime(h.time_s)}
                        </span>
                        <span className="num-mono" style={{ fontSize: 11.5, fontWeight: 700, width: 56, textAlign: 'right', color: isPr ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                          {isPr ? 'PR' : `+${fmtTime(h.delta_s)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Today on the climb — live weather at the real GPS location only ── */}
        {wxEnabled && wx && (
          <div className="flex flex-col gap-3">
            <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>
              {de ? 'Heute am Anstieg' : 'Today on the Climb'}
            </span>
            <div className="flex flex-col gap-3.5 p-4" style={CARD}>
              <div className="flex">
                {([
                  {
                    icon: <Wind size={18} style={{ color: 'var(--color-recovery)' }} />,
                    v: `${Math.round(wx.wind_speed_10m)} km/h`,
                    l: `${COMPASS[Math.round(wx.wind_direction_10m / 45) % 8]}${windRel ? ` · ${windRel === 'tail' ? (de ? 'Rückenwind' : 'tailwind') : windRel === 'head' ? (de ? 'Gegenwind' : 'headwind') : (de ? 'Seitenwind' : 'crosswind')}` : ''}`,
                  },
                  {
                    icon: <Thermometer size={18} style={{ color: 'var(--color-amber)' }} />,
                    v: `${Math.round(wx.temperature_2m)}°C`,
                    l: de ? `Gefühlt ${Math.round(wx.apparent_temperature)}°` : `Feels like ${Math.round(wx.apparent_temperature)}°`,
                  },
                  {
                    icon: <Droplets size={18} style={{ color: 'var(--color-strain)' }} />,
                    v: `${Math.round(wx.relative_humidity_2m)}%`,
                    l: de ? 'Luftfeuchte' : 'Humidity',
                  },
                ]).map((s, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1 text-center" style={i > 0 ? { borderLeft: '1px solid var(--color-rule)' } : undefined}>
                    {s.icon}
                    <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{s.v}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{s.l}</span>
                  </div>
                ))}
              </div>
              {wxNote && (
                <>
                  <div style={{ height: 1, background: 'var(--color-rule)' }} />
                  <div className="flex items-start gap-2">
                    <Sparkles size={16} style={{ color: 'var(--color-recovery)', marginTop: 1, flexShrink: 0 }} />
                    <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{wxNote}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
