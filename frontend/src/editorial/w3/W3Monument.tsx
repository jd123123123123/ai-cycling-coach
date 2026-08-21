import { motion, useReducedMotion } from 'motion/react'
import { Bike, Flame, Gauge as GaugeIcon, Mountain, Route as RouteIcon, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'

/**
 * W3 · MONUMENTS — a lifetime number, drawn as the thing it measures.
 *
 * The profile had every figure in the same rounded box with the same bar under
 * it, and a page where seven different achievements wear one uniform says none
 * of them is worth a second look. Sameness is not consistency; it is the
 * absence of an idea about what each number IS.
 *
 * So the FORM comes from the meaning, and only the material is shared:
 *
 *   distance   an ORBIT      — a journey that loops the planet, so it is an arc
 *   elevation  a COLUMN      — the only vertical number here, drawn vertically
 *   speed      a DIAL        — a rate, which has meant a needle for a century
 *   rides      a TALLY       — discrete events, so discrete marks, one each
 *   time       DAY TICKS     — duration as the days it actually adds up to
 *   longest    TWO RULES     — a record only means something NEXT TO the norm
 *   calories   A RATION      — an abstract number in a countable unit
 *
 * What holds them together is the W3 grammar, not the shape: one tile tone, one
 * accent, a big tabular figure, a small uppercase kicker, and a story line in
 * a unit a person owns. Nothing is decorative — every mark drawn is a real
 * proportion of a real quantity, or it is not drawn.
 */

const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'

export type W3Monument =
  | { kind: 'orbit'; label: string; value: string; unit: string; story: string; note: string; laps: number }
  | { kind: 'column'; label: string; value: string; unit: string; story: string; note: string; everest: number }
  | { kind: 'dial'; label: string; value: string; unit: string; story: string; note: string; kmh: number }
  | { kind: 'tally'; label: string; value: string; unit: string; story: string; note: string; into: number; step: number }
  | { kind: 'days'; label: string; value: string; unit: string; story: string; note: string; days: number }
  | { kind: 'rules'; label: string; value: string; unit: string; story: string; note: string; longestKm: number; avgKm: number }
  | { kind: 'ration'; label: string; value: string; unit: string; story: string; note: string; pizzas: number }

const ICON: Record<W3Monument['kind'], LucideIcon> = {
  orbit: RouteIcon, column: Mountain, dial: GaugeIcon,
  tally: Bike, days: Timer, rules: RouteIcon, ration: Flame,
}

/** The shared shell: kicker, figure, story, then whatever this one draws. */
function Shell({ m, tall, children }: { m: W3Monument; tall?: boolean; children: React.ReactNode }) {
  const Icon = ICON[m.kind]
  const missing = m.value === DASH
  return (
    <div style={{
      width: '100%', minWidth: 0, borderRadius: 24, background: T.tile,
      padding: '16px 17px 17px', display: 'flex', flexDirection: 'column',
      gap: 12, fontFamily: FONT, height: tall ? '100%' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ flex: 'none', width: 28, height: 28, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}>
          <Icon size={14} color={T.acid} />
        </span>
        <span style={{ minWidth: 0, fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {m.label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
        <span style={{
          fontFamily: ARCHIVO, fontSize: 34, fontWeight: 700, letterSpacing: -1.4, lineHeight: 0.9,
          color: missing ? T.quiet : T.ink, fontVariantNumeric: 'tabular-nums',
        }}>{m.value}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.mid }}>{m.unit}</span>
      </div>

      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: -0.1, color: T.acid, lineHeight: 1.3 }}>
        {m.story}
      </span>

      {!missing && <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>{children}</div>}
      {!missing && m.note && (
        <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet, lineHeight: 1.3 }}>{m.note}</span>
      )}
    </div>
  )
}

/** DISTANCE — an arc, because the story is laps of a planet. The ring shows the
 *  current lap; completed laps are pips outside it, so a rider who has been
 *  round twice can SEE that they have. */
function Orbit({ laps, reduce }: { laps: number; reduce: boolean | null }) {
  const done = Math.floor(laps)
  const frac = Math.max(0, Math.min(1, laps % 1))
  const R = 46
  const C = 2 * Math.PI * R
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={112} height={112} viewBox="0 0 112 112" style={{ flex: 'none' }}>
        <circle cx={56} cy={56} r={R} fill="none" stroke={T.d1} strokeWidth={7} />
        <motion.circle
          cx={56} cy={56} r={R} fill="none" stroke={T.acid} strokeWidth={7} strokeLinecap="round"
          transform="rotate(-90 56 56)"
          initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
          animate={{ strokeDasharray: `${frac * C} ${C}` }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
        <text x={56} y={52} textAnchor="middle" fontFamily={ARCHIVO} fontSize={22} fontWeight={700} fill={T.ink}>
          {Math.round(frac * 100)}%
        </text>
        <text x={56} y={68} textAnchor="middle" fontFamily={FONT} fontSize={8} fontWeight={700} letterSpacing={1} fill={T.quiet}>
          RUNDE {done + 1}
        </text>
      </svg>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>ERDUMRUNDUNGEN</span>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {Array.from({ length: Math.max(1, done + 1) }, (_, i) => (
            <span key={i} style={{
              width: 13, height: 13, borderRadius: 100,
              background: i < done ? T.acid : 'transparent',
              border: i < done ? 'none' : `1.5px dashed ${T.d2}`,
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** ELEVATION — the one number here whose meaning is up. Drawn up, with a tick
 *  at every Mount Everest, so the comparison is a MEASUREMENT and not a phrase. */
function Column({ everest, reduce }: { everest: number; reduce: boolean | null }) {
  const marks = Math.min(12, Math.max(1, Math.ceil(everest)))
  const H = 108
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 13, height: H }}>
      <div style={{ position: 'relative', width: 22, height: H, borderRadius: 5, background: T.d1, overflow: 'hidden' }}>
        <motion.div
          initial={reduce ? false : { height: 0 }}
          animate={{ height: `${Math.min(100, (everest / marks) * 100)}%` }}
          transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: 5,
            background: `linear-gradient(180deg, ${T.acidLite}, ${T.acid} 45%, ${T.acidDeep})`,
          }} />
      </div>
      <div style={{ position: 'relative', height: H, flex: 1, minWidth: 0 }}>
        {Array.from({ length: marks }, (_, i) => (
          <span key={i} style={{
            position: 'absolute', left: 0, right: 0, bottom: `${((i + 1) / marks) * 100}%`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 10, height: 1, background: T.d2 }} />
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: T.quiet, whiteSpace: 'nowrap' }}>
              {i + 1}× EVEREST
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** SPEED — a rate. A needle on a scale is what a rate has looked like for a
 *  hundred years, and borrowing that costs nothing and reads instantly. */
function Dial({ kmh, reduce }: { kmh: number; reduce: boolean | null }) {
  const MAX = 45
  const frac = Math.max(0, Math.min(1, kmh / MAX))
  const a = Math.PI * (1 - frac)                 // 180° sweep, left → right
  const R = 46
  const cx = 56, cy = 54
  const arc = (from: number, to: number) => {
    const p = (ang: number) => [cx + R * Math.cos(ang), cy - R * Math.sin(ang)]
    const [x0, y0] = p(from), [x1, y1] = p(to)
    return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width={112} height={72} viewBox="0 0 112 72">
        <path d={arc(Math.PI, 0)} fill="none" stroke={T.d1} strokeWidth={7} strokeLinecap="round" />
        <motion.path
          d={arc(Math.PI, a)} fill="none" stroke={T.acid} strokeWidth={7} strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
        {/* the needle */}
        <motion.line
          x1={cx} y1={cy} x2={cx + (R - 9) * Math.cos(a)} y2={cy - (R - 9) * Math.sin(a)}
          stroke={T.ink} strokeWidth={2.5} strokeLinecap="round"
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }} />
        <circle cx={cx} cy={cy} r={4} fill={T.ink} />
        <text x={10} y={68} fontFamily={FONT} fontSize={8} fontWeight={700} fill={T.quiet}>0</text>
        <text x={95} y={68} fontFamily={FONT} fontSize={8} fontWeight={700} fill={T.quiet}>{MAX}</text>
      </svg>
    </div>
  )
}

/** RIDES — discrete events get discrete marks. One dot is one ride toward the
 *  next round number, so the row fills as the rider rides. */
function Tally({ into, step, reduce }: { into: number; step: number; reduce: boolean | null }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {Array.from({ length: step }, (_, i) => (
        <motion.span key={i}
          initial={reduce ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.24, delay: reduce ? 0 : i * 0.006 }}
          style={{
            width: 8, height: 8, borderRadius: 2,
            background: i < into ? T.acid : T.d1,
          }} />
      ))}
    </div>
  )
}

/** SADDLE TIME — hours are abstract; days are not. One tick per whole day. */
function DayTicks({ days, reduce }: { days: number; reduce: boolean | null }) {
  const shown = Math.min(120, days)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-end' }}>
      {Array.from({ length: shown }, (_, i) => (
        <motion.span key={i}
          initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
          transition={{ duration: 0.28, delay: reduce ? 0 : i * 0.005 }}
          style={{
            width: 3, height: 15, borderRadius: 2, transformOrigin: 'bottom',
            // Every seventh tick is a full week — the eye finds the rhythm and
            // the count stops being a wall of identical marks.
            background: (i + 1) % 7 === 0 ? T.acidLite : T.acid,
            opacity: (i + 1) % 7 === 0 ? 1 : 0.72,
          }} />
      ))}
      {days > shown && (
        <span style={{ fontSize: 9, fontWeight: 700, color: T.quiet, paddingLeft: 4 }}>+{days - shown}</span>
      )}
    </div>
  )
}

/** LONGEST — a record is meaningless alone. Two rules to scale: the big day
 *  against the ordinary one, and the ratio between them read off the picture. */
function Rules({ longestKm, avgKm, reduce }: { longestKm: number; avgKm: number; reduce: boolean | null }) {
  const ratio = avgKm > 0 ? Math.max(0.02, Math.min(1, avgKm / longestKm)) : 0
  const Row = ({ w, colour, label, delay }: { w: number; colour: string; label: string; delay: number }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ height: 8, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
        <motion.div
          initial={reduce ? false : { width: 0 }} animate={{ width: `${w * 100}%` }}
          transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: '100%', borderRadius: 100, background: colour }} />
      </div>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{label}</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Row w={1} colour={T.acid} label="DEIN GRÖSSTER TAG" delay={0} />
      <Row w={ratio} colour={T.d2} label="EINE NORMALE FAHRT" delay={0.15} />
    </div>
  )
}

/** CALORIES — a number nobody has a feel for, in a unit everybody does. One
 *  disc is ten pizzas; the last row is drawn part-full so the count is exact. */
function Ration({ pizzas, reduce }: { pizzas: number; reduce: boolean | null }) {
  const discs = Math.min(40, Math.max(1, Math.round(pizzas / 10)))
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {Array.from({ length: discs }, (_, i) => (
        <motion.span key={i}
          initial={reduce ? false : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.26, delay: reduce ? 0 : i * 0.012 }}
          style={{ width: 11, height: 11, borderRadius: 100, background: T.acid, opacity: 0.85 }} />
      ))}
    </div>
  )
}

export default function W3MonumentCard({ m, tall }: { m: W3Monument; tall?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <Shell m={m} tall={tall}>
      {m.kind === 'orbit' && <Orbit laps={m.laps} reduce={reduce} />}
      {m.kind === 'column' && <Column everest={m.everest} reduce={reduce} />}
      {m.kind === 'dial' && <Dial kmh={m.kmh} reduce={reduce} />}
      {m.kind === 'tally' && <Tally into={m.into} step={m.step} reduce={reduce} />}
      {m.kind === 'days' && <DayTicks days={m.days} reduce={reduce} />}
      {m.kind === 'rules' && <Rules longestKm={m.longestKm} avgKm={m.avgKm} reduce={reduce} />}
      {m.kind === 'ration' && <Ration pizzas={m.pizzas} reduce={reduce} />}
    </Shell>
  )
}
