import { motion, useReducedMotion } from 'motion/react'
import { Flag, Target, ArrowRight } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'
import type { PhaseSeg } from './w3plan'

/**
 * W3 · Plan — THE DOCK, in the same idiom as Today's and Fahrten's.
 *
 * The plan screen used to open on a flat three-stat row, which made it the one
 * bottom-tab screen whose first surface spoke a different language from the
 * other two. Today opens on ONE number (readiness) with the meter that IS that
 * number; Fahrten opens on ONE number (the season's distance) the same way.
 * The plan's one number is the COUNTDOWN — every other figure on the page is
 * the working behind "how long have I got".
 *
 * THE METER IS THE PERIODISATION, NOT A PROGRESS BAR. Today's 22 segments are
 * a score; here the same 22 segments are the plan's weeks, grouped into their
 * four phases — Grundlage, Aufbau, Spezifisch, Taper — with the week the rider
 * is in lit brightest and the phases behind them filled. So the bar answers
 * "where am I in the season" at a glance, and the labels underneath say which
 * block that is, which is the question the old three-stat row answered in
 * words and never showed.
 *
 * PHASES ARE DRAWN AT THEIR REAL WIDTHS. A four-week taper and a six-week base
 * are not the same size on the bar, because a rider reading an evenly-divided
 * rail would take the wrong impression of how much base is left.
 *
 * NOTHING HERE IS INVENTED. With no plan there is no dock — `W3PlanPage` swaps
 * in `W3PlanGoalDock`, which asks for the goal instead of drawing an empty
 * season.
 */

const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'
/** Same count as Today's readiness meter, so the two read as one language. */
const SEGMENTS = 22

export interface W3PlanDockVm {
  /** Days until the goal event, or null when the plan has no dated event. */
  daysToStart: number | null
  eventName: string
  planWeekNum: number
  totalWeeks: number
  phases: PhaseSeg[]
  blockName: string | null
  /** 0..1 — the hero panel's scroll openness, same contract as the other docks. */
  expand?: number
}

/** Which phase a given plan week belongs to, by the rail's own week spans. */
function phaseOfWeek(phases: PhaseSeg[], week: number): PhaseSeg | null {
  for (const p of phases) {
    const [from, to] = p.weeks.replace('W', '').split('–').map(Number)
    const lo = from || 1
    const hi = to || lo
    if (week >= lo && week <= hi) return p
  }
  return null
}

export default function W3PlanDock({ vm, onOpen }: {
  vm: W3PlanDockVm
  onOpen?: () => void
}) {
  const reduce = useReducedMotion()

  // NO GOAL, NO SEASON BAR. Without a dated event there is no countdown and no
  // periodisation to draw — the engine still reports a block, but a phase rail
  // with GRUNDLAGE lit and "WOCHE 1/12" describes a season that is not aimed at
  // anything. Drawing it was the plan screen's version of the empty apparatus
  // `W3PlanEmptyView` exists to refuse. So the dock asks the question instead,
  // which is also the one action worth taking from here.
  if (vm.daysToStart == null) {
    return (
      <button
        onClick={onOpen}
        aria-label="Ziel wählen"
        style={{
          width: '100%', border: 0, textAlign: 'left', cursor: onOpen ? 'pointer' : 'default',
          background: T.heroDock, borderRadius: 28, padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 14, fontFamily: FONT,
        }}>
        <span style={{
          width: 44, height: 44, flex: 'none', borderRadius: 15, background: T.acidDim,
          display: 'grid', placeItems: 'center',
        }}>
          <Flag size={20} color={T.acid} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>
            NOCH KEIN ZIEL
          </span>
          <span style={{
            fontFamily: ARCHIVO, fontSize: 17, fontWeight: 700, color: T.ink,
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>Wähle dein Ziel</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>
            Dann plant der Coach rückwärts vom Renntag.
          </span>
        </span>
        <ArrowRight size={18} color={T.acid} style={{ flex: 'none' }} />
      </button>
    )
  }

  const open = Math.max(0, Math.min(1, vm.expand ?? 0))
  const total = Math.max(1, vm.totalWeeks)

  // Each segment stands for a slice of the season; a segment is "done" when the
  // week it represents is behind the rider.
  const doneUpTo = Math.round((Math.max(0, vm.planWeekNum - 1) / total) * SEGMENTS)
  const currentSeg = Math.min(SEGMENTS - 1, Math.round(((vm.planWeekNum - 0.5) / total) * SEGMENTS))

  // Phase label runs, at their true proportional widths.
  const runs = vm.phases.map((p) => {
    const [from, to] = p.weeks.replace('W', '').split('–').map(Number)
    const lo = from || 1
    const hi = to || lo
    return { name: p.name, weeks: Math.max(1, hi - lo + 1), active: !!p.active }
  })

  return (
    <button
      onClick={onOpen}
      aria-label="Trainingsplan im Detail"
      style={{
        width: '100%', border: 0, textAlign: 'left', cursor: onOpen ? 'pointer' : 'default',
        background: T.heroDock, borderRadius: 28,
        padding: `${12 + open * 4}px 16px ${12 + open * 4}px`,
        display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT,
      }}>

      {/* ── the countdown · the event · the week ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', minWidth: 0 }}>
        <span style={{
          fontFamily: ARCHIVO, fontSize: 44, fontWeight: 700, lineHeight: 0.86,
          color: vm.daysToStart != null ? T.acid : T.heroOff,
          fontVariantNumeric: 'tabular-nums', flex: 'none',
        }}>{vm.daysToStart != null ? vm.daysToStart : DASH}</span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>
            {vm.daysToStart != null ? 'TAGE BIS ZUM START' : 'KEIN RENNTAG GESETZT'}
          </span>
          <span style={{
            fontFamily: ARCHIVO, fontSize: 17, fontWeight: 700, color: T.ink,
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{vm.eventName}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', flex: 'none' }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>WOCHE</span>
          <span style={{ fontFamily: ARCHIVO, fontSize: 15, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
            {vm.planWeekNum}/{vm.totalWeeks}
          </span>
        </div>
      </div>

      {/* ── the meter: the season, in 22 segments ── */}
      <div style={{ display: 'flex', gap: 3, height: 10, width: '100%' }} aria-hidden>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const week = Math.min(total, Math.max(1, Math.round(((i + 0.5) / SEGMENTS) * total)))
          const seg = phaseOfWeek(vm.phases, week)
          const isNow = i === currentSeg
          const done = i < doneUpTo
          // Three states, one hue: the week you are in is lit, the weeks behind
          // you are filled, the weeks ahead are the unlit ground. A second
          // colour per phase would make four accents on a screen that already
          // spends its one on the countdown.
          const bg = isNow ? T.acid : done ? `${T.acid}66` : T.heroOff
          return (
            <motion.span key={i}
              initial={reduce ? false : { opacity: 0.25 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: EASE, delay: done ? i * 0.018 : 0 }}
              title={seg?.name}
              style={{
                flex: 1, height: 10, borderRadius: 3,
                background: isNow || done
                  ? `linear-gradient(180deg, ${bg} 0%, ${bg}D9 100%)`
                  : T.heroOff,
                boxShadow: isNow ? `0 0 10px ${T.acid}80, inset 0 1px 0 ${T.ink}40`
                  : done ? `inset 0 1px 0 ${T.ink}40` : 'none',
              }} />
          )
        })}
      </div>

      {/* ── the four blocks, at their real widths ── */}
      <div style={{ display: 'flex', gap: 3, width: '100%' }}>
        {runs.map((r) => (
          <span key={r.name}
            style={{
              flexGrow: r.weeks, flexBasis: 0, minWidth: 0,
              fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9,
              textTransform: 'uppercase',
              color: r.active ? T.acid : T.heroMid,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{r.name}</span>
        ))}
      </div>

      {/* ── the working, revealed by scrolling — same gesture as the other docks ── */}
      <div style={{
        display: 'flex', gap: 10, width: '100%',
        height: open * 62, opacity: open, overflow: 'hidden',
        marginTop: open * 4, pointerEvents: open > 0.6 ? 'auto' : 'none',
      }}>
        {[
          { icon: Target, label: 'AKTIVER BLOCK', value: vm.blockName ?? DASH },
          { icon: Flag, label: 'RENNTAG', value: vm.daysToStart != null ? `in ${vm.daysToStart} Tagen` : DASH },
        ].map((s) => (
          <div key={s.label} style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
            gap: 7, padding: '11px 12px 10px', borderRadius: 16,
            background: T.heroDock, height: 62,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.heroMid }}>
              <s.icon size={10} color={T.heroMid} />{s.label}
            </span>
            <span style={{
              fontFamily: ARCHIVO, fontSize: 15, fontWeight: 700, lineHeight: 1,
              color: s.value === DASH ? T.heroOff : T.ink,
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s.value}</span>
          </div>
        ))}
      </div>
    </button>
  )
}
