import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useFormProjection } from '../../hooks/useFormProjection'
import type { FormProjection } from '../../api/formProjection'
import { T, FONT, EASE, band, DASH, w3Mode } from './w3tokens'
import { S, lux, luxTile, TNUM } from './w3surfaces'
import W3Eyebrow from './W3Eyebrow'
import {
  signedForm,
  formProjectionModelLine,
  formProjectionLoadLine,
  formProjectionUnavailableLine,
} from './w3formProjectionCopy'

/**
 * W3 · FORM VORAUS — the projection on the athlete's OWN time constants.
 *
 * ── WHY THIS CARD EXISTS AT ALL ──────────────────────────────────────────
 *
 * `W3FormCard` answers "wo stehe ich" from the PMC. Every other tool a rider
 * pays for answers that too, and answers it the same way, because intervals.icu,
 * TrainingPeaks and Strava all model every human being with the same two time
 * constants: fitness decaying at τ=42 days, fatigue at τ=7. Those are Coggan's
 * population defaults. They were never measured on the person reading them.
 *
 * `/analytics/form-projection` fits τ1 and τ2 to THIS athlete's own
 * load-versus-performance history — and refuses to use the fit when it does not
 * beat 42/7 once its two extra parameters are paid for on AICc. So this card
 * has exactly one job: make that difference visible, and make the refusal just
 * as visible as the success.
 *
 * Hence the ghost ring on the curve. Today's form on the fitted constants gets
 * the acid dot; the same day on 42/7 gets a hollow ring beside it. The gap
 * between them is the whole argument, drawn once, at actual size.
 *
 * ── THE HONESTY RULES THIS CARD OBEYS ────────────────────────────────────
 *
 * 1. `range_required` is not advisory. True means NO point value for anything
 *    projected: the hero becomes a span and the curve loses its line, keeping
 *    only the band. Note that the standard path is capped at 25 % confidence
 *    against a 30 % threshold ON PURPOSE, so the fallback ALWAYS renders as a
 *    range — a population constant never gets to look like a measurement.
 * 2. The standard model is never dressed up as individual. When the fit did not
 *    ship, the card says which gate stopped it, in plain German, without
 *    apologising for it.
 * 3. `available: false` gets a specific line built from `reason` and the day
 *    counts — never a spinner, never an empty card.
 * 4. The band covers FUTURE LOAD only, not uncertainty in τ. The card says so
 *    rather than letting a smooth ribbon imply otherwise.
 *
 * Every prose string on screen is composed here from resolved codes. The
 * server's own `model_reason` / `load.assumption` are English and inspectable;
 * they are not app copy and are not rendered.
 */

const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dLong = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })
const dShort = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' })

/** Local-midnight parse, and null rather than a throw on anything that is not
 *  a date. `Intl.DateTimeFormat.format` raises on an invalid Date, and one bad
 *  string in a payload should cost a caption, not the whole card. */
function fmtDate(iso: string, f: Intl.DateTimeFormat): string | null {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : f.format(d)
}

// ── the curve ───────────────────────────────────────────────────────────────

const W = 310
const H = 104
/** The zero tick's gutter. The label used to float over the plot at `right: 0`
 *  and the band grew straight through it — an axis label that a wedge of data
 *  can cover is not an axis label. */
const GUTTER = 18
const X0 = 7
const X1 = 3
const TOP = 5
const BOT = H - 5

/**
 * Form, from today to the horizon, as a band with the model's line through it.
 *
 * THE AXIS. `W3FormCurve` pads a fitness curve's floor rather than zeroing it,
 * because a zero-based axis draws twelve weeks of real progress as a flat line.
 * The same reasoning lands differently here: form is the one quantity in this
 * model that is meaningfully NEGATIVE, so the domain is padded around the data
 * the same way — but zero is forced into it and drawn, because "the band
 * crosses zero on the 12th" is the reading, and an axis that hid the crossing
 * would hide the answer.
 *
 * THE LINE IS CONDITIONAL. With `range_required` there is no line at all. A
 * 2 px acid stroke through a band is a point estimate whatever the caption
 * says, and below the confidence threshold this app does not get to draw one.
 */
function Curve({ d, showLine, reduce }: {
  d: FormProjection; showLine: boolean; reduce: boolean | null
}) {
  const today = d.today!
  const proj = d.projection
  const n = proj.length

  const values = [0, today.form, ...proj.map((p) => p.form_low), ...proj.map((p) => p.form_high)]
  const raw = { lo: Math.min(...values), hi: Math.max(...values) }
  const pad = Math.max(3, (raw.hi - raw.lo) * 0.1)
  const lo = raw.lo - pad
  const hi = raw.hi + pad
  const x = (i: number) => X0 + (i / n) * (W - X0 - X1)
  const y = (v: number) => BOT - ((v - lo) / (hi - lo || 1)) * (BOT - TOP)

  const y0 = y(today.form)
  const upper = proj.map((p, i) => `L${x(i + 1).toFixed(1)} ${y(p.form_high).toFixed(1)}`).join(' ')
  const lower = [...proj].reverse()
    .map((p, i) => `L${x(n - i).toFixed(1)} ${y(p.form_low).toFixed(1)}`).join(' ')
  const bandPath = `M${x(0).toFixed(1)} ${y0.toFixed(1)} ${upper} ${lower} Z`
  const line = `M${x(0).toFixed(1)} ${y0.toFixed(1)} ` +
    proj.map((p, i) => `L${x(i + 1).toFixed(1)} ${y(p.form).toFixed(1)}`).join(' ')

  const light = w3Mode() === 'light'
  const pct = (v: number) => `${((v / H) * 100).toFixed(2)}%`
  const leftPct = `${((X0 / W) * 100).toFixed(2)}%`
  const ghost = d.standard_today
  // On the standard path the two models ARE the same model, so the ring would
  // sit exactly under the dot and invent a comparison that is not being made.
  const showGhost = ghost != null && d.model === 'individual'

  return (
    <div style={{ position: 'relative', width: '100%', height: H, paddingLeft: GUTTER }}>
      <span aria-hidden style={{
        position: 'absolute', left: 0, top: pct(y(0)), transform: 'translateY(-50%)',
        fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet,
      }}>0</span>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        role="img"
        aria-label={`Form von heute bis in ${n} Tage, als 80-Prozent-Band`}
        style={{ display: 'block', position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id="w3-fp-band" x1="0" y1="0" x2="0" y2="1">
            {/* Light mode's `acid` is a dark olive (it has to clear AA as
                type), so the same alphas that read as a lit band on the dark
                ground read as a rumour on paper. The band is the primary
                object on this card and has to survive both grounds. */}
            <stop offset="0%" stopColor={T.acid} stopOpacity={light ? 0.4 : 0.26} />
            <stop offset="100%" stopColor={T.acid} stopOpacity={light ? 0.12 : 0.07} />
          </linearGradient>
        </defs>

        {/* Zero. Not decoration: above it the rider is fresh, below it they are
            carrying the block, and the band's crossing is the reading. */}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={T.rule} strokeWidth={1}
          strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />

        <motion.path data-testid="fp-band" d={bandPath} fill="url(#w3-fp-band)" stroke="none"
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.1 }} />

        {showLine && (
          <motion.path data-testid="fp-line" d={line} fill="none" stroke={T.acid} strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut' }} />
        )}
      </svg>

      {/* The two markers live OUTSIDE the svg. `preserveAspectRatio="none"`
          stretches the viewBox horizontally, which turns a circle into an
          ellipse on anything wider than 310 — and the ghost ring only works as
          a comparison if it is exactly the same shape as the dot. */}
      <span aria-hidden style={{
        position: 'absolute', left: leftPct, top: pct(y0), transform: 'translate(-50%, -50%)',
        width: 9, height: 9, borderRadius: 100, background: T.acid,
      }} />
      {showGhost && (
        <span aria-hidden data-testid="fp-ghost" style={{
          position: 'absolute', left: leftPct, top: pct(y(ghost.form)),
          transform: 'translate(-50%, -50%)',
          width: 9, height: 9, borderRadius: 100,
          border: `1.5px solid ${T.d4}`, background: T.heroDock,
        }} />
      )}
      </div>
    </div>
  )
}

// ── the card ────────────────────────────────────────────────────────────────

function Caption({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{children}</span>
  )
}

/**
 * The card as a pure function of the payload, so every state can be rendered
 * without a server. `W3FormProjection` owns the fetch.
 */
export function W3FormProjectionView({ data: d }: { data: FormProjection }) {
  const reduce = useReducedMotion()

  // ── available: false — an honest card, not a spinner and not a blank ─────
  if (!d.available || !d.today) {
    return (
      <div style={band(26)}>
        <div style={{ ...lux(28), padding: S.xl, gap: S.lg, fontFamily: FONT }}>
          <W3Eyebrow>Form voraus</W3Eyebrow>
          {/* NO BIG DASH HERE. `DASH` is right where a known quantity is
              missing from a row of numbers; at hero size it renders as a grey
              bar, and a grey bar in a number's slot reads as a skeleton — i.e.
              as "still loading", which is the one thing this state must not
              say. There is no number slot on this card yet, so the card states
              that in words and spends no acid doing it. */}
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.15, color: T.ink }}>
            Noch keine Projektion.
          </span>
          <Caption>{formProjectionUnavailableLine(d)}</Caption>
        </div>
      </div>
    )
  }

  const proj = d.projection
  const last = proj.length > 0 ? proj[proj.length - 1] : null
  const c = d.constants
  const individual = d.model === 'individual'
  // The rule, obeyed rather than re-derived. Anything the server did not
  // resolve is treated as "range", because the safe direction is more
  // uncertainty on screen, not less.
  const rangeOnly = d.range_required !== false
  const horizon = d.load?.horizon_days ?? proj.length

  return (
    <div style={band(26)}>
      <div style={{ ...lux(28), padding: S.xl, gap: S.xl, fontFamily: FONT }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <W3Eyebrow>Form · {horizon} Tage voraus</W3Eyebrow>
          <W3Eyebrow tone={individual ? T.acid : T.quiet}>
            {individual ? 'Dein Modell' : 'Standard 42 / 7'}
          </W3Eyebrow>
        </div>

        {/* The hero. A span when the app is not confident enough for a point —
            and on the standard path it is a span by construction. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {last == null ? (
            // A horizon with no projected days. Same reasoning as the
            // unavailable card: words, not a hero-sized dash.
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.15, color: T.ink }}>
              Noch keine Projektion.
            </span>
          ) : rangeOnly ? (
            <span data-testid="fp-hero-range" style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ ...TNUM, fontSize: 38, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1, color: T.acid }}>
                {signedForm(last.form_low)}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: T.quiet }}>bis</span>
              <span style={{ ...TNUM, fontSize: 38, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1, color: T.acid }}>
                {signedForm(last.form_high)}
              </span>
            </span>
          ) : (
            <span data-testid="fp-hero-point" style={{ ...TNUM, fontSize: 56, fontWeight: 700, letterSpacing: -2.4, lineHeight: 1, color: T.acid }}>
              {signedForm(last.form)}
            </span>
          )}

          {last && (
            <span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>
              Form am {fmtDate(last.date, dLong) ?? DASH}
            </span>
          )}

          {last && rangeOnly && d.confidence_pct != null && d.confidence_threshold_pct != null && (
            <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
              Spanne statt Punkt — {d.confidence_pct} % Konfidenz, Schwelle {d.confidence_threshold_pct} %.
            </span>
          )}
        </div>

        {proj.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Curve d={d} showLine={!rangeOnly} reduce={reduce} />
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: GUTTER }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>HEUTE</span>
              {last && (
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet, textTransform: 'uppercase' }}>
                  {fmtDate(last.date, dShort) ?? DASH}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Today, measured, on both models — the comparison in words next to
            the same comparison in shapes. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: `6px ${S.lg}px`, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 100, background: T.acid, flex: 'none' }} />
            <span style={{ fontSize: 11.5, fontWeight: 500, color: T.mid }}>
              Heute <span style={{ ...TNUM, fontWeight: 700, color: T.ink }}>{signedForm(d.today.form)}</span>
            </span>
          </span>
          {individual && d.standard_today && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden style={{
                width: 9, height: 9, borderRadius: 100, border: `1.5px solid ${T.d4}`, flex: 'none',
              }} />
              <span style={{ fontSize: 11.5, fontWeight: 500, color: T.mid }}>
                Standard-PMC <span style={{ ...TNUM, color: T.mid }}>{signedForm(d.standard_today.form)}</span>
              </span>
            </span>
          )}
        </div>

        {/* The constants, and the evidence that they earned their place. */}
        {c && (
          <div style={{ ...luxTile(20), padding: '13px 14px', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <W3Eyebrow>Zeitkonstanten</W3Eyebrow>
              <span style={{ ...TNUM, fontSize: 15, fontWeight: 600, letterSpacing: -0.3, color: T.ink }}>
                {nf1.format(c.tau1_days)} / {nf1.format(c.tau2_days)} Tage
              </span>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
              {individual
                ? (c.r_squared != null && c.standard_r_squared != null
                    ? `Standard 42 / 7 Tage · R² ${nf2.format(c.r_squared)} gegen ${nf2.format(c.standard_r_squared)}`
                    : 'Standard 42 / 7 Tage')
                : 'Bevölkerungsmittel — nicht an dir gemessen.'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Caption>{formProjectionModelLine(d)}</Caption>
          {d.load && (
            <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
              {formProjectionLoadLine(d)}
            </span>
          )}
          <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
            Das 80-%-Band deckt nur die künftige Belastung ab, nicht die Unsicherheit der Zeitkonstanten.
          </span>
        </div>
      </div>
    </div>
  )
}

export default function W3FormProjection({ horizonDays = 42 }: { horizonDays?: number }) {
  const { data } = useFormProjection(horizonDays)
  // No skeleton on purpose: this card is one of several on a scrolling page,
  // and a placeholder that reserves 480 px and then relayouts is worse than a
  // card that simply arrives. `available: false` is a rendered state, not this.
  if (!data) return null
  return <W3FormProjectionView data={data} />
}
