import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  X, ArrowRight, ChevronRight, Trophy, Bike, Timer, Route as RouteIcon,
  Mountain, TrendingUp, TrendingDown, Minus, Sparkles,
} from 'lucide-react'
import { useWeekReviewVm, recapHasStory } from './useWeekReviewVm'
import type { W3WeekReviewVm, W3ReviewTone } from './W3WeekReviewView'
import { T, FONT, EASE, grow, DASH } from './w3tokens'

/**
 * W3 · Today — "Deine letzte Woche" as a BUTTON, and the celebration popup
 * behind it.
 *
 * Why this exists next to `/e/w3-week-review`: the full review is a start-of-
 * week moment that `W3WeekReviewGate` fires ONCE, in the first three days of a
 * new week. After that the story was unreachable from Today, and a rider who
 * dismissed it lost it entirely. This card keeps it on the main screen all week
 * — earned, tappable, and never auto-opening.
 *
 * Both surfaces read `useWeekReviewVm`, the single producer, so the popup and
 * the page can never tell the rider two different versions of their own week.
 *
 * HONESTY:
 *  · The card is not rendered at all unless last week holds a real story
 *    (`recapHasStory` — a ride, or a plan it could be measured against).
 *  · Confetti fires only on `vm.celebrate`, which the producer sets for a real
 *    breakthrough or a genuinely strong week. A quiet week gets the same
 *    layout with no celebration and forward-looking copy — never guilt, and
 *    never a party for a week that did not happen.
 *  · Every number is the producer's; this file adds no arithmetic of its own.
 */

const ellipsis = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }
const nf = (x: number) => x.toLocaleString('de-DE')

/** Tone → how loud the card is allowed to be. A quiet week is stated, not sold. */
const TONE_HUE: Record<W3ReviewTone, string> = {
  strong: T.acid, steady: T.acid, quiet: T.mid, empty: T.quiet,
}
const STAT_ICON = { rides: Bike, timer: Timer, route: RouteIcon, climb: Mountain }
const DELTA_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus }
const CONFETTI_HUES = [T.acid, T.evening, T.cool, T.warn, T.acid, T.training]

/** A short burst, only ever mounted when the week earned it. */
function Confetti({ reduce }: { reduce: boolean | null }) {
  if (reduce) return null
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 28 }}>
      {Array.from({ length: 26 }).map((_, i) => {
        const left = (i * 37) % 100
        const delay = (i % 7) * 0.06
        const hue = CONFETTI_HUES[i % CONFETTI_HUES.length]
        return (
          <motion.span key={i}
            initial={{ y: -30, opacity: 0, rotate: 0 }}
            animate={{ y: 320, opacity: [0, 1, 1, 0], rotate: 320 }}
            transition={{ duration: 1.9, ease: 'easeOut', delay }}
            style={{ position: 'absolute', left: `${left}%`, top: 0, width: 5, height: 9, borderRadius: 1, background: hue }} />
        )
      })}
    </div>
  )
}

/** The seven real daily TSS buckets — the shape of the week at a glance.
 *  Bars, not blocks: at full column width a 7-day strip reads as a row of
 *  squares floating at different heights, which is not a chart. They sit on a
 *  shared baseline rule so a rest day (a 2px stub) is legible AS a rest day. */
function WeekShape({ vm, h, reduce, labels = true }: {
  vm: W3WeekReviewVm; h: number; reduce: boolean | null; labels?: boolean
}) {
  if (vm.days.length === 0) return null
  const barMax = h - (labels ? 13 : 3)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: barMax, width: '100%' }}>
        {vm.days.map((d, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: '100%' }}>
            <motion.div
              initial={reduce ? false : { height: 2 }}
              animate={{ height: Math.max(2, Math.round((d.pct / 100) * barMax)) }}
              transition={grow(i * 0.04)}
              style={{ width: '52%', borderRadius: 2, background: d.peak ? T.acid : d.pct > 0 ? T.d3 : T.surface2, boxShadow: d.peak ? `0 0 10px ${T.acid}66` : 'none' }} />
          </div>
        ))}
      </div>
      <div style={{ height: 1, background: T.rule }} />
      {labels && (
        <div style={{ display: 'flex', gap: 3, width: '100%' }}>
          {vm.days.map((d, i) => (
            <span key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 8, fontWeight: 700, color: d.peak ? T.acid : T.quiet }}>{d.letter}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── the popup ───────────────────────────────────────────────────────────────
function RecapModal({ vm, onClose }: { vm: W3WeekReviewVm; onClose: () => void }) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const hue = TONE_HUE[vm.tone]

  // Escape closes; the page behind must not scroll while the sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const ramp = vm.nextTss != null && vm.rampFrom != null && vm.rampFrom > 0
    ? Math.round(((vm.nextTss - vm.rampFrom) / vm.rampFrom) * 100)
    : null

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Wochenrückblick"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: '#000000B8',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: FONT,
      }}>
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.42, ease: EASE }}
        style={{
          position: 'relative', width: '100%', maxWidth: 390, maxHeight: '92dvh', overflowY: 'auto',
          background: T.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          border: `1px solid ${T.stroke}`, borderBottom: 'none',
          display: 'flex', flexDirection: 'column', gap: 18, padding: '10px 20px 28px',
        }}>

        {vm.celebrate && <Confetti reduce={reduce} />}

        {/* Grabber + close. FULL-BLEED on purpose: inside the sheet's 20px
            padding the scrolling content stayed visible in the gutters beside
            it and tore through the header. Negative margins take the opaque
            band edge to edge. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 3, background: T.bg,
          margin: '0 -20px', padding: '8px 20px 10px',
        }}>
          <span style={{ width: 34 }} />
          <span style={{ width: 40, height: 4, borderRadius: 100, background: T.d2 }} />
          <button onClick={onClose} aria-label="Schließen"
            style={{ width: 34, height: 34, borderRadius: 100, border: 0, background: T.surface, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <X size={16} color={T.mid} />
          </button>
        </div>

        {/* ── ACT 1 · what happened ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: hue }}>{vm.kicker}</span>
            <span style={{ ...ellipsis, fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{vm.weekTag} · {vm.rangeLabel}</span>
          </div>
          <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1.1, lineHeight: 1.08, color: T.ink }}>
            {vm.title} <span style={{ color: hue }}>{vm.titleAccent}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{vm.verdict}</span>
        </div>

        {/* the week's load against the plan it was measured on */}
        <div style={{ background: T.surface, borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.6, lineHeight: 0.95, color: T.ink }}>{nf(vm.tssDone)}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet, paddingBottom: 5 }}>TSS</span>
            {vm.compliancePct != null && (
              <span style={{ marginLeft: 'auto', flex: 'none', padding: '5px 11px', borderRadius: 100, background: `${hue}1F`, fontSize: 11, fontWeight: 700, color: hue }}>
                {vm.compliancePct} %
              </span>
            )}
          </div>
          {vm.compliancePct != null && (
            <div style={{ height: 6, borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
              <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.min(100, vm.compliancePct)}%` }} transition={grow(0.1)}
                style={{ height: '100%', borderRadius: 100, background: hue }} />
            </div>
          )}
          <span style={{ ...ellipsis, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{vm.complianceLabel}</span>
          <WeekShape vm={vm} h={54} reduce={reduce} />
        </div>

        {/* four real totals */}
        <div style={{ display: 'flex', gap: 7 }}>
          {vm.stats.map((s) => {
            const Icon = STAT_ICON[s.icon]
            return (
              <div key={s.label} style={{ flex: 1, minWidth: 0, background: T.surface, borderRadius: 16, padding: '12px 9px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                <Icon size={13} color={T.quiet} />
                <span style={{ ...ellipsis, width: '100%', fontSize: 17, fontWeight: 800, letterSpacing: -0.6, color: s.value === DASH ? T.quiet : T.ink }}>
                  {s.value}{s.unit && <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet }}> {s.unit}</span>}
                </span>
                <span style={{ ...ellipsis, width: '100%', fontSize: 7.5, fontWeight: 700, letterSpacing: 0.7, color: T.quiet }}>{s.label}</span>
              </div>
            )
          })}
        </div>

        {/* vs. the week before */}
        {vm.deltas.length > 0 && (
          <div style={{ display: 'flex', gap: 14, padding: '0 2px' }}>
            {vm.deltas.map((d) => {
              const Icon = DELTA_ICON[d.dir]
              // Context, not headline: the week-over-week move is quiet so the
              // celebration (the breakthrough card) keeps the loud slot.
              const dh = d.dir === 'flat' ? T.quiet : T.mid
              return (
                <div key={d.label} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ ...ellipsis, fontSize: 7.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{d.label} ggü. Vorwoche</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: dh }}>
                    <Icon size={11} />{d.value}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* the moment worth celebrating — a real PB, else the biggest ride */}
        {vm.moment && (
          <div style={{ background: T.surface, borderRadius: 22, padding: 18, display: 'flex', gap: 13, alignItems: 'flex-start', minWidth: 0 }}>
            <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 12, background: T.acidDim, display: 'grid', placeItems: 'center' }}>
              <Trophy size={17} color={T.acid} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ ...ellipsis, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.acid }}>{vm.moment.badge}</span>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.25, color: T.ink, minWidth: 0 }}>{vm.moment.title}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.mid, minWidth: 0 }}>{vm.moment.detail}</span>
            </div>
          </div>
        )}

        {/* what the week did to the fitness curve */}
        {vm.fitness && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px', minWidth: 0 }}>
            <span style={{ flex: 'none', fontSize: 20, fontWeight: 700, letterSpacing: -0.6, color: vm.fitness.dir === 'up' ? T.ink : T.mid }}>{vm.fitness.delta}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ ...ellipsis, fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>FITNESS · {vm.fitness.now}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.mid, minWidth: 0 }}>{vm.fitness.note}</span>
            </div>
          </div>
        )}

        {/* ── ACT 2 · what it means for this week ── */}
        <div style={{ height: 1, background: T.rule }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* Quiet kicker: the acid on this screenful belongs to the headline
              accent, the plan bar and the CTA — not to a section label. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Sparkles size={12} color={T.quiet} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>WAS DAS FÜR DIESE WOCHE HEISST</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.15, color: T.ink }}>
            {vm.nextTitle} <span style={{ color: T.acid }}>{vm.nextAccent}</span>
          </span>
          <span style={{ ...ellipsis, fontSize: 11, fontWeight: 600, color: T.quiet }}>{vm.nextBlock}</span>

          {/* last week's bar next to this week's — the ramp, made visible */}
          {vm.nextTss != null && (
            <div style={{ background: T.surface, borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, minWidth: 0 }}>
                <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1.1, lineHeight: 1, color: T.ink }}>{nf(vm.nextTss)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, paddingBottom: 3 }}>TSS</span>
                {ramp != null && (
                  <span style={{ marginLeft: 'auto', flex: 'none', padding: '5px 11px', borderRadius: 100, background: T.surface2, fontSize: 11, fontWeight: 700, color: T.mid }}>
                    {ramp > 0 ? '+' : ramp < 0 ? '−' : '±'}{Math.abs(ramp)} %
                  </span>
                )}
              </div>
              {vm.rampFrom != null && vm.rampFrom > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Compare label={vm.rampFromLabel} value={vm.rampFrom} max={Math.max(vm.rampFrom, vm.nextTss)} hue={T.d3} reduce={reduce} />
                  <Compare label="diese Woche geplant" value={vm.nextTss} max={Math.max(vm.rampFrom, vm.nextTss)} hue={T.acid} reduce={reduce} />
                </div>
              )}
              <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>{vm.nextTssNote}</span>
            </div>
          )}

          {/* the evidence the generator itself published — max three here; the
              full page carries the rest */}
          {vm.evidence.slice(0, 3).map((e) => (
            <div key={e.key} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', minWidth: 0 }}>
              <span style={{ flex: 'none', width: 3, alignSelf: 'stretch', borderRadius: 2, background: T.d2 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                  <span style={{ flex: 'none', fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{e.label}</span>
                  <span style={{ ...ellipsis, fontSize: 12.5, fontWeight: 700, color: T.ink }}>{e.value}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.45, color: T.mid, minWidth: 0 }}>{e.note}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <button onClick={onClose}
            style={{ width: '100%', border: 0, borderRadius: 100, padding: '15px 0', background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer' }}>
            Los geht’s
          </button>
          <button onClick={() => { onClose(); navigate('/e/w3-week-review') }}
            style={{ width: '100%', border: 0, borderRadius: 100, padding: '13px 0', background: 'transparent', color: T.mid, fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 0.4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            GANZER RÜCKBLICK <ArrowRight size={13} />
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

function Compare({ label, value, max, hue, reduce }: { label: string; value: number; max: number; hue: string; reduce: boolean | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <span style={{ ...ellipsis, flex: 'none', width: 118, fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden', minWidth: 0 }}>
        <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} transition={grow(0.12)}
          style={{ height: '100%', borderRadius: 100, background: hue }} />
      </div>
      <span style={{ flex: 'none', width: 42, textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{nf(Math.round(value))}</span>
    </div>
  )
}

// ── the Today card ──────────────────────────────────────────────────────────
export default function W3WeekRecapCard() {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const { vm, recap } = useWeekReviewVm()

  // No story last week → no card. Nothing is invented to fill the slot.
  if (!vm || !recapHasStory(recap)) return null

  const hue = TONE_HUE[vm.tone]
  const t = vm.stats

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: '0 20px 26px', fontFamily: FONT }}>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{
          width: '100%', border: `1px solid ${T.stroke}`, borderRadius: 24, padding: 18, cursor: 'pointer',
          background: T.surface, fontFamily: FONT, textAlign: 'left',
          display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
          <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: hue }}>{vm.kicker}</span>
          <span style={{ ...ellipsis, flex: 1, fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{vm.weekTag}</span>
          {vm.celebrate && (
            <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 100, background: T.acidDim }}>
              <Trophy size={10} color={T.acid} />
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: T.acid }}>ZU FEIERN</span>
            </span>
          )}
          <ChevronRight size={16} color={T.quiet} style={{ flex: 'none' }} />
        </div>

        {/* The headline owns the full width — a 21px line squeezed next to a
            104px chart read as neither. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', minWidth: 0 }}>
          <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.85, lineHeight: 1.08, color: T.ink, minWidth: 0 }}>
            {vm.title} <span style={{ color: hue }}>{vm.titleAccent}</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
            <span style={{ flex: 'none', fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{nf(vm.tssDone)}</span>
            <span style={{ ...ellipsis, flex: 1, fontSize: 10.5, fontWeight: 600, color: T.quiet }}>
              TSS · {t[0]?.value} Fahrten{t[2]?.value !== DASH ? ` · ${t[2]?.value} km` : ''}
              {vm.compliancePct != null ? ` · ${vm.compliancePct} % vom Plan` : ''}
            </span>
          </div>
        </div>

        {/* The week itself, at full card width — the shape IS the story. */}
        <WeekShape vm={vm} h={46} reduce={reduce} />
      </button>

      {open && <RecapModal vm={vm} onClose={() => setOpen(false)} />}
    </div>
  )
}
