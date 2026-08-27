import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, X } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { TNUM } from './w3surfaces'
import type { MorningBriefing } from './useMorningBriefing'
import './w3.css'

/**
 * THE MORNING BRIEFING — four questions, each answered once.
 *
 * Split from `W3MorningGate` because the gate is all TIMING — once a day, only
 * in the morning, never on top of another sheet — and none of that can be
 * looked at. This half can: `/e/w3-morning-preview` renders it without a
 * session, which is how it was built at 390x844.
 *
 * ── THE FOUR QUESTIONS, AND NOTHING TWICE ────────────────────────────────
 * A rider deciding their morning is asking exactly four things, and they do not
 * overlap:
 *
 *   01 BEREIT   — can my body do it?      (the night, and what it left me)
 *   02 HEUTE    — what am I meant to do?  (the plan)
 *   03 RAUS     — when do I go?           (the day's conditions)
 *   04 STAND    — where does that put me? (load, form, the week)
 *
 * The previous cut answered them and then answered them again in prose: a ring
 * showing 74 with its own delta, beside a sentence reading "Deine Bereitschaft
 * liegt bei 74 (+6 zu gestern)", above a form figure repeated two blocks down.
 * Three statements of two numbers. Every fact now appears in exactly one place,
 * and the only prose left is the warm line at the top — which says something no
 * graphic does.
 *
 * ── NO DUAL AXIS ─────────────────────────────────────────────────────────
 * The weather panel drew ride quality as bars and rain as a line over the same
 * plot, on two different scales. That is the most common charting mistake there
 * is: where those two series cross means nothing, and a reader cannot help but
 * read it. They are three stacked tracks now, sharing an x-axis with one scale
 * each — small multiples, which is what this always was.
 *
 * ── AND IT STILL HAS TO BE TRUE ──────────────────────────────────────────
 * The ring draws EMPTY when the readiness gate withholds — never a plausible
 * angle. A rest day gets no ride window. A stage the watch did not record is
 * absent rather than zero. Graphics are the frame, never the claim.
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
 * An earlier cut used the app's vital-sign hues — magenta for deep, cyan for
 * REM — because that is what the recovery surfaces use for those signals. Side
 * by side at 26px they were four unrelated colours shouting next to an acid
 * ring. Deep to awake is a SEQUENCE, and one ramp says so without a legend:
 * brightest is deepest.
 */
const STAGE_TONE: Record<string, string> = {
  deep: T.ink, rem: T.d4, light: T.d3, awake: T.d1,
}

const RING = 104
const STROKE = 8
const R = (RING - STROKE) / 2
const C = 2 * Math.PI * R

/** `01 — BEREIT`. The ordinal is the point: it makes the sheet a sequence of
 *  four answers rather than a pile of cards. */
function Chapter({ n, label, right }: { n: string; label: string; right?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet, ...TNUM }}>{n}</span>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.mid }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: T.d1 }} />
      {right && <span style={{ fontSize: 9, fontWeight: 700, color: T.quiet, ...TNUM }}>{right}</span>}
    </div>
  )
}

/** The readiness ring. Empty and dashed when there is no score — the one shape
 *  here that must never be drawn at a guessed angle. */
function Ring({ score, delta, accent, reduce }: {
  score: number | null; delta: number | null; accent: string; reduce: boolean
}) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  return (
    <div style={{ position: 'relative', width: RING, height: RING, flex: 'none' }}>
      <svg width={RING} height={RING} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke={T.d1} strokeWidth={STROKE}
          strokeDasharray={score == null ? '3 6' : undefined} strokeLinecap="round" />
        {score != null && (
          <motion.circle
            cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke={accent} strokeWidth={STROKE}
            strokeLinecap="round" strokeDasharray={C}
            initial={reduce ? false : { strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.15 }} />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{
            fontSize: score == null ? 26 : 36, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1,
            color: score == null ? T.quiet : T.ink, ...TNUM,
          }}>{score ?? DASH}</span>
          <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet, marginTop: 2 }}>BEREIT</span>
          {delta != null && delta !== 0 && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: delta > 0 ? accent : T.quiet, ...TNUM }}>
              {delta > 0 ? '+' : '−'}{Math.abs(Math.round(delta))}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** The night as the proportions it actually was. */
function NightBar({ stages, reduce }: {
  stages: { key: string; label: string; minutes: number }[]; reduce: boolean
}) {
  if (stages.reduce((n, s) => n + s.minutes, 0) <= 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <div style={{ display: 'flex', gap: 2, height: 26, width: '100%' }}>
        {stages.map((st, i) => (
          <motion.div
            key={st.key}
            initial={reduce ? false : { flexGrow: 0.001 }}
            animate={{ flexGrow: st.minutes }}
            transition={{ duration: 0.65, delay: reduce ? 0 : 0.1 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            style={{ flexBasis: 0, minWidth: 2, borderRadius: 5, background: STAGE_TONE[st.key] ?? T.d2 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        {stages.map((st) => (
          <div key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: STAGE_TONE[st.key] ?? T.d2 }} />
            <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>{st.label}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: T.mid, ...TNUM }}>{st.minutes}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A reading against the rider's OWN band.
 *
 * `good` is not decoration. An earlier cut painted every "below" in warn amber,
 * which told a rider that a resting pulse two beats UNDER their own range — the
 * best news on the screen — was a problem. HRV is good high, resting heart rate
 * is good low, and the chip has to be told which.
 */
function BandChip({ label, value, delta, position, accent, good }: {
  label: string; value: string; delta: number | null
  position: 'below' | 'in' | 'above' | null; accent: string; good: 'above' | 'below'
}) {
  const tone = position == null || position === 'in' ? T.mid : position === good ? accent : T.warn
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: T.ink, ...TNUM }}>{value}</span>
        {delta != null && delta !== 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, color: tone, ...TNUM }}>
            {delta > 0 ? '+' : '−'}{Math.abs(Math.round(delta))}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * THE DAY, AS THREE TRACKS ON ONE X-AXIS.
 *
 * Not one plot with two y-scales — that is the most common charting mistake
 * there is, and where quality crossed rain would have meant nothing at all.
 * Three small multiples: each track has one scale, and the hours line up so a
 * rider can read the trade. The driest hour is often the windiest, and that is
 * the whole reason a window is a judgement rather than a lookup.
 */
function DayTracks({ hours, from, to, accent, reduce }: {
  hours: { hour: number; q: number | null; rideable: boolean; rain: number | null; wind: number | null; dir: string | null }[]
  from: number | null; to: number | null; accent: string; reduce: boolean
}) {
  const shown = hours.filter((h) => h.rideable)
  if (shown.length < 2) return null
  const inWin = (h: number) => from != null && to != null && h >= from && h <= to
  const maxWind = Math.max(1, ...shown.map((h) => h.wind ?? 0))
  const hasRain = shown.some((h) => h.rain != null)
  const hasWind = shown.some((h) => h.wind != null)
  const col = { flex: 1, minWidth: 0 } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
      {/* 1 — ride quality, 0..1 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40, width: '100%' }}>
        {shown.map((h, i) => (
          <motion.div key={h.hour}
            initial={reduce ? false : { height: 3 }}
            animate={{ height: h.q == null ? 3 : Math.max(5, Math.round(h.q * 40)) }}
            transition={{ duration: 0.45, delay: reduce ? 0 : 0.15 + i * 0.015, ease: 'easeOut' }}
            style={{ ...col, borderRadius: 3, background: h.q == null ? T.d1 : inWin(h.hour) ? accent : `${accent}2E` }} />
        ))}
      </div>

      {/* 2 — rain probability, 0..100 %, on its own baseline */}
      {hasRain && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18, width: '100%' }}>
          {shown.map((h, i) => (
            <motion.div key={h.hour}
              initial={reduce ? false : { height: 2 }}
              animate={{ height: h.rain == null ? 2 : Math.max(2, Math.round((h.rain / 100) * 18)) }}
              transition={{ duration: 0.45, delay: reduce ? 0 : 0.25 + i * 0.015, ease: 'easeOut' }}
              style={{ ...col, borderRadius: 2, background: h.rain == null ? T.d1 : T.cool }} />
          ))}
        </div>
      )}

      {/* 3 — wind: a glyph row, not a third scale. Size carries speed. */}
      {hasWind && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', height: 12 }}>
          {shown.map((h) => (
            <div key={h.hour} style={{ ...col, display: 'grid', placeItems: 'center' }}>
              {h.wind != null && (
                <span aria-hidden style={{
                  display: 'block', width: 0, height: 0,
                  borderLeft: `${2.5 + (h.wind / maxWind) * 2}px solid transparent`,
                  borderRight: `${2.5 + (h.wind / maxWind) * 2}px solid transparent`,
                  borderBottom: `${4 + (h.wind / maxWind) * 3.5}px solid ${T.mid}`,
                  opacity: 0.3 + (h.wind / maxWind) * 0.7,
                  transform: `rotate(${DIR_DEG[h.dir ?? ''] ?? 0}deg)`,
                }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* the shared x-axis, labelled every third hour so it stays readable */}
      <div style={{ display: 'flex', width: '100%' }}>
        {shown.map((h) => (
          <span key={h.hour} style={{
            ...col, textAlign: 'center', fontSize: 7.5, fontWeight: 700, color: T.quiet, ...TNUM,
          }}>{h.hour % 3 === 1 ? h.hour : ''}</span>
        ))}
      </div>
    </div>
  )
}

/** The week as a shape: seven days, the ridden ones drawn to their real load. */
function WeekShape({ week, accent, reduce }: {
  week: { letter: string; tss: number | null }[]; accent: string; reduce: boolean
}) {
  const max = Math.max(1, ...week.map((d) => d.tss ?? 0))
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', width: '100%' }}>
      {week.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 }}>
          <motion.div
            initial={reduce ? false : { height: 3 }}
            animate={{ height: d.tss == null ? 3 : Math.max(4, Math.round((d.tss / max) * 28)) }}
            transition={{ duration: 0.45, delay: reduce ? 0 : 0.2 + i * 0.035, ease: 'easeOut' }}
            style={{ width: '100%', borderRadius: 3, background: d.tss == null ? T.d1 : accent }} />
          <span style={{ fontSize: 7.5, fontWeight: 700, color: d.tss == null ? T.quiet : T.mid }}>{d.letter}</span>
        </div>
      ))}
    </div>
  )
}

/** A figure with its own label — the unit of block 04. */
function Figure({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 'none' }}>
      <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.7, lineHeight: 1.05, color: tone ?? T.ink, ...TNUM }}>{value}</span>
      {sub && <span style={{ fontSize: 7.5, fontWeight: 600, color: T.quiet }}>{sub}</span>}
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
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: reduce ? 0 : 0.05 + i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
  })

  return (
    <motion.div
      className="w3-root"
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.26 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 130, display: 'flex', justifyContent: 'center', background: T.bg }}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="w3-morning-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 390, maxWidth: '100%', height: '100dvh',
          // Built to FIT 390x844 without scrolling. A shorter phone gets a short
          // scroll rather than a clipped weather panel — losing the bottom of
          // the answer is worse than a nudge of movement.
          overflowY: 'auto', overflowX: 'hidden',
          fontFamily: FONT, display: 'flex', flexDirection: 'column', background: T.bg,
        }}>

        <div aria-hidden style={{
          position: 'absolute', top: -80, right: -60, width: 300, height: 300, borderRadius: '50%',
          pointerEvents: 'none', background: `radial-gradient(closest-side, ${accent}1A, transparent)`,
        }} />

        <button type="button" onClick={onClose} aria-label="Schließen"
          style={{
            position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', right: 16, zIndex: 1,
            width: 32, height: 32, borderRadius: 100, border: 0, background: T.tile,
            display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}>
          <X size={14} color={T.mid} />
        </button>

        <div style={{
          position: 'relative', margin: 'auto 0', display: 'flex', flexDirection: 'column',
          gap: 15, padding: 'calc(14px + env(safe-area-inset-top)) 20px calc(14px + env(safe-area-inset-bottom))',
        }}>

          {/* ── the greeting: the one place prose is allowed ─────────────── */}
          <motion.div {...step(0)} style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 40 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: accent }}>
              {TONE_LABEL[briefing.tone] ?? TONE_LABEL.unknown}
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>
              {briefing.greeting}
            </span>
            {briefing.welcome && (
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>{briefing.welcome}</span>
            )}
          </motion.div>

          {/* ── 01 — BEREIT: the body ─────────────────────────────────────
              `why` is in the condition, and that is not defensive coding. On a
              morning the watch missed there is no score AND no night, so an
              earlier guard of `readiness || night` dropped the whole block —
              taking with it the ONE sentence that explains the absence. The
              rider was shown a briefing with no body in it and no word about
              why, which is the exact failure the readiness gate exists to
              prevent. The empty ring plus its reason IS the answer here. */}
          {(briefing.readiness || briefing.night || briefing.why) && (
            <motion.div {...step(1)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Chapter n="01" label="BEREIT" right={briefing.night?.totalLabel} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Ring score={briefing.readiness?.score ?? null} delta={briefing.readiness?.delta ?? null}
                  accent={accent} reduce={!!reduce} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {briefing.night && briefing.night.stages.length > 0 && (
                    <NightBar stages={briefing.night.stages} reduce={!!reduce} />
                  )}
                  {briefing.night && (briefing.night.hrv || briefing.night.rhr || briefing.night.battery != null) && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      {briefing.night.hrv && (
                        <BandChip label="HRV" value={briefing.night.hrv.value} delta={briefing.night.hrv.delta}
                          position={briefing.night.hrv.position} accent={accent} good="above" />
                      )}
                      {briefing.night.rhr && (
                        <BandChip label="PULS" value={briefing.night.rhr.value} delta={briefing.night.rhr.delta}
                          position={briefing.night.rhr.position} accent={accent} good="below" />
                      )}
                      {briefing.night.battery != null && (
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>AKKU</span>
                          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: T.ink, ...TNUM }}>{briefing.night.battery}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Only ever present when the ring could not be drawn. */}
                  {briefing.why && (
                    <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: T.mid }}>{briefing.why}</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── 02 — HEUTE: the plan ────────────────────────────────────── */}
          <motion.div {...step(2)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Chapter n="02" label="HEUTE" right={briefing.headlineMeta ?? undefined} />
            <span id="w3-morning-title" style={{
              fontSize: 30, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.05, color: T.ink, textWrap: 'balance',
            }}>{briefing.headline}</span>
          </motion.div>

          {/* ── 03 — RAUS: the conditions ───────────────────────────────── */}
          {briefing.window && (
            <motion.div {...step(3)} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Chapter n="03" label="RAUS" right={briefing.window.verdict ?? undefined} />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.8, color: T.ink, ...TNUM }}>{briefing.window.label}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.mid }}>{briefing.window.detail}</span>
              </div>
              <DayTracks hours={briefing.window.hours} from={briefing.window.bestFrom} to={briefing.window.bestTo}
                accent={accent} reduce={!!reduce} />
              {/* Three tracks need three names, or the blue row is a mystery. */}
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { c: accent, t: 'FAHRBAR' },
                  { c: T.cool, t: 'REGEN' },
                  { c: T.mid, t: 'WIND' },
                ].map((l) => (
                  <span key={l.t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: l.c }} />
                    <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.7, color: T.quiet }}>{l.t}</span>
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 04 — STAND: where the load leaves you ───────────────────── */}
          {briefing.body && (
            <motion.div {...step(4)} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Chapter n="04" label="STAND"
                right={briefing.body.weekSpent != null && briefing.body.weekPlanned != null
                  ? `${briefing.body.weekSpent}/${briefing.body.weekPlanned} TSS` : undefined} />
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
                {briefing.body.form != null && (
                  <Figure label="FORM" value={`${briefing.body.form > 0 ? '+' : ''}${briefing.body.form}`} sub="heute" />
                )}
                {briefing.body.fatigueDrop != null && (
                  <Figure label="ÜBER NACHT"
                    value={`${briefing.body.fatigueDrop > 0 ? '−' : '+'}${Math.abs(briefing.body.fatigueDrop)}`}
                    sub="Ermüdung" tone={briefing.body.fatigueDrop > 0 ? accent : T.ink} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <WeekShape week={briefing.body.week} accent={accent} reduce={!!reduce} />
                </div>
              </div>
            </motion.div>
          )}

          <motion.button {...step(5)} ref={primaryRef} onClick={onToday}
            style={{
              width: '100%', height: 50, borderRadius: 100, border: 0, background: accent, color: T.bg,
              fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 2,
            }}>
            Zum Tag<ArrowRight size={16} color={T.bg} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
