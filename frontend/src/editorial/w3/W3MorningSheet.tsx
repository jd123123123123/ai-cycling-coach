import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, X } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { TNUM } from './w3surfaces'
import type { MorningBriefing } from './useMorningBriefing'
import './w3.css'

/**
 * THE MORNING BRIEFING — the day as graphics, not as a list.
 *
 * Split from `W3MorningGate` because the gate is all TIMING — once a day, only
 * in the morning, never on top of another sheet — and none of that can be
 * looked at. This half can: `/e/w3-morning-preview` renders it without a
 * session, which is how it was built at 390x844.
 *
 * ── WHY IT IS DRAWN AND NOT LISTED ───────────────────────────────────────
 * The first cut was a label, a headline and three tiles: accurate, and it read
 * like a receipt. Every number here already has a shape — readiness is a
 * proportion, a forecast is a curve over the day, a reading has a direction —
 * and printing them as text throws all of that away. So:
 *
 *   · READINESS IS A RING. One arc, the score inside it, drawn to the real
 *     value. Withheld, it draws EMPTY with a dash — never a plausible angle.
 *   · THE DAY IS A STRIP. Every forecast hour as a bar of its own ride
 *     quality, with the best two bracketed in the accent. A rider sees the
 *     shape of their day and where the good part sits, which is a stronger
 *     statement than a time range on its own.
 *   · THE READINGS CARRY THEIR OWN DIRECTION, not a paragraph about it.
 *
 * ── AND IT STILL HAS TO BE TRUE ──────────────────────────────────────────
 * Nothing here invents a number. The ring is empty when the gate withholds,
 * the strip only exists when a forecast does, and a rest day gets no window at
 * all — a best two-hour slot on a day the plan says not to ride is an
 * invitation to ignore the plan. Graphics are the frame, never the claim.
 */

const TONE_LABEL: Record<string, string> = {
  go: 'HEUTE WIRD GEARBEITET',
  easy: 'HEUTE LOCKER',
  rest: 'HEUTE RUHE',
  unknown: 'HEUTE OFFEN',
}

/** Wind arrows point where the wind blows FROM, the way a rider reads a flag. */
const DIR_DEG: Record<string, number> = {
  N: 180, NE: 225, E: 270, SE: 315, S: 0, SW: 45, W: 90, NW: 135,
}

/**
 * SLEEP DEPTH IS ORDINAL, SO IT GETS AN ORDINAL RAMP.
 *
 * The first cut used the app's vital-sign hues — magenta for deep, cyan for REM
 * — because those are what the recovery surfaces use for those signals. At
 * 34px tall and side by side they were four unrelated colours shouting next to
 * an acid ring: the accent-inflation bug this design system keeps having.
 *
 * Deep to awake is a SEQUENCE, not four categories, and one ramp says so at a
 * glance without a legend: brightest is deepest. The legend underneath still
 * names them, so nothing is lost.
 */
const STAGE_TONE: Record<string, string> = {
  deep: T.ink, rem: T.d4, light: T.d3, awake: T.d1,
}

const RING = 132
const STROKE = 9
const R = (RING - STROKE) / 2
const C = 2 * Math.PI * R

/** The readiness ring. Empty and dashed when there is no score — the one shape
 *  on this screen that must never be drawn at a guessed angle. */
function Ring({ score, delta, accent, reduce }: {
  score: number | null; delta: number | null; accent: string; reduce: boolean
}) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  return (
    <div style={{ position: 'relative', width: RING, height: RING, flex: 'none' }}>
      <svg width={RING} height={RING} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke={T.d1} strokeWidth={STROKE}
          strokeDasharray={score == null ? '3 7' : undefined} strokeLinecap="round" />
        {score != null && (
          <motion.circle
            cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke={accent} strokeWidth={STROKE}
            strokeLinecap="round" strokeDasharray={C}
            initial={reduce ? false : { strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.2 }} />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 1,
      }}>
        <span style={{
          fontSize: score == null ? 30 : 44, fontWeight: 700, letterSpacing: -1.8, lineHeight: 1,
          color: score == null ? T.quiet : T.ink, ...TNUM,
        }}>
          {score ?? DASH}
        </span>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>BEREIT</span>
        {delta != null && delta !== 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: delta > 0 ? accent : T.quiet, ...TNUM }}>
            {delta > 0 ? '+' : '−'}{Math.abs(Math.round(delta))}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * THE DAY, IN THREE TRACKS ON ONE AXIS.
 *
 * A single quality bar answers "when" and hides why. Rain and wind are the two
 * things a rider actually plans around — and they disagree with each other
 * constantly: the driest hour is often the windiest. Stacking them on the same
 * hours lets a rider see that trade instead of being handed a verdict.
 *
 *   · bars   — ride quality, the window lit
 *   · line   — rain probability across the day
 *   · arrows — wind, sized by speed and pointing where it blows FROM
 */
function DayStrip({ hours, from, to, accent, reduce }: {
  hours: { hour: number; q: number | null; rideable: boolean; rain: number | null; wind: number | null; dir: string | null }[]
  from: number | null; to: number | null; accent: string; reduce: boolean
}) {
  const shown = hours.filter((h) => h.rideable)
  if (shown.length < 2) return null
  const inWin = (h: number) => from != null && to != null && h >= from && h <= to
  const H = 50
  const maxWind = Math.max(1, ...shown.map((h) => h.wind ?? 0))
  const hasRain = shown.some((h) => h.rain != null)
  const hasWind = shown.some((h) => h.wind != null)

  // The rain line runs across the SAME columns as the bars, so its x is the
  // centre of each bar rather than an evenly divided width.
  const pts = shown.map((h, i) => {
    const x = ((i + 0.5) / shown.length) * 100
    const y = 100 - Math.max(0, Math.min(100, h.rain ?? 0))
    return `${x},${y}`
  }).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
      <div style={{ position: 'relative', height: H, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: H, width: '100%' }}>
          {shown.map((h, i) => (
            <motion.div
              key={h.hour}
              initial={reduce ? false : { height: 4 }}
              animate={{ height: h.q == null ? 4 : Math.max(6, Math.round(h.q * H)) }}
              transition={{ duration: 0.5, delay: reduce ? 0 : 0.2 + i * 0.02, ease: 'easeOut' }}
              style={{
                flex: 1, borderRadius: 3, minWidth: 0,
                background: h.q == null ? T.d1 : inWin(h.hour) ? accent : `${accent}30`,
              }} />
          ))}
        </div>
        {hasRain && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <motion.polyline
              points={pts} fill="none" stroke={T.cool} strokeWidth={1.4} strokeLinejoin="round"
              strokeLinecap="round" vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, delay: reduce ? 0 : 0.35, ease: 'easeOut' }} />
          </svg>
        )}
      </div>

      {hasWind && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', height: 14 }}>
          {shown.map((h) => (
            <div key={h.hour} style={{ flex: 1, display: 'grid', placeItems: 'center', minWidth: 0 }}>
              {h.wind != null && (
                <span
                  aria-hidden
                  title={h.dir ? `${Math.round(h.wind)} km/h ${h.dir}` : `${Math.round(h.wind)} km/h`}
                  style={{
                    display: 'block', width: 0, height: 0,
                    // Size carries speed — a 24 km/h hour is visibly a bigger
                    // arrow than an 8 km/h one, without a number per column.
                    borderLeft: `${3 + (h.wind / maxWind) * 2.5}px solid transparent`,
                    borderRight: `${3 + (h.wind / maxWind) * 2.5}px solid transparent`,
                    borderBottom: `${5 + (h.wind / maxWind) * 4}px solid ${T.mid}`,
                    opacity: 0.35 + (h.wind / maxWind) * 0.65,
                    transform: `rotate(${DIR_DEG[h.dir ?? ''] ?? 0}deg)`,
                  }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The night, as the proportions it actually was. */
function NightBar({ stages, reduce }: {
  stages: { key: string; label: string; minutes: number }[]; reduce: boolean
}) {
  const total = stages.reduce((n, s) => n + s.minutes, 0)
  if (total <= 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 3, height: 34, width: '100%' }}>
        {stages.map((st, i) => (
          <motion.div
            key={st.key}
            initial={reduce ? false : { flexGrow: 0.001 }}
            animate={{ flexGrow: st.minutes }}
            transition={{ duration: 0.7, delay: reduce ? 0 : 0.15 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            style={{ flexBasis: 0, minWidth: 2, borderRadius: 6, background: STAGE_TONE[st.key] ?? T.d2 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {stages.map((st) => (
          <div key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: STAGE_TONE[st.key] ?? T.d2 }} />
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{st.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.mid, ...TNUM }}>{st.minutes}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A reading against the rider's OWN band — the only comparison that means
 * anything for a vital sign.
 *
 * `good` is not decoration. The first cut painted every "below" in warn amber,
 * which told a rider that a resting pulse of 46 — two beats UNDER their own
 * range, which is the best news on the screen — was a problem. HRV is good
 * high; resting heart rate is good low. The chip has to be told which.
 */
function BandChip({ label, value, delta, position, accent, good }: {
  label: string; value: string; delta: number | null
  position: 'below' | 'in' | 'above' | null; accent: string
  good: 'above' | 'below'
}) {
  const tone = position == null || position === 'in'
    ? T.mid
    : position === good ? accent : T.warn
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: T.ink, ...TNUM }}>{value}</span>
        {delta != null && delta !== 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: tone, ...TNUM }}>
            {delta > 0 ? '+' : '−'}{Math.abs(Math.round(delta))}
          </span>
        )}
      </div>
      {position && (
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: tone }}>
          {position === 'in' ? 'IN DEINEM BEREICH' : position === good ? 'BESSER ALS SONST' : 'UNTER DEINEM SCHNITT'}
        </span>
      )}
    </div>
  )
}

/** The week as a shape: seven days, the ridden ones drawn to their real load. */
function WeekShape({ week, accent, reduce }: {
  week: { letter: string; tss: number | null }[]; accent: string; reduce: boolean
}) {
  const max = Math.max(1, ...week.map((d) => d.tss ?? 0))
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', width: '100%' }}>
      {week.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <motion.div
            initial={reduce ? false : { height: 3 }}
            animate={{ height: d.tss == null ? 3 : Math.max(5, Math.round((d.tss / max) * 34)) }}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.2 + i * 0.04, ease: 'easeOut' }}
            style={{ width: '100%', borderRadius: 4, background: d.tss == null ? T.d1 : accent }} />
          <span style={{ fontSize: 8.5, fontWeight: 700, color: d.tss == null ? T.quiet : T.mid }}>{d.letter}</span>
        </div>
      ))}
    </div>
  )
}

export default function W3MorningSheet({ briefing, onClose, onToday, primaryRef }: {
  briefing: MorningBriefing
  onClose: () => void
  onToday: () => void
  primaryRef?: React.RefObject<HTMLButtonElement | null>
}) {
  const reduce = useReducedMotion()
  const accent = briefing.tone === 'rest' ? T.cool : T.acid

  const step = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: reduce ? 0 : 0.06 + i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
  })

  return (
    <motion.div
      className="w3-root"
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 130, display: 'flex', justifyContent: 'center', background: T.bg }}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="w3-morning-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 390, maxWidth: '100%', height: '100dvh',
          // It is still ONE page — no navigation, no chapters — but there is
          // more of the morning on it than a 667px phone can hold. Clipping the
          // weather off the bottom would be worse than a short scroll.
          overflowY: 'auto', overflowX: 'hidden',
          fontFamily: FONT, display: 'flex', flexDirection: 'column', background: T.bg,
        }}>

        {/* One bloom, behind the ring, in the tone of the day. It is the only
            thing on the screen carrying no data — everything else is a number
            with a shape. */}
        <div aria-hidden style={{
          position: 'absolute', top: -90, right: -70, width: 340, height: 340, borderRadius: '50%',
          pointerEvents: 'none', background: `radial-gradient(closest-side, ${accent}1F, transparent)`,
        }} />

        {/* A way out at the top as well as the bottom. Full-screen and
            bottom-anchored, the only exit was past the primary action — which
            is the shape of a screen that wants to be dismissed by accident. */}
        <button type="button" onClick={onClose} aria-label="Schließen"
          style={{
            position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', right: 18, zIndex: 1,
            width: 34, height: 34, borderRadius: 100, border: 0, background: T.tile,
            display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}>
          <X size={15} color={T.mid} />
        </button>

        {/* Centred, not bottom-anchored. At 390x844 the bottom anchor left a
            150px void above the ring that read as a rendering fault rather than
            as space. */}
        <div style={{
          position: 'relative', margin: 'auto 0', display: 'flex', flexDirection: 'column',
          gap: 18, padding: '0 22px calc(18px + env(safe-area-inset-bottom))',
        }}>

          {/* ── the ring, and the day beside it ─────────────────────────── */}
          <motion.div {...step(0)} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Ring score={briefing.readiness?.score ?? null} delta={briefing.readiness?.delta ?? null}
              accent={accent} reduce={!!reduce} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: accent }}>
                {TONE_LABEL[briefing.tone] ?? TONE_LABEL.unknown}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.25, color: T.ink }}>
                {briefing.greeting}
              </span>
              {briefing.dateLabel && (
                <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{briefing.dateLabel}</span>
              )}
              {briefing.streak && (
                <span style={{
                  alignSelf: 'flex-start', marginTop: 2, fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                  padding: '5px 9px', borderRadius: 100, background: T.tile, color: T.mid,
                }}>{briefing.streak}</span>
              )}
            </div>
          </motion.div>

          {briefing.welcome && (
            <motion.span {...step(1)} style={{
              fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: T.mid, marginTop: -6,
            }}>
              {briefing.welcome}
            </motion.span>
          )}

          {/* ── the answer ──────────────────────────────────────────────── */}
          <motion.div {...step(1)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span id="w3-morning-title" style={{
                fontSize: 38, fontWeight: 700, letterSpacing: -1.6, lineHeight: 1.03,
                color: T.ink, textWrap: 'balance',
              }}>
                {briefing.headline}
              </span>
              {briefing.headlineMeta && (
                <span style={{ fontSize: 15, fontWeight: 700, color: accent, ...TNUM }}>{briefing.headlineMeta}</span>
              )}
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
              {briefing.why}
            </span>
          </motion.div>

          {/* ── DIE NACHT ───────────────────────────────────────────────
              The question a rider wakes up with, and the one most apps answer
              with a single score. Stages as the proportions they were; HRV and
              resting heart rate against the rider's OWN band, because "high"
              means nothing except against your own nights. */}
          {briefing.night && (
            <motion.div {...step(2)} style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: '15px 16px 14px', borderRadius: 22, background: T.heroDock,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>DIE NACHT</span>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.6, color: T.ink, ...TNUM }}>{briefing.night.totalLabel}</span>
              </div>
              {briefing.night.stages.length > 0 && <NightBar stages={briefing.night.stages} reduce={!!reduce} />}
              {(briefing.night.hrv || briefing.night.rhr) && (
                <div style={{ display: 'flex', gap: 14 }}>
                  {briefing.night.hrv && (
                    <BandChip label="HRV" value={briefing.night.hrv.value} delta={briefing.night.hrv.delta}
                      position={briefing.night.hrv.position} accent={accent} good="above" />
                  )}
                  {briefing.night.rhr && (
                    <BandChip label="RUHEPULS" value={briefing.night.rhr.value} delta={briefing.night.rhr.delta}
                      position={briefing.night.rhr.position} accent={accent} good="below" />
                  )}
                  {briefing.night.battery != null && (
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>AKKU</span>
                      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: T.ink, ...TNUM }}>{briefing.night.battery}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>BEIM AUFWACHEN</span>
                    </div>
                  )}
                </div>
              )}
              <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>{briefing.night.note}</span>
            </motion.div>
          )}

          {/* ── WAS DEIN KÖRPER DARAUS GEMACHT HAT ──────────────────────
              ATL is a rolling average, so yesterday's minus today's IS the load
              the body shed overnight. A rider feels that number every morning
              and has never been handed it. */}
          {briefing.body && (
            <motion.div {...step(3)} style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: '15px 16px 14px', borderRadius: 22, background: T.heroDock,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>VERARBEITET</span>
                {briefing.body.weekSpent != null && briefing.body.weekPlanned != null && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.mid, ...TNUM }}>
                    {briefing.body.weekSpent} / {briefing.body.weekPlanned} TSS
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                {briefing.body.fatigueDrop != null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>ÜBER NACHT</span>
                    <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.8, color: briefing.body.fatigueDrop > 0 ? accent : T.ink, ...TNUM }}>
                      {briefing.body.fatigueDrop > 0 ? '−' : '+'}{Math.abs(briefing.body.fatigueDrop)}
                    </span>
                    <span style={{ fontSize: 8.5, fontWeight: 600, color: T.quiet }}>Ermüdung</span>
                  </div>
                )}
                {briefing.body.form != null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>FORM</span>
                    <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.8, color: T.ink, ...TNUM }}>
                      {briefing.body.form > 0 ? '+' : ''}{briefing.body.form}
                    </span>
                    <span style={{ fontSize: 8.5, fontWeight: 600, color: T.quiet }}>heute</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <WeekShape week={briefing.body.week} accent={accent} reduce={!!reduce} />
                </div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>{briefing.body.note}</span>
            </motion.div>
          )}

          {/* ── the day, drawn ──────────────────────────────────────────── */}
          {briefing.window && (
            <motion.div {...step(4)} style={{
              display: 'flex', flexDirection: 'column', gap: 11,
              padding: '15px 16px 13px', borderRadius: 22, background: T.heroDock,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>BESTES FENSTER</span>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, color: T.ink, ...TNUM }}>{briefing.window.label}</span>
                </div>
                {briefing.window.verdict && (
                  <span style={{
                    fontSize: 8.5, fontWeight: 700, letterSpacing: 1, padding: '6px 10px', borderRadius: 100,
                    background: `${accent}1F`, color: accent,
                  }}>{briefing.window.verdict}</span>
                )}
              </div>
              <DayStrip hours={briefing.window.hours} from={briefing.window.bestFrom} to={briefing.window.bestTo}
                accent={accent} reduce={!!reduce} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet, ...TNUM }}>07</span>
                {/* A cyan line and a row of triangles mean nothing unnamed. */}
                <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 9, height: 2, borderRadius: 2, background: T.cool }} />
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>REGEN</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      width: 0, height: 0, borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent', borderBottom: `6px solid ${T.mid}`,
                    }} />
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>WIND</span>
                  </span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet, ...TNUM }}>21</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.mid, textAlign: 'center' }}>{briefing.window.detail}</span>
            </motion.div>
          )}

          {/* ── what the reason rests on ────────────────────────────────── */}
          <motion.div {...step(6)} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button ref={primaryRef} onClick={onToday}
              style={{
                width: '100%', height: 54, borderRadius: 100, border: 0, background: accent, color: T.bg,
                fontFamily: FONT, fontSize: 15.5, fontWeight: 700, cursor: 'pointer',
                display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center',
              }}>
              Zum Tag<ArrowRight size={17} color={T.bg} />
            </button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
