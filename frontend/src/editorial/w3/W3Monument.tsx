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

/** Display size for a figure, stepped down by how many glyphs it has to hold.
 *  Measured against the narrowest place one lands: a half-width tile, whose
 *  inner width is about 140 px once the unit has taken its share. "184,2K" at
 *  34 px did not fit and was being ellipsised into "184,…", which is not a
 *  number at all. */
const figureSize = (v: string) => (v.length >= 7 ? 24 : v.length >= 6 ? 27 : v.length >= 5 ? 36 : 42)

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
      position: 'relative', overflow: 'hidden',
      width: '100%', minWidth: 0, borderRadius: 26,
      // A LIT ROOM, NOT A GREY BOX. The tile was a flat fill with flat marks on
      // it — the visual language of a dashboard, not of an app whose entire
      // argument is that depth comes from light. Every monument now sits in its
      // own faint pool of accent, brightest where its drawing is.
      background: `radial-gradient(120% 90% at 50% 100%, ${T.acid}12, ${T.tile} 62%)`,
      padding: '18px 18px 20px', display: 'flex', flexDirection: 'column',
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

      {/* THE FIGURE SHRINKS BEFORE IT CLIPS. "184,2K" plus its unit does not fit
          a half-width tile at 42 px, and a number cut off mid-digit is worse
          than a slightly smaller one. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{
          fontFamily: ARCHIVO, fontSize: figureSize(m.value), fontWeight: 700, letterSpacing: -1.6, lineHeight: 0.86,
          color: missing ? T.quiet : T.ink, fontVariantNumeric: 'tabular-nums',
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{m.value}</span>
        <span style={{ flex: 'none', fontSize: 12.5, fontWeight: 700, color: T.mid }}>{m.unit}</span>
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

// ── LIGHT IS THE MATERIAL ──────────────────────────────────────────────────
// Every lit mark below glows. That is not a flourish: this app's whole visual
// argument is that depth comes from light rather than from drawn edges, and a
// flat acid rectangle on a flat grey rectangle is the one place the argument
// was not being made. `GLOW` is the same bloom the readiness meter uses.
const GLOW = (px: number) => ({ filter: `drop-shadow(0 0 ${px}px ${T.acid}80)` })
const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** DISTANCE — an arc, because the story is laps of a planet. The ring is the
 *  current lap; the pips are laps already closed, so a rider who has been round
 *  twice can SEE it. */
function Orbit({ laps, reduce }: { laps: number; reduce: boolean | null }) {
  const done = Math.floor(laps)
  const frac = Math.max(0, Math.min(1, laps % 1))
  const R = 62, S = 150, c = S / 2
  const C = 2 * Math.PI * R
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ flex: 'none' }}>
        <circle cx={c} cy={c} r={R} fill="none" stroke={T.d1} strokeWidth={11} />
        <motion.circle
          cx={c} cy={c} r={R} fill="none" stroke={T.acid} strokeWidth={11} strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`} style={GLOW(9)}
          initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
          animate={{ strokeDasharray: `${frac * C} ${C}` }}
          transition={{ duration: 1.2, ease: EASE_OUT }} />
        <text x={c} y={c + 4} textAnchor="middle" fontFamily={ARCHIVO} fontSize={34} fontWeight={700} fill={T.ink}>
          {Math.round(frac * 100)}%
        </text>
        <text x={c} y={c + 22} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fontWeight={700} letterSpacing={1.4} fill={T.quiet}>
          RUNDE {done + 1}
        </text>
      </svg>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>ERDUMRUNDUNGEN</span>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {Array.from({ length: Math.max(1, done + 1) }, (_, i) => (
            <span key={i} style={{
              width: 17, height: 17, borderRadius: 100,
              background: i < done ? T.acid : 'transparent',
              border: i < done ? 'none' : `1.5px dashed ${T.d2}`,
              ...(i < done ? GLOW(7) : {}),
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** ELEVATION — a bar with seven grey captions beside it was a chart of a
 *  mountain, not a mountain. Everest is DRAWN, once per whole one climbed, and
 *  the part-climbed one is drawn part-lit — so the number is a skyline the
 *  rider built rather than a figure they are told. */
function Everests({ everest, reduce }: { everest: number; reduce: boolean | null }) {
  const whole = Math.floor(everest)
  const part = everest - whole
  // SEVEN PEAKS AT A FIXED WIDTH RAN OUT OF THE TILE. They share the row
  // instead, so the range fits whatever it has to fit and a rider with eleven
  // Everests gets a longer, finer skyline rather than a cropped one.
  const n = Math.min(9, Math.max(1, whole + (part > 0.02 ? 1 : 0)))
  const H = 88, W = 26
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: H, minWidth: 0, width: '100%' }}>
      {Array.from({ length: n }, (_, i) => {
        const fill = i < whole ? 1 : part
        return (
          <motion.svg key={i} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet"
            initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.07, ease: EASE_OUT }}
            style={{ flex: '1 1 0', minWidth: 0, ...(fill > 0.5 ? GLOW(6) : {}) }}>
            <defs>
              <clipPath id={`ev${i}`}>
                <rect x={0} y={H * (1 - fill)} width={W} height={H * fill} />
              </clipPath>
            </defs>
            {/* the unclimbed silhouette */}
            <path d={`M0 ${H} L${W / 2} 6 L${W} ${H} Z`} fill={T.d1} />
            {/* and how much of it has been climbed */}
            <g clipPath={`url(#ev${i})`}>
              <path d={`M0 ${H} L${W / 2} 6 L${W} ${H} Z`} fill={T.acid} />
            </g>
            {/* the snow line, so it reads as a peak and not a triangle */}
            <path d={`M${W / 2 - 6} 22 L${W / 2} 6 L${W / 2 + 6} 22 Z`} fill={T.acidLite} opacity={fill > 0.9 ? 1 : 0.25} />
          </motion.svg>
        )
      })}
      {everest > n && (
        <span style={{ fontSize: 9.5, fontWeight: 700, color: T.quiet, paddingBottom: 2 }}>+{Math.floor(everest - n)}</span>
      )}
    </div>
  )
}

/** SPEED — a rate. A needle on a scale is what a rate has looked like for a
 *  century; borrowing it costs nothing and reads before the number does. */
function Dial({ kmh, reduce }: { kmh: number; reduce: boolean | null }) {
  const MAX = 45
  const frac = Math.max(0, Math.min(1, kmh / MAX))
  const a = Math.PI * (1 - frac)
  const R = 62, W = 150, H = 92
  const cx = W / 2, cy = 74
  const p = (ang: number) => [cx + R * Math.cos(ang), cy - R * Math.sin(ang)]
  const arc = (from: number, to: number) => {
    const [x0, y0] = p(from), [x1, y1] = p(to)
    return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path d={arc(Math.PI, 0)} fill="none" stroke={T.d1} strokeWidth={11} strokeLinecap="round" />
        <motion.path
          d={arc(Math.PI, a)} fill="none" stroke={T.acid} strokeWidth={11} strokeLinecap="round"
          style={GLOW(9)}
          initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.0, ease: EASE_OUT }} />
        {/* Ticks every 5 km/h, so the arc is a SCALE and not a decoration. */}
        {Array.from({ length: 10 }, (_, i) => {
          const ta = Math.PI * (1 - (i + 1) / 10)
          const [x0, y0] = p(ta)
          const [x1, y1] = [cx + (R - 15) * Math.cos(ta), cy - (R - 15) * Math.sin(ta)]
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={T.bg} strokeWidth={1.5} opacity={0.55} />
        })}
        <motion.line
          x1={cx} y1={cy} x2={cx + (R - 20) * Math.cos(a)} y2={cy - (R - 20) * Math.sin(a)}
          stroke={T.ink} strokeWidth={3} strokeLinecap="round"
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.55 }} />
        <circle cx={cx} cy={cy} r={5.5} fill={T.ink} />
        <text x={8} y={88} fontFamily={FONT} fontSize={8.5} fontWeight={700} fill={T.quiet}>0</text>
        <text x={W - 20} y={88} fontFamily={FONT} fontSize={8.5} fontWeight={700} fill={T.quiet}>{MAX}</text>
      </svg>
    </div>
  )
}

/** RIDES — fifty grey squares was a loading bar wearing a hat. A ride turns a
 *  wheel, so the count IS a wheel: one spoke per ride toward the next round
 *  number, lacing itself up as the rider rides. */
function Wheel({ into, step, reduce }: { into: number; step: number; reduce: boolean | null }) {
  const S = 150, c = S / 2, R = 62, HUB = 13
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        <circle cx={c} cy={c} r={R} fill="none" stroke={T.d1} strokeWidth={6} />
        {Array.from({ length: step }, (_, i) => {
          const ang = (i / step) * Math.PI * 2 - Math.PI / 2
          const lit = i < into
          const lean = (i % 2 ? 1 : -1) * 0.13     // laced, not radial — a real wheel is
          return (
            <motion.line key={i}
              x1={c + HUB * Math.cos(ang + lean)} y1={c + HUB * Math.sin(ang + lean)}
              x2={c + (R - 3) * Math.cos(ang)} y2={c + (R - 3) * Math.sin(ang)}
              stroke={lit ? T.acid : T.d1} strokeWidth={lit ? 2 : 1.2} strokeLinecap="round"
              style={lit ? GLOW(5) : undefined}
              initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: reduce ? 0 : i * 0.008 }} />
          )
        })}
        <circle cx={c} cy={c} r={HUB} fill={T.tile} stroke={T.d2} strokeWidth={2} />
        <text x={c} y={c + 5} textAnchor="middle" fontFamily={ARCHIVO} fontSize={14} fontWeight={700} fill={T.acid}>
          {into}
        </text>
      </svg>
    </div>
  )
}

/** SADDLE TIME — hours are abstract; days are not. One bar per whole day, and
 *  every seventh taller and brighter, so weeks emerge out of the run without a
 *  single label being printed. */
function DayComb({ days, reduce }: { days: number; reduce: boolean | null }) {
  const shown = Math.min(112, days)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-end', rowGap: 6 }}>
      {Array.from({ length: shown }, (_, i) => {
        const week = (i + 1) % 7 === 0
        return (
          <motion.span key={i}
            initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
            transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.006, ease: EASE_OUT }}
            style={{
              width: 4, height: week ? 26 : 16, borderRadius: 2, transformOrigin: 'bottom',
              background: week ? T.acidLite : T.acid, opacity: week ? 1 : 0.6,
              ...(week ? GLOW(6) : {}),
            }} />
        )
      })}
      {days > shown && (
        <span style={{ fontSize: 9.5, fontWeight: 700, color: T.quiet, paddingLeft: 5 }}>+{days - shown}</span>
      )}
    </div>
  )
}

/** LONGEST — a record means nothing alone. The big day against an ordinary one,
 *  drawn to true scale, with the multiple read straight off the picture. */
function Rules({ longestKm, avgKm, reduce }: { longestKm: number; avgKm: number; reduce: boolean | null }) {
  const ratio = longestKm > 0 ? Math.max(0.03, Math.min(1, avgKm / longestKm)) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <motion.div
          initial={reduce ? false : { width: 0 }} animate={{ width: '100%' }}
          transition={{ duration: 1.0, ease: EASE_OUT }}
          style={{ height: 15, borderRadius: 100, background: `linear-gradient(90deg, ${T.acidDeep}, ${T.acid})`, ...GLOW(9) }} />
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.acid }}>DEIN GRÖSSTER TAG</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <motion.div
          initial={reduce ? false : { width: 0 }} animate={{ width: `${ratio * 100}%` }}
          transition={{ duration: 1.0, delay: 0.2, ease: EASE_OUT }}
          style={{ height: 15, borderRadius: 100, background: T.d2 }} />
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>EINE NORMALE FAHRT</span>
      </div>
    </div>
  )
}

/** CALORIES — a number nobody has a feel for, in a unit everybody does. Twenty
 *  small flat dots read as nothing; six big lit ones read as a stack of food. */
export const PIZZAS_PER_DISC = 25

function Ration({ pizzas, reduce }: { pizzas: number; reduce: boolean | null }) {
  const PER = PIZZAS_PER_DISC
  const whole = Math.floor(pizzas / PER)
  const part = (pizzas % PER) / PER
  const n = Math.min(8, Math.max(1, whole + (part > 0.05 ? 1 : 0)))
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {Array.from({ length: n }, (_, i) => {
        const fill = i < whole ? 1 : part
        return (
          <motion.svg key={i} width={26} height={26} viewBox="0 0 26 26"
            initial={reduce ? false : { opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.34, delay: reduce ? 0 : i * 0.06, ease: EASE_OUT }}
            style={{ flex: 'none', ...(fill > 0.5 ? GLOW(7) : {}) }}>
            <circle cx={13} cy={13} r={12} fill={T.d1} />
            {/* a part-full disc is drawn as a wedge, so the count stays exact */}
            <path
              d={fill >= 1
                ? 'M13 1 A12 12 0 1 1 12.99 1 Z'
                : `M13 13 L13 1 A12 12 0 ${fill > 0.5 ? 1 : 0} 1 ${13 + 12 * Math.sin(fill * 2 * Math.PI)} ${13 - 12 * Math.cos(fill * 2 * Math.PI)} Z`}
              fill={T.acid} />
          </motion.svg>
        )
      })}
    </div>
  )
}

export default function W3MonumentCard({ m, tall }: { m: W3Monument; tall?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <Shell m={m} tall={tall}>
      {m.kind === 'orbit' && <Orbit laps={m.laps} reduce={reduce} />}
      {m.kind === 'column' && <Everests everest={m.everest} reduce={reduce} />}
      {m.kind === 'dial' && <Dial kmh={m.kmh} reduce={reduce} />}
      {m.kind === 'tally' && <Wheel into={m.into} step={m.step} reduce={reduce} />}
      {m.kind === 'days' && <DayComb days={m.days} reduce={reduce} />}
      {m.kind === 'rules' && <Rules longestKm={m.longestKm} avgKm={m.avgKm} reduce={reduce} />}
      {m.kind === 'ration' && <Ration pizzas={m.pizzas} reduce={reduce} />}
    </Shell>
  )
}
