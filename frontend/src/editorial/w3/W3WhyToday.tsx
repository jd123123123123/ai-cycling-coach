import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ChevronDown, Compass, Layers, Target, CalendarClock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import type { AdaptationChange } from '../../api/coach'
import { T, FONT, EASE, band, Kicker } from './w3tokens'

/**
 * W3 · "Warum diese Einheit?" — the daily, per-session reason.
 *
 * This is the SESSION-level why. It deliberately does NOT restate the coach
 * verdict that sits under the KI-COACH pill higher up the page: that block is
 * the DAY-level call in the coach's own prose ("can I go hard at all"). This
 * one answers the next question down — why THIS session, at this size, today —
 * and it answers it structurally: every row names the measurement, what that
 * measurement did to the session, and (on tap) the principle behind the move.
 *
 * REAL DATA ONLY — nothing here is composed from a fixture:
 *  · the signal rows        — GET /coach/brief → `adaptations.changes[]`
 *    (services/adaptation_explainer.py: signal / detail / action / principle /
 *    severity / kind), already German when the brief was fetched with locale=de.
 *  · the block sentence     — GET /weeks/current → `meso_block.block_position`
 *    + `meso_block.block_index_in_meso` (Issurin 3:1 block, week index 0-3).
 *  · the volume ceiling     — GET /weeks/current → `meso_block.hours_note`
 *    ({declared_hours, start_hours}), written by mesocycle_generator when the
 *    delivered week lands below the hours the athlete declared, because the
 *    weekly budget is anchored on CTL (max +50%) and ramped at max +8%/week.
 *  · the footer chips       — `meso_block.phase`, `weekly_tss_target`,
 *    `days_to_event`.
 *
 * Absent data renders NOTHING (not a placeholder sentence): no adaptations and
 * no meso block → the whole card is omitted. An empty `changes[]` renders the
 * explainer's own honest steady-state summary rather than manufactured drama.
 */

type Severity = 'boost' | 'hold' | 'ease'

const SEV_COLOR: Record<Severity, string> = {
  boost: T.acid,   // green light — the one loud element in this card
  hold: T.mid,     // steady — deliberately quiet
  ease: T.warn,    // back off — amber, never alarm-red
}

const ARROW: Record<AdaptationChange['direction'], string> = { up: '↑', down: '↓', flat: '→' }

/** Issurin block position → what that week is FOR, in plain German. */
export const BLOCK_DE: Record<string, { name: string; means: string }> = {
  accumulation: { name: 'Umfangsblock', means: 'Umfang vor Intensität — hier wird die aerobe Basis breit gemacht' },
  transmutation: { name: 'Intensitätsblock', means: 'die Basis wird in wettkampfspezifische Schärfe umgesetzt' },
  realization: { name: 'Formblock', means: 'Last runter, Schärfe rein — die Form wird scharf gestellt' },
  recovery: { name: 'Entlastungswoche', means: 'die Last fällt bewusst ab, damit die Anpassung greift' },
}

/** Friel phase code → German label. Unknown codes print themselves. */
const PHASE_DE: Record<string, string> = {
  base1: 'Grundlage 1', base2: 'Grundlage 2',
  build1: 'Aufbau 1', build2: 'Aufbau 2',
  peak: 'Peak', taper: 'Taper', race: 'Wettkampf',
  transition: 'Übergang', prep: 'Vorbereitung',
}

const num = (n: number, digits = 0) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** A single reason: what was measured, what it did, why that rule exists. */
interface Reason {
  key: string
  label: string
  severity: Severity
  arrow: string
  /** The measurement itself — always carries its own number. */
  detail: string
  /** What that measurement did to today's session. */
  action: string
  /** The rule behind it, revealed on tap. Null when there is none to cite. */
  principle: string | null
  /** Where the number came from — measured overnight vs derived from training. */
  provenance: string | null
  /** A real proportion to DRAW, when two structured numbers exist for it.
   *  Only ever set from numeric fields — never parsed back out of prose. */
  meter?: { value: number; max: number; caption: string } | null
}

/**
 * Pull the measurement to the front of the row so it can be SEEN.
 *
 * The explainer hands us whole sentences — "HRV liegt 14 % über dem Schnitt —
 * gut erholt" — and three of those stacked is the wall of text this card had
 * become. The number is the thing the rider is looking for, so it gets lifted
 * out and set large, with the remainder of the sentence as its caption.
 *
 * This is TYPOGRAPHY, NOT PARSING FOR MEANING: the figure shown is a substring
 * of the sentence the server already wrote, and if no leading figure is found
 * the sentence is printed exactly as before. Nothing is computed, rounded or
 * re-worded here.
 */
function liftFigure(detail: string): { figure: string; rest: string } | null {
  const m = detail.match(/([+−-]?\d+(?:[.,]\d+)?)\s*(%|W\/kg|W|bpm|ms|TSS)?/)
  if (!m || m.index == null) return null
  // Take the TAIL after the figure — never cut the figure out of the middle.
  // Removing it in place breaks the sentence: "TSB liegt bei +17 — frisch"
  // would render as "TSB liegt bei — frisch". What comes before the number is
  // only the signal's own name ("HRV liegt", "TSB liegt bei"), which the row
  // label already states, so dropping the head loses nothing and reads clean.
  const rest = detail
    .slice(m.index + m[0].length)
    .replace(/^[\s,–—-]+/, '')
    .trim()
  if (rest.length <= 2) return null
  return { figure: (m[1] + (m[2] ?? '')).replace('-', '−'), rest }
}

function ReasonRow({ r, open, onToggle }: { r: Reason; open: boolean; onToggle: () => void }) {
  const reduce = useReducedMotion()
  const c = SEV_COLOR[r.severity]
  // A row that already DRAWS its proportion keeps its sentence whole — the
  // hours line reads "10 h/Woche angegeben", where the unit is glued to the
  // next word and a lift would strand "/Woche angegeben".
  const figure = r.meter ? null : liftFigure(r.detail)
  return (
    <div style={{ display: 'flex', borderRadius: 16, background: T.surface2, overflow: 'hidden' }}>
      {/* Severity rail — an easing day and a green-light day never look alike. */}
      <div style={{ width: 3, flex: 'none', background: c, opacity: r.severity === 'hold' ? 0.45 : 1 }} />
      <button
        onClick={r.principle ? onToggle : undefined}
        aria-expanded={r.principle ? open : undefined}
        style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
          padding: '12px 14px', background: 'transparent', border: 'none',
          fontFamily: FONT, textAlign: 'left', cursor: r.principle ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: c, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: c, flex: 'none', lineHeight: 1 }}>{r.arrow}</span>
          {r.provenance && (
            <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet, flex: 'none', marginLeft: 'auto' }}>{r.provenance}</span>
          )}
          {r.principle && (
            <motion.span
              animate={reduce ? undefined : { rotate: open ? 180 : 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              style={{ display: 'flex', flex: 'none', marginLeft: r.provenance ? 4 : 'auto' }}
            >
              <ChevronDown size={13} color={T.quiet} />
            </motion.span>
          )}
        </div>

        {/* The evidence — never "du bist erholt", always the number, and the
            number set large enough to be read at a glance instead of found
            inside a sentence. */}
        {figure ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, width: '100%', minWidth: 0 }}>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, lineHeight: 1, color: c, flex: 'none' }}>
              {figure.figure}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, color: T.mid, minWidth: 0 }}>
              {figure.rest}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: T.ink, minWidth: 0 }}>{r.detail}</span>
        )}

        {/* A drawn proportion, where two real numbers exist for one. */}
        {r.meter && r.meter.max > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%', minWidth: 0 }}>
            <div style={{ height: 6, borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
              <motion.div
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max(2, Math.min(100, (r.meter.value / r.meter.max) * 100))}%` }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
                style={{ height: '100%', borderRadius: 100, background: c }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{r.meter.caption}</span>
          </div>
        )}

        {/* What it did to the session. Suppressed when the card already states
            this consequence once above every row (see `sharedAction`). */}
        {r.action && (
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4, color: T.mid, minWidth: 0 }}>
            <span style={{ color: c, fontWeight: 700 }}>→ </span>{r.action}
          </span>
        )}

        {open && r.principle && (
          <motion.span
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.5, color: T.quiet, borderTop: `1px solid ${T.rule}`, paddingTop: 8, marginTop: 2, minWidth: 0 }}
          >
            {r.principle}
          </motion.span>
        )}
      </button>
    </div>
  )
}

export default function W3WhyToday() {
  const { data: brief } = useCoachBrief()
  const { data: week } = useCurrentWeek(0)
  const [open, setOpen] = useState<string | null>(null)

  const adaptations = brief?.adaptations ?? null
  const changes: AdaptationChange[] = adaptations?.changes ?? []
  const meso = week?.meso_block ?? null
  const hoursNote = meso?.hours_note ?? null
  const today = (week?.days ?? []).find((d) => d.is_today) ?? null

  // Nothing real on the wire yet → say nothing at all.
  if (!adaptations && !meso) return null

  // Does the PLAN prescribe rest today? Real, from the day's own `category`.
  const isRestDay = today?.category === 'rest'

  // ── The reasons ──────────────────────────────────────────────────────────
  const reasons: Reason[] = changes.map((c, i) => {
    // REST-DAY RECONCILIATION. The explainer speaks about the BODY: a green
    // HRV legitimately reads "grünes Licht für eine Intensitätseinheit". On a
    // day the plan prescribes rest that sentence contradicts the plan, and
    // the rider is left to reconcile two true statements. The measurement and
    // the principle are untouched — only the ACTION line is replaced by what
    // the plan actually does with that signal today, and the row loses its
    // green-light colour so nothing on a rest day shouts "go".
    const restOverride = isRestDay && c.severity === 'boost'
    return {
      key: `c${i}`,
      label: c.signal,
      severity: restOverride ? 'hold' : ((c.severity as Severity) ?? 'hold'),
      arrow: ARROW[c.direction] ?? '→',
      detail: c.detail.charAt(0).toUpperCase() + c.detail.slice(1),
      action: restOverride
        ? 'Der Plan hält heute trotzdem Ruhetag — die Erholung wird angelegt, nicht ausgegeben.'
        : c.action,
      principle: c.principle || null,
      // `kind` is set by the explainer: 'recovery' = measured off the body
      // overnight, 'load' = derived from training history. Older briefs (before
      // the field existed) simply carry no provenance chip.
      provenance: c.kind === 'recovery'
        ? 'über Nacht gemessen'
        : c.kind === 'load'
          ? 'aus deiner Belastung'
          : null,
    }
  })

  // The standing constraint: the weekly budget is anchored on the fitness the
  // athlete actually carries (CTL), not on the hours they declared — so a
  // 12-h declaration on a low CTL delivers a much shorter week, on purpose.
  if (hoursNote && hoursNote.declared_hours > 0 && hoursNote.start_hours > 0) {
    reasons.push({
      key: 'hours',
      label: 'Wochenumfang',
      severity: 'hold',
      arrow: '→',
      detail: `Du hast ${num(hoursNote.declared_hours, hoursNote.declared_hours % 1 ? 1 : 0)} h/Woche angegeben — der Plan startet bei ${num(hoursNote.start_hours, 1)} h`,
      action: 'Die Wochenlast ist an deine aktuelle Fitness gekoppelt, nicht an deinen Kalender.',
      // The one row here that owns two real numbers, so it is the one row that
      // can honestly be DRAWN: how much of the declared week the plan currently
      // starts at. Straight from the fields — nothing read back out of the text.
      meter: {
        value: hoursNote.start_hours,
        max: hoursNote.declared_hours,
        caption: `${num(hoursNote.start_hours, 1)} h von ${num(hoursNote.declared_hours, hoursNote.declared_hours % 1 ? 1 : 0)} h angegeben`,
      },
      principle: 'Dein Trainingsstand (CTL) trägt aktuell nur dieses Startvolumen. Der Plan steigert es um maximal 8 % pro Woche — schneller aufgebauter Umfang wird nicht zu Fitness, sondern zu Ermüdung.',
      provenance: 'aus deinem Plan',
    })
  }

  // A consequence that lands under two or more signals is a fact about the DAY,
  // not about any one signal — hoisted so it is read once instead of repeated.
  const actionCounts = new Map<string, number>()
  for (const r of reasons) if (r.action) actionCounts.set(r.action, (actionCounts.get(r.action) ?? 0) + 1)
  const sharedAction = [...actionCounts.entries()].find(([, n]) => n > 1)?.[0] ?? null

  // ── The lead: one plain sentence, from the block the week sits in ────────
  const blockInfo = meso ? BLOCK_DE[meso.block_position] ?? null : null
  const weekNo = meso != null && meso.block_index_in_meso >= 0 ? meso.block_index_in_meso + 1 : null
  const weekLabel = weekNo == null
    ? null
    : weekNo <= 4 ? `Woche ${weekNo} von 4` : `Woche ${weekNo} im Block`
  const lead = blockInfo && weekLabel
    ? `${weekLabel} im ${blockInfo.name}: ${blockInfo.means}.`
    : blockInfo
      ? `${blockInfo.name}: ${blockInfo.means}.`
      : null

  // The adjustment line under the lead. With no changes this is the explainer's
  // own honest steady-state sentence — not a manufactured one.
  // No count in the copy: the rows below also carry the standing volume
  // constraint, which is not one of `changes` — a number here would disagree
  // with what the athlete can see. On a rest day the line first states WHO
  // each side speaks for, so the readiness card above and this card read as
  // one voice instead of two contradicting ones.
  const sub = changes.length === 0
    ? adaptations?.summary ?? null
    : isRestDay
      ? 'Ruhetag: die Signale unten beschreiben deinen Körper — über den Tag entscheidet der Plan.'
      : 'Das ist heute in die Entscheidung eingeflossen:'

  // Card accent: what the rendered rows actually say (post rest-override), in
  // this order of priority.
  const eases = reasons.filter((r) => r.severity === 'ease').length
  const boosts = reasons.filter((r) => r.severity === 'boost').length
  const accent = eases > 0 ? T.warn : boosts > 0 ? T.acid : T.mid

  const sessionTitle = today?.title ?? null

  const chips: { icon: LucideIcon; text: string }[] = []
  if (meso?.phase) chips.push({ icon: Layers, text: PHASE_DE[meso.phase] ?? meso.phase })
  if (meso?.weekly_tss_target) chips.push({ icon: Target, text: `Wochenbudget ${num(Math.round(meso.weekly_tss_target))} TSS` })
  if (meso?.days_to_event != null && meso.days_to_event >= 0) {
    chips.push({ icon: CalendarClock, text: `${num(meso.days_to_event)} Tage bis zum Ziel` })
  }

  return (
    <div style={{ ...band(26), gap: 12, fontFamily: FONT }}>
      <div style={{ borderRadius: 24, padding: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header — the question, then today's session by name. */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ width: 40, height: 40, borderRadius: 14, background: `${accent}1F`, display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Compass size={19} color={accent} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: accent }}>
              Warum diese Einheit
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sessionTitle ?? 'Dein Tag im Plan'}
            </span>
          </div>
        </div>

        {/* Lead — one plain sentence about where the week sits, then status. */}
        {(lead || sub) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {lead && <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.4, color: T.ink }}>{lead}</span>}
            {sub && <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{sub}</span>}
          </div>
        )}

        {/* SAID ONCE, NOT UNDER EVERY ROW. On a rest day the override gives HRV
            and TSB the identical consequence sentence, so the card printed the
            same line twice within four lines of itself. When a consequence is
            shared it belongs to the day, not to each signal: it is stated here
            once and struck from the rows below. */}
        {sharedAction && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 14, background: T.surface2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: accent, flex: 'none', lineHeight: 1.4 }}>→</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.mid, minWidth: 0 }}>{sharedAction}</span>
          </div>
        )}

        {/* The reasons, each naming its own evidence. */}
        {reasons.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reasons.map((r) => (
              <ReasonRow
                key={r.key}
                r={sharedAction && r.action === sharedAction ? { ...r, action: '' } : r}
                open={open === r.key}
                onToggle={() => setOpen(open === r.key ? null : r.key)} />
            ))}
          </div>
        )}

        {/* Where this week sits — real block context, honest "—" by omission. */}
        {chips.length > 0 && (
          <>
            <div style={{ height: 1, background: T.rule }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {chips.map((c) => (
                <span key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 100, background: T.surface2, minWidth: 0 }}>
                  <c.icon size={11} color={T.quiet} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: T.mid, whiteSpace: 'nowrap' }}>{c.text}</span>
                </span>
              ))}
            </div>
          </>
        )}

        {reasons.some((r) => r.principle) && (
          <Kicker>Tippe eine Zeile für das Prinzip dahinter</Kicker>
        )}
      </div>
    </div>
  )
}
