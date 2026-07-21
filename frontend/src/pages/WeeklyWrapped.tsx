/**
 * WeeklyWrapped — the Spotify-Wrapped-style weekly highlights STORY.
 *
 * Seven full-screen cards, each backed by a real animated WebGL fragment shader
 * (<ShaderCanvas/>), matching pencil-new.pen's Wrapped 1–7 frames 1:1. Tap
 * right/left (or ←/→ / swipe) to move through; segmented progress bars up top;
 * hero numbers count up on each card's entrance (framer-motion + useCountUp).
 * The final Recap card shares the week (Web Share API + a rendered image card).
 *
 * Honesty contract: cards whose metric the backend can't back (no elevation
 * streams → no Elevation card; no power meter → no Peak Power card) are omitted
 * from the deck rather than faked. German-first copy; kickers stay bold EN per
 * the pen ("YOU WENT THE DISTANCE").
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, getISOWeek } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { X, Bolt, ArrowRight, Share2, Bike, Flag, Mountain } from 'lucide-react'
import { apiClient } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'
import ShaderCanvas from '../components/wrapped/ShaderCanvas'
import { useCountUp } from '../hooks/useCountUp'

// ── Types ───────────────────────────────────────────────────────────────────

interface DailyEffort { key: string; date: string; tss: number; km: number; sessions: number; peak: boolean }
interface BestRide { activity_id: number; title: string; date: string | null; tss: number; km: number; hours: number; score: number | null; moving: string }
interface PeakPower { watts: number; wkg: number | null; comparison: { key: string; label: string; watts: number; you: boolean }[] }
export interface Route { points: [number, number][]; view: { w: number; h: number }; n_points: number; activity_id: number; title: string | null; km: number }
export interface Wrapped {
  week_start: string
  week_end: string
  has_rides: boolean
  totals: { sessions: number; hours: number; km: number; tss: number; active_days: number; saddle_hm: string }
  planned_tss: number | null
  ctl_delta: number | null
  route: Route | null
  distance_comparison: string | null
  saddle_line: string | null
  daily_effort: DailyEffort[]
  elevation_m: number | null
  peak_power: PeakPower | null
  best_ride: BestRide | null
  rides: number
  zero_missed: boolean
}

/** SVG path `d` from projected route points. Pure — exported for tests. */
export function routePathD(points: [number, number][]): string {
  if (!points.length) return ''
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`)
    .join(' ')
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Shader colour sets, verbatim from the pen frames.
const SHADERS = {
  cover: { variant: 'iri' as const, u: { u_a: '#FF5A3C', u_b: '#B14BFF', u_c: '#2E6BFF' } },
  distance: { variant: 'topo' as const, u: { u_base: '#060A16', u_glow: '#8B5CF6', u_line: '#4D8CFF' } },
  route: { variant: 'topo' as const, u: { u_base: '#04120C', u_glow: '#16E08A', u_line: '#4D8CFF' } },
  elevation: { variant: 'topo' as const, u: { u_base: '#0A0818', u_glow: '#2E6BFF', u_line: '#A98BFF' } },
  effort: { variant: 'iri' as const, u: { u_a: '#FF5A3C', u_b: '#FF2D6B', u_c: '#FF9E2C' } },
  ride: { variant: 'iri' as const, u: { u_a: '#FF8A3C', u_b: '#FFC24B', u_c: '#FF5A3C' } },
  peak: { variant: 'burst' as const, u: { u_accent: '#B14BFF', u_base: '#0A040A', u_core: '#FF5A3C', u_glow: '#FFB020' } },
  recap: { variant: 'iri' as const, u: { u_a: '#FF5A3C', u_b: '#8B5CF6', u_c: '#2E6BFF' } },
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.11em', color: '#FFFFFFCC', fontFamily: 'Inter, sans-serif' }}>
      {children}
    </span>
  )
}

function Glass({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderRadius: 18, background: '#FFFFFF14', border: '1px solid #FFFFFF2E', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '14px 16px', ...style }}>
      {children}
    </div>
  )
}

/** A hero number that counts up on mount, formatted with locale thousands. */
function CountNum({ value, digits = 0, style }: { value: number; digits?: number; style?: React.CSSProperties }) {
  const n = useCountUp(value, { digits, durationMs: 1300 })
  return <span style={style}>{n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits })}</span>
}

const heroStyle: React.CSSProperties = { fontFamily: 'Sora, sans-serif', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em', textShadow: '0 0 26px rgba(255,255,255,0.28)' }

// A slide's animated entrance.
function useEnter() {
  const reduce = useReducedMotion()
  return reduce ? {} : { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } }
}

// ── Individual cards ─────────────────────────────────────────────────────────

function CoverCard({ w, de, onStart }: { w: Wrapped; de: boolean; onStart: () => void }) {
  const enter = useEnter()
  const week = getISOWeek(parseISO(w.week_start))
  const range = `${format(parseISO(w.week_start), 'd. MMM').toUpperCase()} – ${format(parseISO(w.week_end), 'd. MMM').toUpperCase()} · ${de ? 'WOCHE' : 'WEEK'} ${week}`
  return (
    <motion.div key="cover" {...enter} className="flex flex-col justify-between h-full">
      <div className="flex items-center gap-2">
        <Bolt size={18} style={{ color: '#fff' }} fill="#fff" />
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.16em', color: '#fff', fontFamily: 'Inter' }}>WEEKLY WRAPPED</span>
      </div>
      <div className="flex flex-col gap-4">
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.11em', color: '#FFFFFFCC' }}>{range}</span>
        <div className="flex flex-col" style={{ lineHeight: 1.02 }}>
          <span style={{ ...heroStyle, fontSize: 54 }}>{de ? 'Deine Woche,' : 'Your week,'}</span>
          <span style={{ ...heroStyle, fontSize: 54 }}>{de ? 'gepackt.' : 'wrapped.'}</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFFE6', lineHeight: 1.4 }}>
          {de ? `${w.rides} Fahrten. ${Math.round(w.totals.km)} km. Deine Highlights der Woche.` : `${w.rides} rides. ${Math.round(w.totals.km)} km. Your week in highlights.`}
        </span>
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onStart() }} className="flex items-center gap-2 self-start">
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{de ? 'Tippen zum Starten' : 'Tap to begin'}</span>
        <ArrowRight size={20} style={{ color: '#fff' }} />
      </button>
    </motion.div>
  )
}

function DistanceCard({ w, de }: { w: Wrapped; de: boolean }) {
  const enter = useEnter()
  return (
    <motion.div key="distance" {...enter} className="flex flex-col justify-between h-full">
      <Kicker>YOU WENT THE DISTANCE</Kicker>
      <div className="flex items-end gap-2">
        <CountNum value={Math.round(w.totals.km)} style={{ ...heroStyle, fontSize: 96, lineHeight: 0.9, textShadow: '0 0 26px rgba(91,140,255,0.7)' }} />
        <span style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 30, color: '#fff', paddingBottom: 14 }}>km</span>
      </div>
      {/* Stylised route line — abstract (no route polyline in the data). */}
      <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 220 }}>
        <svg viewBox="0 0 342 300" width="100%" height="100%" style={{ maxHeight: 300 }} fill="none">
          <path d="M28 272 C 90 250, 70 160, 150 150 C 240 138, 210 60, 314 40" stroke="#4D8CFF" strokeWidth="14" strokeLinecap="round" opacity="0.5" style={{ filter: 'blur(10px)' }} />
          <path d="M28 272 C 90 250, 70 160, 150 150 C 240 138, 210 60, 314 40" stroke="url(#rg)" strokeWidth="4" strokeLinecap="round" />
          <defs>
            <linearGradient id="rg" x1="0" y1="300" x2="342" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#16E08A" /><stop offset="0.5" stopColor="#4D8CFF" /><stop offset="1" stopColor="#FF7A4E" />
            </linearGradient>
          </defs>
          <circle cx="28" cy="272" r="9" fill="#16E08A" stroke="#fff" strokeWidth="3" />
          <circle cx="314" cy="40" r="9" fill="#FF5A3C" stroke="#fff" strokeWidth="3" />
        </svg>
        <span className="absolute grid place-items-center rounded-full" style={{ left: '52%', top: '48%', width: 36, height: 36, background: '#FF5A3CE6', border: '2.5px solid #fff', boxShadow: '0 0 20px #FF5A3C' }}>
          <Bike size={18} style={{ color: '#fff' }} />
        </span>
      </div>
      <Glass>
        <span style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFFE6', lineHeight: 1.4 }}>
          {w.distance_comparison
            ? w.distance_comparison
            : de
              ? `${Math.round(w.totals.km)} km auf dem Rad — an ${w.totals.active_days} Tagen dieser Woche gesammelt.`
              : `${Math.round(w.totals.km)} km on the bike — logged across ${w.totals.active_days} days this week.`}
        </span>
      </Glass>
    </motion.div>
  )
}

// The week's most notable ride, drawn from real GPS — the line traces itself
// (stroke-dasharray/offset), or shows complete under reduced-motion.
function RouteCard({ w, de }: { w: Wrapped; de: boolean }) {
  const enter = useEnter()
  const reduce = useReducedMotion()
  const route = w.route!
  const d = useMemo(() => routePathD(route.points), [route])
  const pathRef = useRef<SVGPathElement>(null)
  const [len, setLen] = useState(0)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const p = pathRef.current
    if (!p) return
    const total = p.getTotalLength()
    setLen(total)
    if (reduce) { setDrawn(true); return }
    setDrawn(false)
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setDrawn(true))
      ;(pathRef.current as unknown as { _r2?: number })._r2 = r2
    })
    return () => cancelAnimationFrame(r1)
  }, [d, reduce])

  const [sx, sy] = route.points[0]
  const [ex, ey] = route.points[route.points.length - 1]
  const offset = reduce ? 0 : (drawn ? 0 : len)

  return (
    <motion.div key="route" {...enter} className="flex flex-col justify-between h-full">
      <div className="flex flex-col gap-3">
        <Kicker>{de ? 'DEINE STRECKE' : 'YOUR ROUTE'}</Kicker>
        <span style={{ ...heroStyle, fontSize: 40, lineHeight: 1.05, textShadow: 'none' }}>{route.title || (de ? 'Fahrt der Woche' : 'Ride of the week')}</span>
      </div>
      <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 300 }}>
        <svg viewBox={`0 0 ${route.view.w} ${route.view.h}`} width="100%" height="100%" style={{ maxHeight: 340 }} fill="none">
          {/* Soft glow underlay of the full path. */}
          <path d={d} stroke="#16E08A" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" style={{ filter: 'blur(9px)' }} />
          {/* Faint full track so the shape reads while the bright line draws. */}
          <path d={d} stroke="#FFFFFF26" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {/* The self-drawing bright line. */}
          <path
            ref={pathRef}
            d={d}
            stroke="url(#routeg)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={len || undefined}
            strokeDashoffset={len ? offset : undefined}
            style={{ transition: reduce ? undefined : 'stroke-dashoffset 2.3s cubic-bezier(0.4,0,0.2,1)' }}
          />
          <defs>
            <linearGradient id="routeg" x1="0" y1="0" x2={route.view.w} y2={route.view.h} gradientUnits="userSpaceOnUse">
              <stop stopColor="#16E08A" /><stop offset="0.5" stopColor="#4D8CFF" /><stop offset="1" stopColor="#FF7A4E" />
            </linearGradient>
          </defs>
          <circle cx={sx} cy={sy} r="7" fill="#16E08A" stroke="#fff" strokeWidth="2.5" />
          <circle cx={ex} cy={ey} r="7" fill="#FF5A3C" stroke="#fff" strokeWidth="2.5" style={{ opacity: drawn || reduce ? 1 : 0, transition: 'opacity 0.4s ease 2s' }} />
        </svg>
      </div>
      <Glass>
        <span style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFFE6', lineHeight: 1.4 }}>
          {de
            ? `${route.km} km, Meter für Meter nachgezeichnet — so bist du diese Woche gefahren.`
            : `${route.km} km, traced metre by metre — this is the way you rode this week.`}
        </span>
      </Glass>
    </motion.div>
  )
}

function ElevationCard({ w, de }: { w: Wrapped; de: boolean }) {
  const enter = useEnter()
  const everest = w.elevation_m ? Math.round((w.elevation_m / 8849) * 100) : 0
  return (
    <motion.div key="elevation" {...enter} className="flex flex-col justify-between h-full">
      <div className="flex flex-col gap-4">
        <Kicker>YOU WENT UP</Kicker>
        <div className="flex items-end gap-2">
          <CountNum value={w.elevation_m ?? 0} style={{ ...heroStyle, fontSize: 82, lineHeight: 0.9, textShadow: '0 0 26px rgba(169,139,255,0.7)' }} />
          <span style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 28, color: '#fff', paddingBottom: 12 }}>m</span>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full" style={{ background: '#FFFFFF1F', padding: '9px 14px', backdropFilter: 'blur(18px)' }}>
          <Mountain size={17} style={{ color: '#fff' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{de ? `Das sind ${everest}% des Everest — in einer Woche` : `That's ${everest}% of Everest — in one week`}</span>
        </div>
      </div>
      {/* Ridge silhouette */}
      <svg viewBox="0 0 342 260" width="100%" height="260" fill="none" preserveAspectRatio="none">
        <path d="M0 260 L0 190 L70 150 L120 175 L180 90 L240 140 L300 70 L342 110 L342 260 Z" fill="url(#ag)" opacity="0.5" />
        <path d="M0 190 L70 150 L120 175 L180 90 L240 140 L300 70 L342 110" stroke="url(#rl)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 16px #A98BFF)' }} />
        <circle cx="300" cy="70" r="7" fill="#fff" style={{ filter: 'drop-shadow(0 0 12px #fff)' }} />
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="260"><stop stopColor="#8B5CF6" stopOpacity="0.85" /><stop offset="1" stopColor="#8B5CF6" stopOpacity="0.02" /></linearGradient>
          <linearGradient id="rl" x1="0" y1="0" x2="342" y2="0"><stop stopColor="#4D8CFF" /><stop offset="0.55" stopColor="#A98BFF" /><stop offset="1" stopColor="#FF7A4E" /></linearGradient>
        </defs>
      </svg>
    </motion.div>
  )
}

function EffortCard({ w, de }: { w: Wrapped; de: boolean }) {
  const enter = useEnter()
  const days = w.daily_effort
  const maxTss = Math.max(...days.map((d) => d.tss), 1)
  return (
    <motion.div key="effort" {...enter} className="flex flex-col justify-between h-full">
      <div className="flex flex-col gap-4">
        <Kicker>YOU PUT IN THE WORK</Kicker>
        <div className="flex items-end gap-2">
          <span style={{ ...heroStyle, fontSize: 56, lineHeight: 0.9 }}>{w.totals.saddle_hm}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFFCC', paddingBottom: 10 }}>{de ? 'im Sattel' : 'in the saddle'}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2" style={{ height: 150 }}>
          {days.map((d) => (
            <div key={d.key} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max((d.tss / maxTss) * 100, d.tss > 0 ? 6 : 2)}%` }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                style={{ borderRadius: '5px 5px 2px 2px', background: d.peak ? '#16E08A' : d.tss > 0 ? '#FFFFFFCC' : '#FFFFFF26', boxShadow: d.peak ? '0 0 16px #16E08A99' : 'none', minHeight: 3 }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {DAY_LABELS.map((l, i) => (
            <span key={l} className="flex-1 text-center" style={{ fontSize: 11, fontWeight: days[i]?.peak ? 700 : 500, color: days[i]?.peak ? '#fff' : '#FFFFFF80' }}>{l}</span>
          ))}
        </div>
      </div>
      <Glass>
        <span style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFFE6', lineHeight: 1.4 }}>{w.saddle_line || effortCaption(w, de)}</span>
      </Glass>
    </motion.div>
  )
}

export function effortCaption(w: Wrapped, de: boolean): string {
  const peak = w.daily_effort.find((d) => d.peak)
  if (!peak) {
    return de ? `${w.totals.tss} TSS über die Woche — ruhig, aber stetig.` : `${w.totals.tss} TSS across the week — quiet but steady.`
  }
  const dayName = format(parseISO(peak.date), 'EEEE')
  return de
    ? `${dayName} hat die Woche getragen — ${peak.tss} TSS an einem Tag. Zusammen: ${w.totals.tss} TSS.`
    : `${dayName} carried the week — ${peak.tss} TSS in one day. Total: ${w.totals.tss} TSS.`
}

function RideCard({ w, de }: { w: Wrapped; de: boolean }) {
  const enter = useEnter()
  const r = w.best_ride!
  const score = r.score ?? 0
  const scoreAnim = useCountUp(score, { durationMs: 1400 })
  const circ = 2 * Math.PI * 92
  return (
    <motion.div key="ride" {...enter} className="flex flex-col justify-between h-full">
      <div className="flex flex-col gap-3">
        <Kicker>RIDE OF THE WEEK</Kicker>
        <span style={{ ...heroStyle, fontSize: 40, lineHeight: 1.05, textShadow: 'none' }}>{r.title}</span>
      </div>
      <div className="flex justify-center">
        <div className="relative grid place-items-center" style={{ width: 210, height: 210 }}>
          <svg width="210" height="210" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
            <circle cx="105" cy="105" r="92" stroke="#FFFFFF26" strokeWidth="14" fill="none" />
            {r.score != null && (
              <circle cx="105" cy="105" r="92" stroke="#fff" strokeWidth="14" fill="none" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
                style={{ filter: 'drop-shadow(0 0 12px #FFD16699)', transition: 'stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)' }} />
            )}
          </svg>
          <div className="flex flex-col items-center">
            <span style={{ ...heroStyle, fontSize: 76, lineHeight: 0.9, textShadow: '0 0 26px rgba(255,194,75,0.7)' }}>{r.score != null ? scoreAnim : '—'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#FFFFFFCC' }}>{de ? 'RIDE SCORE' : 'RIDE SCORE'}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center">
          {([[String(Math.round(r.km)), 'km'], [r.tss.toString(), 'TSS'], [r.moving, de ? 'fahrend' : 'moving']] as const).map(([v, l], i) => (
            <div key={l} className="flex-1 flex flex-col items-center" style={{ borderLeft: i > 0 ? '1px solid #FFFFFF33' : 'none' }}>
              <span style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 22, color: '#fff' }}>{v}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#FFFFFFB3' }}>{l}</span>
            </div>
          ))}
        </div>
        <Glass>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFFE6', lineHeight: 1.4 }}>
            {r.score != null
              ? (de ? `Deine stärkste Fahrt der Woche — Top ${100 - r.score}% deiner bisherigen Ausfahrten.` : `Your standout ride of the week — top ${100 - r.score}% of every ride you've logged.`)
              : (de ? 'Deine stärkste Fahrt der Woche.' : "The week's standout ride.")}
          </span>
        </Glass>
      </div>
    </motion.div>
  )
}

function PeakCard({ w, de }: { w: Wrapped; de: boolean }) {
  const enter = useEnter()
  const p = w.peak_power!
  const maxW = Math.max(...p.comparison.map((c) => c.watts), 1)
  return (
    <motion.div key="peak" {...enter} className="flex flex-col justify-between h-full">
      <Kicker>YOUR BIGGEST MOMENT</Kicker>
      <div className="flex flex-col items-center gap-2.5">
        <div className="flex items-end gap-2">
          <CountNum value={p.watts} style={{ ...heroStyle, fontSize: 74, lineHeight: 0.9, textShadow: '0 0 26px rgba(255,176,32,0.7)' }} />
          <span style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 30, color: '#fff', paddingBottom: 14 }}>W</span>
        </div>
        {p.wkg != null && (
          <div className="rounded-full" style={{ background: '#FFFFFF26', padding: '7px 15px' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{p.wkg} W/kg</span>
          </div>
        )}
      </div>
      <Glass style={{ borderRadius: 20 }}>
        <div className="flex flex-col gap-2.5">
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#FFFFFFCC' }}>{p.watts} W {de ? 'KÖNNTE BETREIBEN…' : 'COULD RUN…'}</span>
          {p.comparison.map((c) => (
            <div key={c.key} className="flex items-center gap-2.5">
              <span className="shrink-0" style={{ width: 88, fontSize: 12, fontWeight: c.you ? 700 : 500, color: c.you ? '#fff' : '#FFFFFFCC' }}>{c.label}</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 9, background: '#FFFFFF1F' }}>
                <div className="rounded-full" style={{ height: 9, width: `${(c.watts / maxW) * 100}%`, background: c.you ? 'var(--color-accent)' : '#FFFFFFB3', boxShadow: c.you ? '0 0 12px #FF5A3C' : 'none' }} />
              </div>
              <span className="shrink-0 text-right" style={{ width: 48, fontFamily: 'Sora', fontSize: 12, fontWeight: 700, color: c.you ? 'var(--color-accent)' : '#FFFFFFB3' }}>{c.watts} W</span>
            </div>
          ))}
        </div>
      </Glass>
      <Glass>
        <span style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFFE6', lineHeight: 1.4 }}>
          {de ? 'Für ein paar Sekunden haben deine Beine fast alles im Haus überboten.' : 'For a few blazing seconds, your legs out-muscled almost everything in the house.'}
        </span>
      </Glass>
    </motion.div>
  )
}

function RecapCard({ w, de, onShare, sharing }: { w: Wrapped; de: boolean; onShare: () => void; sharing: boolean }) {
  const enter = useEnter()
  const rows: [string, string, string][] = [
    [de ? 'km gefahren' : 'km ridden', Math.round(w.totals.km).toLocaleString('de-DE'), '#FF7A4E'],
  ]
  if (w.elevation_m != null) rows.push([de ? 'Höhenmeter' : 'm climbed', w.elevation_m.toLocaleString('de-DE'), '#A98BFF'])
  rows.push([de ? 'im Sattel' : 'in the saddle', w.totals.saddle_hm, '#5B9CFF'])
  if (w.peak_power) rows.push([de ? 'Peak Power' : 'peak power', `${w.peak_power.watts.toLocaleString('de-DE')} W`, '#FFC24B'])
  if (w.best_ride?.score != null) rows.push([de ? 'Bestes Ride-Ergebnis' : 'best ride score', String(w.best_ride.score), '#2EE59D'])
  rows.push([de ? (w.zero_missed ? 'Fahrten, keine verpasst' : 'Fahrten') : (w.zero_missed ? 'rides, zero missed' : 'rides'), String(w.rides), '#FFFFFF'])
  return (
    <motion.div key="recap" {...enter} className="flex flex-col justify-between h-full">
      <div className="flex flex-col gap-3.5">
        <Kicker>THAT WAS YOUR WEEK</Kicker>
        <span style={{ ...heroStyle, fontSize: 40, lineHeight: 1.05, textShadow: 'none' }}>{de ? `${w.totals.active_days} Tage, voll gefahren.` : `${w.totals.active_days} days, fully sent.`}</span>
      </div>
      <div style={{ borderRadius: 24, background: '#FFFFFF14', border: '1px solid #FFFFFF2E', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', padding: '6px 18px' }}>
        {rows.map(([label, value, color], i) => (
          <div key={label} style={{ borderTop: i > 0 ? '1px solid #FFFFFF1A' : 'none' }} className="flex items-center justify-between" >
            <span style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFFD9', padding: '13px 0' }}>{label}</span>
            <span style={{ fontFamily: 'Sora', fontWeight: 800, fontSize: 24, color }}>{value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={(e) => { e.stopPropagation(); onShare() }}
          className="flex items-center justify-center gap-2 rounded-full" style={{ background: '#fff', padding: '16px 0', opacity: sharing ? 0.7 : 1 }}>
          <Share2 size={20} style={{ color: '#12081A' }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#12081A' }}>{sharing ? (de ? 'Teilen…' : 'Sharing…') : (de ? 'Woche teilen' : 'Share your week')}</span>
        </button>
        <span className="text-center" style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFFB3' }}>{de ? 'Bis nächsten Montag. 🚴' : 'See you next Monday. 🚴'}</span>
      </div>
    </motion.div>
  )
}

// ── Page shell ───────────────────────────────────────────────────────────────

export default function WeeklyWrapped() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  const [sharing, setSharing] = useState(false)
  const touchX = useRef<number | null>(null)

  const { data, isLoading } = useQuery<Wrapped>({
    queryKey: ['analytics', 'weekly-wrapped', locale],
    queryFn: async () => (await apiClient.get<Wrapped>(`/analytics/weekly-wrapped?locale=${locale}`)).data,
    staleTime: 60 * 60 * 1000,
  })

  // The deck — cards whose data is missing are dropped (honesty contract).
  const cards = useMemo(() => {
    if (!data) return [] as string[]
    const list = ['cover', 'distance']
    if (data.route && data.route.points.length >= 2) list.push('route')
    if (data.elevation_m != null) list.push('elevation')
    list.push('effort')
    if (data.best_ride) list.push('ride')
    if (data.peak_power) list.push('peak')
    list.push('recap')
    return list
  }, [data])

  const close = () => navigate('/dashboard?tab=today')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') advance(1)
      else if (e.key === 'ArrowLeft') advance(-1)
      else if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cards.length])

  const advance = (dir: 1 | -1) => {
    if (cards.length === 0) return
    const n = idx + dir
    if (n < 0) return
    if (n >= cards.length) { close(); return }
    setIdx(n)
  }

  const share = async () => {
    if (!data) return
    setSharing(true)
    const range = `${format(parseISO(data.week_start), 'd. MMM')}–${format(parseISO(data.week_end), 'd. MMM')}`
    const lines = [
      de ? `Meine Woche (${range}) 🚴` : `My week (${range}) 🚴`,
      `${Math.round(data.totals.km)} km · ${data.totals.saddle_hm} · ${data.totals.tss} TSS`,
      data.elevation_m != null ? `${data.elevation_m} ${de ? 'Höhenmeter' : 'm climbed'}` : '',
      data.peak_power ? `${de ? 'Peak' : 'Peak'} ${data.peak_power.watts} W` : '',
      data.best_ride?.score != null ? `${de ? 'Bestes Ride-Ergebnis' : 'Best ride score'} ${data.best_ride.score}` : '',
    ].filter(Boolean)
    const text = lines.join('\n')
    try {
      const blob = await renderShareImage(data, de, range)
      const file = blob ? new File([blob], `wrapped-${data.week_start}.png`, { type: 'image/png' }) : null
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (file && nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
      } else if (navigator.share) {
        await navigator.share({ text })
      } else if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `wrapped-${data.week_start}.png`; a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      /* user cancelled / not supported — silent */
    } finally {
      setSharing(false)
    }
  }

  if (isLoading || !data) {
    return <div className="min-h-screen grid place-items-center" style={{ background: '#0A0C0F' }}>
      <span style={{ color: '#9BA4AF', fontSize: 14 }}>{de ? 'Lädt…' : 'Loading…'}</span>
    </div>
  }

  if (!data.has_rides) {
    return (
      <div className="min-h-screen grid place-items-center p-8" style={{ background: '#0A0C0F' }}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span style={{ fontSize: 15, color: '#9BA4AF' }}>{de ? 'Letzte Woche war ruhig — dein Wrapped erscheint, sobald Fahrten da sind.' : 'Last week was quiet — your Wrapped appears once there are rides.'}</span>
          <button type="button" onClick={close} style={{ color: '#FF5A3C', fontWeight: 700, fontSize: 14 }}>{de ? 'Zurück zu Heute' : 'Back to Today'}</button>
        </div>
      </div>
    )
  }

  const kind = cards[idx]
  const sh = SHADERS[kind as keyof typeof SHADERS] ?? SHADERS.cover

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: '#0A0C0F', userSelect: 'none', maxWidth: 480, margin: '0 auto' }}
      onClick={(e) => { const x = (e as React.MouseEvent).clientX / (e.currentTarget as HTMLElement).clientWidth; advance(x < 0.32 ? -1 : 1) }}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 40) advance(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
    >
      {/* Animated WebGL background for the active card. */}
      <ShaderCanvas key={kind} variant={sh.variant} uniforms={sh.u} style={{ position: 'absolute', inset: 0 }} />

      {/* Foreground */}
      <div className="relative flex flex-col h-full" style={{ padding: '16px 24px 34px' }}>
        {/* Segmented progress */}
        <div className="flex gap-1.5">
          {cards.map((_, i) => (
            <span key={i} className="flex-1 rounded-full" style={{ height: 3, background: i <= idx ? '#fff' : '#FFFFFF3D' }} />
          ))}
        </div>
        <div className="flex justify-end pt-3">
          <button type="button" aria-label={de ? 'Schließen' : 'Close'} onClick={(e) => { e.stopPropagation(); close() }} className="grid place-items-center rounded-full" style={{ width: 34, height: 34, background: '#FFFFFF1F' }}>
            <X size={18} style={{ color: '#fff' }} />
          </button>
        </div>

        <div className="flex-1 min-h-0" style={{ paddingTop: 20, paddingBottom: 8 }}>
          {kind === 'cover' && <CoverCard w={data} de={de} onStart={() => advance(1)} />}
          {kind === 'distance' && <DistanceCard w={data} de={de} />}
          {kind === 'route' && <RouteCard w={data} de={de} />}
          {kind === 'elevation' && <ElevationCard w={data} de={de} />}
          {kind === 'effort' && <EffortCard w={data} de={de} />}
          {kind === 'ride' && <RideCard w={data} de={de} />}
          {kind === 'peak' && <PeakCard w={data} de={de} />}
          {kind === 'recap' && <RecapCard w={data} de={de} onShare={share} sharing={sharing} />}
        </div>
      </div>
    </div>
  )
}

// A 1080×1350 share card rendered on an offscreen canvas.
async function renderShareImage(w: Wrapped, de: boolean, range: string): Promise<Blob | null> {
  const c = document.createElement('canvas')
  c.width = 1080; c.height = 1350
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const g = ctx.createLinearGradient(0, 0, 1080, 1350)
  g.addColorStop(0, '#FF5A3C'); g.addColorStop(0.5, '#B14BFF'); g.addColorStop(1, '#2E6BFF')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1350)
  ctx.fillStyle = '#FFFFFFDD'
  ctx.font = '700 40px Sora, sans-serif'
  ctx.fillText((de ? 'MEINE WOCHE' : 'MY WEEK') + ` · ${range.toUpperCase()}`, 90, 150)
  ctx.fillStyle = '#fff'
  ctx.font = '800 190px Sora, sans-serif'
  ctx.fillText(`${Math.round(w.totals.km)}`, 88, 380)
  ctx.font = '700 70px Sora, sans-serif'
  ctx.fillText('km', 88 + ctx.measureText(`${Math.round(w.totals.km)}`).width + 30, 380)
  ctx.font = '600 54px Inter, sans-serif'
  const lines = [
    `${w.rides} ${de ? 'Fahrten' : 'rides'} · ${w.totals.saddle_hm}`,
    `${w.totals.tss} TSS`,
    w.elevation_m != null ? `${w.elevation_m} ${de ? 'Höhenmeter' : 'm climbed'}` : '',
    w.peak_power ? `${w.peak_power.watts} W ${de ? 'Peak' : 'peak'}` : '',
    w.best_ride?.score != null ? `${de ? 'Ride-Score' : 'Ride score'} ${w.best_ride.score}` : '',
  ].filter(Boolean)
  ctx.fillStyle = '#FFFFFFF0'
  lines.forEach((l, i) => ctx.fillText(l, 90, 560 + i * 96))
  ctx.fillStyle = '#fff'
  ctx.font = '700 44px Sora, sans-serif'
  ctx.fillText('Weekly Wrapped', 90, 1250)
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'))
}
