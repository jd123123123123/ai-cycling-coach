import { motion, useReducedMotion } from 'motion/react'
import { usePMC } from '../../hooks/usePMC'
import { T, FONT, EASE, band, DASH } from './w3tokens'
import { S, lux } from './w3surfaces'

/**
 * W3 · TODAY — "Wo du stehst", from pen frame `Vt2TQ` (`YjCIs`).
 *
 * THREE NUMBERS THAT ONLY MEAN ANYTHING TOGETHER. Fitness (CTL), Ermüdung (ATL)
 * and Form (TSB) are one model seen from three sides — form IS fitness minus
 * fatigue — so they belong on one card, and the sentence at the bottom is what
 * turns them from three gauges into a reading. A rider does not need to know
 * the acronyms; they need to know whether the work is landing.
 *
 * FORM LEADS, BECAUSE FORM IS THE ANSWER. It gets the arc and the big figure;
 * fitness and fatigue are the working. The arc is signed and centred on zero:
 * TSB is the one number here that is meaningfully negative, and drawing it as a
 * bar from zero would hide that a deep negative is the POINT of a build week.
 *
 * WHAT IT REFUSES TO DO. With fewer than eight days of history there is no
 * trend, so no trend is claimed — the deltas and the sentence disappear rather
 * than being computed off two data points. With no PMC at all the card does not
 * render. `services/training_load` owns the model; this only reads it.
 */

/** How far out the arc reaches for a given TSB.
 *
 *  ±30 is the practical span: past −30 an athlete is deep in a build and past
 *  +25 they are rested to the point of detraining, so anything beyond simply
 *  fills the arc rather than compressing the middle where every real reading
 *  lives. */
const TSB_SPAN = 30
const R = 46
const STROKE = 9

/**
 * Degrees are measured FROM THE TOP, clockwise, so the numbers in this file
 * read the way the gauge looks: 0 is twelve o'clock, +135 is the bottom-right
 * end of the track and −135 the bottom-left. The gauge opens at the BOTTOM and
 * zero sits at the TOP, which is what lets a negative form sweep visibly left
 * and a positive one right — the first version had this rotated a quarter turn
 * and drew a deficit as a stub pointing down-right, which reads as "small"
 * rather than as "below zero".
 */
const HALF = 135

function arcPath(fromDeg: number, toDeg: number): string {
  const pt = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [60 + R * Math.cos(a), 60 + R * Math.sin(a)]
  }
  const [x0, y0] = pt(fromDeg)
  const [x1, y1] = pt(toDeg)
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  const sweep = toDeg > fromDeg ? 1 : 0
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** A segmented level bar — the same visual grammar as the readiness dock, so
 *  fitness and fatigue read as the same kind of quantity it shows. */
function Level({ pct, tone, reduce }: { pct: number; tone: string; reduce: boolean | null }) {
  const STEPS = 10
  const lit = Math.round(Math.max(0, Math.min(1, pct)) * STEPS)
  return (
    <div style={{ display: 'flex', gap: 3, height: 7 }} aria-hidden>
      {Array.from({ length: STEPS }, (_, i) => (
        <motion.div key={i}
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE, delay: 0.1 + i * 0.03 }}
          style={{ flex: 1, borderRadius: 2, background: i < lit ? tone : T.d1 }} />
      ))}
    </div>
  )
}

function Row({ label, value, note, pct, tone, reduce }: {
  label: string; value: string; note: string; pct: number; tone: string; reduce: boolean | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>{label}</span>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.7, lineHeight: 1, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
      </div>
      <Level pct={pct} tone={tone} reduce={reduce} />
      {note && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{note}</span>}
    </div>
  )
}

/** The reading, in one sentence, built only from what the series actually did.
 *  Every branch here is a statement about the two deltas — there is no branch
 *  that characterises a rider, a week, or a plan. */
function reading(ctlD: number, atlD: number, tsb: number): string {
  const up = (x: number) => x > 1.5
  const down = (x: number) => x < -1.5
  if (up(ctlD) && down(atlD)) {
    return 'Fitness steigt, Ermüdung fällt — beides zugleich, und genau so soll ein Umfangsblock laufen.'
  }
  if (up(ctlD) && up(atlD)) {
    return tsb < -15
      ? 'Fitness und Ermüdung steigen zusammen. Das ist der Preis der Arbeit — er wird erst nach der Entlastung sichtbar.'
      : 'Fitness und Ermüdung steigen zusammen, und die Form hält noch mit. Der Block trägt.'
  }
  if (down(ctlD) && down(atlD)) {
    return 'Beides fällt. Nach einer ruhigen Woche ist das normal; über zwei hinweg verlierst du den Aufbau.'
  }
  if (down(ctlD) && up(atlD)) {
    return 'Ermüdung steigt, Fitness nicht. Das ist die Kombination, die sich lohnt zu unterbrechen.'
  }
  return 'Wenig Bewegung in beide Richtungen — die letzte Woche hat gehalten, was da war.'
}

export interface FormPoint { ctl: number; atl: number; tsb: number }

/**
 * The card as a pure function of a PMC series, so it can be rendered from a
 * preview route with a synthetic block. `W3FormCard` owns the fetch.
 */
export function W3FormCardView({ entries: e }: { entries: FormPoint[] }) {
  const reduce = useReducedMotion()
  if (e.length === 0) return null

  const last = e[e.length - 1]
  // Eight entries, not two: a "trend" from yesterday is noise, and the pen's
  // own header says LETZTE 6 WOCHEN — the deltas have to be a week apart to
  // deserve the word.
  const prev = e.length > 7 ? e[e.length - 8] : null
  const ctl = Math.round(last.ctl)
  const atl = Math.round(last.atl)
  const tsb = last.tsb
  const ctlD = prev ? last.ctl - prev.ctl : 0
  const atlD = prev ? last.atl - prev.atl : 0

  // Zero at the top, the arc growing left for a deficit and right for freshness.
  const clamped = Math.max(-TSB_SPAN, Math.min(TSB_SPAN, tsb))
  const end = (clamped / TSB_SPAN) * HALF
  // A BUILD WEEK IS NOT A WARNING. −13 is an ordinary Tuesday inside a volume
  // block, and colouring it amber tells a rider something is wrong when the
  // plan is working exactly as written. Warm only past −20, where the fatigue
  // has genuinely outrun what the week asked for.
  const tone = tsb >= -20 ? T.acid : tsb >= -30 ? T.warn : T.bad
  // Fitness and fatigue are scaled against the athlete's OWN six-week peak, not
  // an absolute ceiling: a CTL of 78 means something different for every rider,
  // and a bar against a made-up maximum would be decoration.
  const peak = Math.max(1, ...e.map((x) => Math.max(x.ctl, x.atl)))

  const trend = (d: number) => (d > 1.5 ? 'steigt' : d < -1.5 ? 'fällt' : 'hält')

  return (
    <div style={band(26)}>
      <div style={{ ...lux(28), padding: S.xl, gap: S.xl, fontFamily: FONT }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>WO DU STEHST</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.mid }}>LETZTE 6 WOCHEN</span>
        </div>

        <div style={{ display: 'flex', gap: S.xl, alignItems: 'center' }}>
          <div style={{ width: 120, height: 120, flex: 'none', position: 'relative' }}>
            <svg width={120} height={120} viewBox="0 0 120 120" aria-hidden>
              <path d={arcPath(-HALF, HALF)} fill="none" stroke={T.d1}
                strokeWidth={STROKE} strokeLinecap="round" />
              <motion.path d={arcPath(0, end)} fill="none" stroke={tone}
                strokeWidth={STROKE} strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, ease: EASE }} />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 1,
            }}>
              <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1, color: tone, fontVariantNumeric: 'tabular-nums' }}>
                {tsb > 0 ? '+' : ''}{Math.round(tsb)}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>FORM</span>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S.lg }}>
            <Row label="FITNESS" value={String(ctl)} note={prev ? trend(ctlD) : ''}
              pct={ctl / peak} tone={T.acid} reduce={reduce} />
            <Row label="ERMÜDUNG" value={String(atl)} note={prev ? trend(atlD) : ''}
              pct={atl / peak} tone={T.mid} reduce={reduce} />
          </div>
        </div>

        {prev && (
          <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
            {reading(ctlD, atlD, tsb)}
          </span>
        )}
      </div>
    </div>
  )
}

export { DASH }


export default function W3FormCard() {
  const { data: pmc } = usePMC()
  return <W3FormCardView entries={pmc?.entries ?? []} />
}
