import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Gauge, Zap, Timer, TrendingUp, Bike, Flame, Mountain, Trophy } from 'lucide-react'
import { T, FONT, EASE, grow, band } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import './w3.css'

/**
 * W3 · 08 RIDES ("Rides") — 1:1 code rebuild of the `w3.pen` frame `zMKRG`.
 * Pure function of `vm`; `W3RidesPage` builds it from `useActivitiesRange`.
 *
 * REAL: the logged-rides count, the season distance total, the monthly-distance
 * bar chart, the AVG SPEED / AVG POWER / SADDLE TIME footer, and every ride card
 * (title, date, distance, speed, power, duration, route shape) come from the
 * athlete's own activities — honest "—" where a field is missing. FIXTURE: the
 * GOAL / OF-GOAL / KM-TO-GO / AHEAD-OF-PACE goal-tracking block — the app has no
 * season-goal model, so those are derived against a placeholder 12,000 km goal
 * and are marked `fixture:` in the Page. The ALL/OUTDOOR/INDOOR/RACE filter is a
 * real mechanic (outdoor = has a GPS track; race = title keyword).
 */

export type W3RideFilter = 'all' | 'outdoor' | 'indoor' | 'race'

export interface W3RideCard {
  id: number | null                 // real activity id → /e/w3-ride/:id
  title: string
  dateLabel: string                 // "TUE 12 AUG" (real)
  km: string                        // "40.34" | "—"
  speed: string                     // "31.5" | "—"
  power: string                     // "248" | "—"
  dur: string                       // "1:16" | "—"
  note: string | null               // real derived fact (elevation / TSS) | null
  indoor: boolean
  race: boolean
  recent: boolean                   // within the last 7 days
  polyline: [number, number][] | null
}

export interface W3RidesVm {
  title: string
  loggedLabel: string
  count: string                     // "142 rides" (real)
  seasonLabel: string
  totalKm: string                   // "4 812" (real)
  totalUnit: string
  ofGoalLabel: string
  bars: number[]                    // real, normalised 0..1 monthly distance
  barsAccentFrom: number            // index from which bars render acid
  avgSpeed: string                  // real | "—"
  avgPower: string                  // real | "—"
  saddleTime: string                // real | "—"
  rides: W3RideCard[]               // real; the View filters + groups
  // fixture: goal-tracking block (no season-goal model)
  goalChip: string
  ofGoalPct: string
  progress: number                  // 0..1
  toGoLabel: string
  paceLabel: string
  paceAhead: boolean
}

const FILTERS: { key: W3RideFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'outdoor', label: 'OUTDOOR' },
  { key: 'indoor', label: 'INDOOR' },
  { key: 'race', label: 'RACE' },
]

/** Normalise a GPS track into an SVG path within a 0..100 box, aspect-preserved. */
function pathFromPolyline(pts: [number, number][]): string {
  const lats = pts.map((p) => p[0])
  const lngs = pts.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const spanLat = Math.max(1e-6, maxLat - minLat)
  const spanLng = Math.max(1e-6, maxLng - minLng)
  const pad = 16
  const scale = (100 - 2 * pad) / Math.max(spanLat, spanLng)
  const offX = (100 - spanLng * scale) / 2
  const offY = (100 - spanLat * scale) / 2
  return pts
    .map((p, i) => {
      const x = offX + (p[1] - minLng) * scale
      const y = offY + (maxLat - p[0]) * scale // flip: north is up
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/** The per-ride thumbnail: an animated route trace for outdoor rides, a neutral
 *  glyph for indoor / trackless rides (never a fabricated line). */
/** Small corner glyph on the thumbnail: a trophy for races, an indoor mark for
 *  trackless rides — a quick sport read without inventing data. */
function ThumbBadge({ ride, accent }: { ride: W3RideCard; accent: boolean }) {
  if (!ride.race && !ride.indoor) return null
  const Icon = ride.race ? Trophy : Bike
  const acid = ride.race || accent
  return (
    <div style={{
      position: 'absolute', top: 5, left: 5, width: 20, height: 20, borderRadius: 7,
      display: 'grid', placeItems: 'center',
      background: acid ? T.acid : '#000000A6', backdropFilter: 'blur(2px)',
    }}>
      <Icon size={11} color={acid ? T.bg : T.d4} strokeWidth={2.4} />
    </div>
  )
}

function RideThumb({ ride, accent, reduce, delay }: { ride: W3RideCard; accent: boolean; reduce: boolean | null; delay: number }) {
  const stroke = accent ? T.acid : T.d4
  const box = { position: 'relative' as const, width: 70, height: 70, flex: 'none' as const, borderRadius: 18, background: T.surface2, display: 'grid', placeItems: 'center', overflow: 'hidden', border: `1px solid ${accent ? T.acid + '33' : T.rule}` }
  if (ride.polyline && ride.polyline.length > 1) {
    return (
      <div style={box}>
        <svg viewBox="0 0 100 100" width={70} height={70} style={{ display: 'block' }}>
          <motion.path
            d={pathFromPolyline(ride.polyline)} fill="none" stroke={stroke} strokeWidth={5}
            strokeLinejoin="round" strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay }}
          />
        </svg>
        <ThumbBadge ride={ride} accent={accent} />
      </div>
    )
  }
  // Indoor / no GPS — neutral placeholder, honest about the missing track.
  return (
    <div style={box}>
      <motion.div
        initial={reduce ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={grow(delay)}
        style={{ display: 'grid', placeItems: 'center' }}>
        <Bike size={28} color={T.d4} strokeWidth={1.6} />
      </motion.div>
      <ThumbBadge ride={ride} accent={accent} />
    </div>
  )
}

/** Read the Page's real secondary fact: "142 TSS" → a training-load bar,
 *  "620 m climbed" → an elevation note. Never fabricates a number. */
function parseLoad(note: string | null): { tss: number | null; climb: string | null } {
  if (!note) return { tss: null, climb: null }
  const m = note.match(/^(\d+)\s*TSS$/i)
  if (m) return { tss: parseInt(m[1], 10), climb: null }
  return { tss: null, climb: note }
}

/** Subtle training-load bar off the ride's real TSS (capped at ~220 = a big day). */
function LoadBar({ tss, accent }: { tss: number; accent: boolean }) {
  const pct = Math.max(0.06, Math.min(1, tss / 220))
  const fill = accent ? T.acid : tss >= 150 ? T.acid : tss >= 80 ? T.acidDeep : T.cool
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Flame size={12} color={fill} strokeWidth={2.2} style={{ flex: 'none' }} />
      <div style={{ flex: 1, height: 4, borderRadius: 100, background: '#FFFFFF12', overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', borderRadius: 100, background: fill }} />
      </div>
      <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: accent ? T.acid : T.mid }}>{tss} <span style={{ color: T.quiet }}>TSS</span></span>
    </div>
  )
}

/** One of the three metric icons in the ride row / season footer. */
const STAT = {
  speed: { Icon: Gauge, color: T.cool },
  power: { Icon: Zap, color: T.evening },
  time: { Icon: Timer, color: T.training },
} as const

function StatChip({ kind, value, unit }: { kind: keyof typeof STAT; value: string; unit?: string }) {
  const { Icon, color } = STAT[kind]
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <Icon size={14} color={value === '—' ? T.quiet : color} strokeWidth={2} />
      <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, color: value === '—' ? T.quiet : T.ink }}>{value}</span>
      {unit && value !== '—' && <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{unit}</span>}
    </span>
  )
}

function RideRow({ ride, accent, reduce, index, onOpen }: { ride: W3RideCard; accent: boolean; reduce: boolean | null; index: number; onOpen: () => void }) {
  const tappable = ride.id != null
  const { tss, climb } = parseLoad(ride.note)
  return (
    <motion.button
      onClick={tappable ? onOpen : undefined} disabled={!tappable}
      initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: index * 0.05 }}
      style={{
        display: 'flex', gap: 15, alignItems: 'stretch', width: '100%', textAlign: 'left', fontFamily: FONT,
        padding: 18, borderRadius: 24, background: T.surface, cursor: tappable ? 'pointer' : 'default',
        border: `1.5px solid ${accent ? T.acid : T.rule}`,
        boxShadow: accent ? `0 0 26px ${T.acid}24` : 'none',
      }}>
      <RideThumb ride={ride} accent={accent} reduce={reduce} delay={index * 0.05 + 0.1} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ride.title}</span>
          <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: 0.7, color: T.quiet, padding: '4px 8px', borderRadius: 100, background: T.surface2 }}>{ride.dateLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.2, lineHeight: 0.9, color: ride.km === '—' ? T.quiet : T.acid }}>{ride.km}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, paddingBottom: 2 }}>km</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 13, alignItems: 'center' }}>
            <StatChip kind="speed" value={ride.speed} />
            <StatChip kind="power" value={ride.power} />
            <StatChip kind="time" value={ride.dur} />
          </div>
        </div>
        {tss != null ? (
          <LoadBar tss={tss} accent={accent} />
        ) : climb ? (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <Mountain size={12} color={accent ? T.acid : T.mid} strokeWidth={2} style={{ flex: 'none' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: accent ? T.acid : T.mid }}>{climb}</span>
          </div>
        ) : null}
      </div>
    </motion.button>
  )
}

export default function W3RidesView({ vm }: { vm: W3RidesVm }) {
  const reduce = useReducedMotion()
  const nav = useNavigate()
  const [filter, setFilter] = useState<W3RideFilter>('all')

  const shown = useMemo(() => vm.rides.filter((r) => {
    if (filter === 'outdoor') return !r.indoor
    if (filter === 'indoor') return r.indoor
    if (filter === 'race') return r.race
    return true
  }), [vm.rides, filter])

  const recent = shown.filter((r) => r.recent)
  const earlier = shown.filter((r) => !r.recent)
  const maxBar = Math.max(...vm.bars, 0.001)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        <W3StatusBar />

        {/* Header */}
        <div style={{ ...band(0), padding: '14px 20px 18px', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.6, lineHeight: 1, color: T.ink }}>{vm.title}</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>{vm.loggedLabel}</span>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{vm.count}</span>
          </div>
        </div>

        {/* Filter chips (real) */}
        <div style={{ ...band(24), flexDirection: 'row', gap: 8 }}>
          {FILTERS.map(({ key, label }) => {
            const on = filter === key
            return (
              <button key={key} onClick={() => setFilter(key)}
                style={{ flex: 'none', padding: '9px 16px', borderRadius: 100, border: 0, cursor: 'pointer', fontFamily: FONT,
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                  background: on ? T.acid : T.surface, color: on ? T.bg : T.mid }}>
                {label}
              </button>
            )
          })}
        </div>

        {/* Season total card (distance REAL · goal FIXTURE) */}
        <div style={{ ...band(30) }}>
          <div style={{ borderRadius: 24, background: T.surface, border: `1px solid ${T.rule}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.3, color: T.quiet }}>{vm.seasonLabel}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.mid, padding: '6px 12px', borderRadius: 100, background: T.surface2 }}>{vm.goalChip}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <motion.span
                  initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
                  style={{ fontSize: 64, fontWeight: 700, letterSpacing: -3, lineHeight: 0.9, color: T.acid }}>{vm.totalKm}</motion.span>
                <span style={{ fontSize: 20, fontWeight: 700, color: T.mid }}>{vm.totalUnit}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>{vm.ofGoalLabel}</span>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.acid }}>{vm.ofGoalPct}</span>
              </div>
            </div>

            {/* progress (fixture: real km against a placeholder goal) */}
            <div style={{ position: 'relative', height: 6, borderRadius: 100, background: '#FFFFFF14', overflow: 'visible' }}>
              <motion.div
                initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(vm.progress * 100)}%` }} transition={grow(0.05)}
                style={{ position: 'relative', height: '100%', borderRadius: 100, background: T.acid }}>
                <div style={{ position: 'absolute', right: -1, top: -3, width: 3, height: 12, borderRadius: 2, background: T.ink }} />
              </motion.div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>{vm.toGoLabel}</span>
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: vm.paceAhead ? T.acid : T.warn }}>
                <TrendingUp size={13} color={vm.paceAhead ? T.acid : T.warn} style={{ transform: vm.paceAhead ? 'none' : 'scaleY(-1)' }} />
                {vm.paceLabel}
              </span>
            </div>

            {/* monthly distance bars (real) */}
            <div style={{ display: 'flex', gap: 6, height: 70, alignItems: 'flex-end', paddingTop: 4 }}>
              {vm.bars.map((b, i) => {
                const on = i >= vm.barsAccentFrom
                return (
                  <motion.div key={i}
                    initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                    transition={grow(i * 0.03)}
                    style={{ flex: 1, height: `${Math.max(8, Math.round((b / maxBar) * 100))}%`, transformOrigin: 'bottom', borderRadius: 4,
                      background: on ? T.acid : '#2C2C2C', boxShadow: on ? `0 0 12px ${T.acid}40` : 'none' }} />
                )
              })}
            </div>
            <div style={{ height: 1, background: T.rule }} />

            {/* season footer stats (real) */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {[
                { k: 'speed' as const, l: 'AVG SPEED', v: vm.avgSpeed, u: 'km/h' },
                { k: 'power' as const, l: 'AVG POWER', v: vm.avgPower, u: 'w' },
                { k: 'time' as const, l: 'SADDLE TIME', v: vm.saddleTime, u: 'h' },
              ].map((s) => (
                <div key={s.l} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{s.l}</span>
                  <StatChip kind={s.k} value={s.v} unit={s.u} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ride groups (real) */}
        {shown.length === 0 && (
          <div style={{ ...band(30) }}>
            <div style={{ padding: '26px 20px', borderRadius: 24, background: T.surface, textAlign: 'center', color: T.quiet, fontSize: 12.5, fontWeight: 600 }}>
              No rides in this filter yet.
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div style={{ ...band(28), gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 2 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>PAST 7 DAYS</span>
              <div style={{ flex: 1, height: 1, background: T.rule }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: T.quiet }}>{recent.length}</span>
            </div>
            {recent.map((r, i) => (
              <RideRow key={r.id ?? `r${i}`} ride={r} accent={i === 0} reduce={reduce} index={i}
                onOpen={() => r.id != null && nav(`/e/w3-ride/${r.id}`)} />
            ))}
          </div>
        )}

        {earlier.length > 0 && (
          <div style={{ ...band(34), gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 2 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>EARLIER</span>
              <div style={{ flex: 1, height: 1, background: T.rule }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: T.quiet }}>{earlier.length}</span>
            </div>
            {earlier.map((r, i) => (
              <RideRow key={r.id ?? `e${i}`} ride={r} accent={false} reduce={reduce} index={i}
                onOpen={() => r.id != null && nav(`/e/w3-ride/${r.id}`)} />
            ))}
          </div>
        )}

        <W3TabBar />

      </div>
    </div>
  )
}
