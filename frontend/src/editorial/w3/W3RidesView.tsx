import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { updateGoals } from '../../api/athletes'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { motion, useReducedMotion } from 'motion/react'
import { Gauge, Zap, Timer, Bike, Trophy, ChevronRight } from 'lucide-react'
import { T, FONT, EASE, grow, band, DASH } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3RidesDock from './W3RidesDock'
import { useHeroPanel } from './W3HeroShell'
import { useDockOpenness } from './useDockOpenness'
import { useActivityRhythm } from '../../hooks/useActivityRhythm'
import W3TopBar from './W3TopBar'
import './w3.css'

/**
 * W3 · 08 RIDES ("Rides") — 1:1 code rebuild of the `w3.pen` frame `zMKRG`.
 * Pure function of `vm`; `W3RidesPage` builds it from `useActivitiesRange`.
 *
 * REAL: the logged-rides count, the season distance total, the monthly-distance
 * bar chart, the AVG SPEED / AVG POWER / SADDLE TIME footer, and every ride card
 * (title, date, distance, speed, power, duration, route shape) come from the
 * athlete's own activities — honest "—" where a field is missing. The goal
 * block renders only against the rider's own `goals.season_km_goal`; without
 * one the dock invites instead of measuring. The ALL/OUTDOOR/INDOOR/RACE
 * filter is a real mechanic (outdoor = has a GPS track; race = title keyword).
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
  /** The same twelve months, in the units a tapped bar has to speak. */
  barMonths: { km: number; label: string; year: number }[]
  barsAccentFrom: number            // index from which bars render acid
  avgSpeed: string                  // real | "—"
  avgPower: string                  // real | "—"
  saddleTime: string                // real | "—"
  rides: W3RideCard[]               // real; the View filters + groups
  /** A record that fell within the last 7 days — announced at the top of the
   *  archive instead of silently changing a row. Null on most days. */
  prAnnounce?: { title: string; sub: string; id: number } | null
  /** The rider's own season goal, or null → the dock renders the set-a-goal
   *  invitation instead. Never a placeholder target. */
  goal: {
    chip: string
    ofGoalPct: string
    progress: number                // 0..1
    toGoLabel: string
    paceLabel: string
    paceAhead: boolean
  } | null
}

const FILTERS: { key: W3RideFilter; label: string }[] = [
  { key: 'all', label: 'ALLE' },
  { key: 'outdoor', label: 'OUTDOOR' },
  { key: 'indoor', label: 'INDOOR' },
  { key: 'race', label: 'RENNEN' },
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

/** One of the three metric icons in the ride row / season footer. Icons render
 *  in a uniform, subtle ink so the acid distance stays the card's one hero — the
 *  pen `RideRow` treatment (not three competing colours). */
const STAT = {
  speed: { Icon: Gauge },
  power: { Icon: Zap },
  time: { Icon: Timer },
} as const

function StatChip({ kind, value, unit }: { kind: keyof typeof STAT; value: string; unit?: string }) {
  const { Icon } = STAT[kind]
  const dim = value === '—'
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
      <Icon size={13} color={dim ? T.quiet : T.mid} strokeWidth={2} style={{ flex: 'none' }} />
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: dim ? T.quiet : T.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      {unit && !dim && <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{unit}</span>}
    </span>
  )
}

/** One ride card. Two tiers, so nothing ever competes for the same line at 390:
 *  a head (route thumb · date kicker · title · the acid distance hero) and, under
 *  a hairline, a full-width three-column stat strip. Every flex child carries
 *  `minWidth: 0`, so a long title or a four-digit metric truncates instead of
 *  overrunning the card. The acid distance is the card's only hero. */
function RideRow({ ride, accent, reduce, index, onOpen }: { ride: W3RideCard; accent: boolean; reduce: boolean | null; index: number; onOpen: () => void }) {
  const tappable = ride.id != null
  const noKm = ride.km === '—'
  const stats = [
    { key: 'speed' as const, value: ride.speed, unit: 'km/h' },
    { key: 'power' as const, value: ride.power, unit: 'w' },
    { key: 'time' as const, value: ride.dur, unit: 'h' },
  ]
  return (
    <motion.button
      onClick={tappable ? onOpen : undefined} disabled={!tappable}
      initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: index * 0.05 }}
      style={{
        display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minWidth: 0, textAlign: 'left', fontFamily: FONT,
        padding: 16, borderRadius: 22, overflow: 'hidden', cursor: tappable ? 'pointer' : 'default',
        background: accent ? `linear-gradient(180deg, ${T.acidTop}, ${T.surface} 62%)` : T.surface,
        border: `1px solid ${accent ? T.acid + '33' : T.rule}`,
      }}>

      {/* Head — route trace, identity, and the one hero number */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', width: '100%', minWidth: 0 }}>
        <RideThumb ride={ride} accent={accent} reduce={reduce} delay={index * 0.05 + 0.1} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ minWidth: 0, fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ride.dateLabel}</span>
            {tappable && <ChevronRight size={14} color={T.d2} strokeWidth={2.5} style={{ flex: 'none', marginLeft: 'auto' }} />}
          </div>
          <span style={{ minWidth: 0, fontSize: 15.5, fontWeight: 700, letterSpacing: -0.35, lineHeight: 1.15, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ride.title}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.4, lineHeight: 0.92, color: noKm ? T.quiet : T.acid, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ride.km}</span>
            {!noKm && <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, color: T.quiet }}>km</span>}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: T.rule }} />

      {/* Stat strip — full card width (318 at 390), so the metrics never crowd
          the hero. Three equal minmax(0,1fr) columns: they cannot overflow. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center', minWidth: 0 }}>
        {stats.map((s, i) => (
          <div key={s.key} style={{ minWidth: 0, paddingLeft: i === 0 ? 0 : 12, borderLeft: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
            <StatChip kind={s.key} value={s.value} unit={s.unit} />
          </div>
        ))}
      </div>

      {ride.note && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: 100, flex: 'none', background: accent ? T.acid : T.quiet }} />
          <span style={{ minWidth: 0, fontSize: 11.5, fontWeight: 600, color: T.mid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ride.note}</span>
        </div>
      )}
    </motion.button>
  )
}

export default function W3RidesView({ vm }: { vm: W3RidesVm }) {
  const reduce = useReducedMotion()
  const nav = useNavigate()
  const [filter, setFilter] = useState<W3RideFilter>('all')
  const [goalSheet, setGoalSheet] = useState(false)
  const [earlierShown, setEarlierShown] = useState(12)
  const openness = useDockOpenness()
  // The three windows the dock zooms between. Undefined until it lands, and
  // the dock keeps its season behaviour until then rather than blanking.
  const { data: rhythm } = useActivityRhythm()

  const shown = useMemo(() => vm.rides.filter((r) => {
    if (filter === 'outdoor') return !r.indoor
    if (filter === 'indoor') return r.indoor
    if (filter === 'race') return r.race
    return true
  }), [vm.rides, filter])

  const recent = shown.filter((r) => r.recent)
  const earlier = shown.filter((r) => !r.recent)

  // ── THE PANEL ─────────────────────────────────────────────────────────────
  // The season's distance, over the same floor the bike stands on. The season
  // card used to carry this number at 64px in the middle of a scrolling page;
  // up here it is the first thing on the screen, which is what it always was.
  const dock = (
    <W3RidesDock vm={{
      totalKm: vm.totalKm || null,
      totalUnit: vm.totalUnit,
      goal: vm.goal,
      onSetGoal: () => setGoalSheet(true),
      bars: vm.bars,
      rhythm,
      barMonths: vm.barMonths,
      barsAccentFrom: vm.barsAccentFrom,
      stats: [
        { label: 'Ø TEMPO', value: vm.avgSpeed === DASH ? null : vm.avgSpeed, unit: 'km/h' },
        { label: 'Ø LEISTUNG', value: vm.avgPower === DASH ? null : vm.avgPower, unit: 'W' },
        { label: 'SATTELZEIT', value: vm.saddleTime === DASH ? null : vm.saddleTime, unit: 'h' },
      ],
      expand: openness,
    }} />
  )
  const { inShell, portal } = useHeroPanel(dock)

  // ── THE CONTENT ───────────────────────────────────────────────────────────
  // Everything the screen had, minus the five figures that moved into the
  // panel. Nothing was dropped: the count, the filters, the monthly bars and
  // both ride groups are all still here, in the same order.
  const content = (
    <>
      <div style={{ ...band(0), padding: '18px 20px 16px', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1, color: T.ink }}>{vm.title}</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>{vm.loggedLabel}</span>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{vm.count}</span>
        </div>
      </div>

      {/* ── A record that just fell ──────────────────────────────────────
          One glow, at the top, only in the week it happened — the archive's
          job is to say "you got better" out loud when it is true. */}
      {vm.prAnnounce && (
        <div style={{ ...band(20) }}>
          <motion.button type="button"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            onClick={() => vm.prAnnounce && nav(`/e/w3-ride/${vm.prAnnounce.id}`)}
            style={{
              width: '100%', border: 0, textAlign: 'left', cursor: 'pointer', fontFamily: FONT,
              borderRadius: 20, padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 13,
              background: T.surface, boxShadow: `0 0 26px ${T.acid}1F`,
            }}>
            <div style={{ flex: 'none', width: 38, height: 38, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}>
              <Trophy size={17} color={T.acid} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, color: T.acid }}>{vm.prAnnounce.title}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid, lineHeight: 1.4 }}>{vm.prAnnounce.sub}</span>
            </div>
            <ChevronRight size={16} color={T.quiet} />
          </motion.button>
        </div>
      )}

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

      {/* The monthly bars used to live here as a card of their own. They are IN
          the panel now, opened by the same scroll that opens everything else —
          they are not a second subject, they are the season figure spread over
          twelve months, and up there they can be tapped. */}

      {/* Ride groups (real) */}
      {shown.length === 0 && (
        <div style={{ ...band(30) }}>
          <div style={{ padding: '26px 20px', borderRadius: 24, background: T.surface, textAlign: 'center', color: T.quiet, fontSize: 12.5, fontWeight: 600 }}>
            Noch keine Fahrten in diesem Filter.
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ ...band(28), gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 2 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>LETZTE 7 TAGE</span>
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
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>FRÜHER</span>
            <div style={{ flex: 1, height: 1, background: T.rule }} />
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: T.quiet }}>{earlier.length}</span>
          </div>
          {earlier.slice(0, earlierShown).map((r, i) => (
            <RideRow key={r.id ?? `e${i}`} ride={r} accent={false} reduce={reduce} index={Math.min(i, 13)}
              onOpen={() => r.id != null && nav(`/e/w3-ride/${r.id}`)} />
          ))}
          {/* No wall at ride 14 any more: the whole year is here, revealed in
              pages so the first paint stays light. */}
          {earlier.length > earlierShown && (
            <button type="button" onClick={() => setEarlierShown((n) => n + 30)}
              style={{
                height: 48, borderRadius: 100, border: 0, background: T.surface,
                color: T.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
              }}>
              Alle {earlier.length} anzeigen · {earlier.length - earlierShown} weitere
            </button>
          )}
        </div>
      )}
    </>
  )

  const sheet = goalSheet ? <SeasonGoalSheet onClose={() => setGoalSheet(false)} /> : null

  if (inShell) return <>{portal}{content}{sheet}</>

  // Outside the room — a preview route, or a deep link that skipped it — the
  // screen still draws its own frame, with the panel where the hero would be.
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3TopBar />
        <div style={{ ...band(0), padding: '10px 16px 4px' }}>{dock}</div>
        {content}
        <W3TabBar />
        {sheet}
      </div>
    </div>
  )
}

/** The season-goal editor: one number, the rider's own. Writes
 *  `goals.season_km_goal` via PUT /athletes/me/goals and refreshes the
 *  profile, so the dock's meter fills against a target somebody actually set.
 *  "Entfernen" sends 0, which clears the key server-side. */
function SeasonGoalSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: profile } = useAthleteProfile()
  const existing = profile?.goals?.season_km_goal ?? null
  const [km, setKm] = useState(existing ?? 5000)
  const [busy, setBusy] = useState(false)
  const save = async (value: number) => {
    if (busy) return
    setBusy(true)
    try {
      await updateGoals({ season_km_goal: value })
      await qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      onClose()
    } finally { setBusy(false) }
  }
  const STEP = 500
  return (
    <div role="dialog" aria-label="Saisonziel"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: `${T.bg}CC`, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: T.surface, borderRadius: '24px 24px 0 0',
          padding: '22px 20px calc(20px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT,
        }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Dein Saisonziel</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.quiet, lineHeight: 1.4 }}>
          Kilometer in den letzten 12 Monaten. Das Ziel gehört dir — der Zähler misst nur dagegen, wenn du eins setzt.
        </span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <button type="button" aria-label="Weniger" onClick={() => setKm((v) => Math.max(STEP, v - STEP))}
            style={{ width: 44, height: 44, borderRadius: 100, border: 0, background: T.surface2, color: T.ink, fontSize: 22, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1, color: T.acid, fontVariantNumeric: 'tabular-nums', minWidth: 130, textAlign: 'center' }}>
            {km.toLocaleString('de-DE')} km
          </span>
          <button type="button" aria-label="Mehr" onClick={() => setKm((v) => Math.min(50_000, v + STEP))}
            style={{ width: 44, height: 44, borderRadius: 100, border: 0, background: T.surface2, color: T.ink, fontSize: 22, cursor: 'pointer' }}>+</button>
        </div>
        <button type="button" disabled={busy} onClick={() => void save(km)}
          style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontSize: 15.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: FONT, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Speichere…' : 'Ziel speichern'}
        </button>
        {existing != null && (
          <button type="button" disabled={busy} onClick={() => void save(0)}
            style={{ height: 40, borderRadius: 100, border: 0, background: 'none', color: T.quiet, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            Ziel entfernen
          </button>
        )}
      </div>
    </div>
  )
}
