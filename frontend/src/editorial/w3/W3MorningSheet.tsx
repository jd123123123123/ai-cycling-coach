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

/** The whole forecast day as bars, with the named window bracketed. */
function DayStrip({ hours, from, to, accent, reduce }: {
  hours: { hour: number; q: number | null; rideable: boolean }[]
  from: number | null; to: number | null; accent: string; reduce: boolean
}) {
  const shown = hours.filter((h) => h.rideable)
  if (shown.length < 2) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 54, width: '100%' }}>
      {shown.map((h, i) => {
        const inWindow = from != null && to != null && h.hour >= from && h.hour <= to
        // A null hour is a gap in the forecast, not a bad hour — it draws as a
        // stub in the track colour rather than as a short acid bar.
        const q = h.q
        return (
          <motion.div
            key={h.hour}
            initial={reduce ? false : { height: 4 }}
            animate={{ height: q == null ? 4 : Math.max(6, Math.round(q * 54)) }}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.25 + i * 0.02, ease: 'easeOut' }}
            style={{
              flex: 1, borderRadius: 3, minWidth: 0,
              background: q == null ? T.d1 : inWindow ? accent : `${accent}38`,
            }} />
        )
      })}
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
          position: 'relative', width: 390, maxWidth: '100%', height: '100dvh', overflow: 'hidden',
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
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, color: T.quiet }}>
                {briefing.greeting}
              </span>
              {briefing.dateLabel && (
                <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{briefing.dateLabel}</span>
              )}
              {briefing.streak && (
                <span style={{
                  alignSelf: 'flex-start', marginTop: 2, fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                  padding: '5px 9px', borderRadius: 100, background: T.tile, color: T.mid,
                }}>{briefing.streak}</span>
              )}
            </div>
          </motion.div>

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

          {/* ── the day, drawn ──────────────────────────────────────────── */}
          {briefing.window && (
            <motion.div {...step(2)} style={{
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
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet, ...TNUM }}>07</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>{briefing.window.detail}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet, ...TNUM }}>21</span>
              </div>
            </motion.div>
          )}

          {/* ── what the reason rests on ────────────────────────────────── */}
          {briefing.readings.length > 0 && (
            <motion.div {...step(3)} style={{ display: 'flex', gap: 8 }}>
              {briefing.readings.map((r) => (
                <div key={r.key} style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3,
                  padding: '12px 13px', borderRadius: 18, background: T.heroDock,
                }}>
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{r.label}</span>
                  <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.5, color: T.ink, ...TNUM }}>{r.value}</span>
                  {r.note && <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{r.note}</span>}
                </div>
              ))}
            </motion.div>
          )}

          <motion.div {...step(4)} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
