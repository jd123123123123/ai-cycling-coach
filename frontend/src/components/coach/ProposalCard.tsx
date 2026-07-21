/**
 * ProposalCard — the AI Coach "propose-before-apply" centerpiece (.pen pyy3V).
 *
 * Renders a plan change as a CONCRETE, VISUAL before→after diff:
 *   - PropHead ("PROPOSED ADJUSTMENT") + an "AI suggested" pill
 *   - a Diff block: old session → new session (labels + TSS/intensity numbers),
 *     with BlockBars rendering the actual interval shape before vs after
 *     (day scope) or a per-day week table (week scope)
 *   - a plain-language Rationale line
 *   - Actions: accent Accept + Tweak
 *
 * Nothing is persisted until Accept — the parent calls applyPlan() then.
 */
import { ArrowRight, Check, Minus, Sparkles, SlidersHorizontal } from 'lucide-react'
import type { PlanProposal, ProposalSession } from '../../api/coach'
import BlockBars from '../workout/BlockBars'
import { deriveProposalView } from './proposalView'

const CARD = {
  background: 'var(--color-paper-2)',
  border: '1px solid var(--color-rule)',
  borderRadius: 24,
} as const

/** German-first: the backend emits the not-applicable `reason` in English only
 *  (rationale_de is empty for these). Translate the known, finite set so a
 *  German user never sees an English sentence. Unknown reasons pass through. */
function localizeReason(reason: string | null | undefined, de: boolean): string | null {
  if (!reason) return null
  if (!de) return reason
  const noWorkout = reason.match(/^No planned workout on (.+)\.$/)
  if (noWorkout) return `Für ${noWorkout[1]} ist keine Einheit geplant.`
  const map: Record<string, string> = {
    'Already trained today — nothing to change.': 'Heute schon trainiert — nichts zu ändern.',
    'Set your FTP first — a proposal needs an FTP anchor.': 'Setz zuerst deine FTP — ein Vorschlag braucht einen FTP-Anker.',
    'No planned workouts this week to ease.': 'Diese Woche gibt es keine Einheiten zum Lockern.',
    'Your week is already easy — no hard days to trim.': 'Deine Woche ist schon locker — keine harten Tage zum Kürzen.',
  }
  return map[reason] ?? reason
}

function TssChip({ tss, muted }: { tss: number; muted?: boolean }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5"
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: muted ? 'var(--color-muted)' : 'var(--color-ink)',
        background: 'color-mix(in srgb, var(--color-surface-2) 70%, transparent)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {Math.round(tss)} TSS
    </span>
  )
}

function SessionRow({
  session,
  isBefore,
  de,
}: {
  session: ProposalSession
  isBefore: boolean
  de: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        {isBefore ? (
          <Minus size={15} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
        ) : (
          <Check size={15} style={{ color: 'var(--color-recovery)', flexShrink: 0 }} />
        )}
        <span
          className="flex-1"
          style={{
            fontSize: 13,
            fontWeight: isBefore ? 500 : 700,
            color: isBefore ? 'var(--color-muted)' : 'var(--color-ink)',
            textDecoration: isBefore ? 'line-through' : 'none',
          }}
        >
          {session.label}
        </span>
        <TssChip tss={session.predicted_tss} muted={isBefore} />
      </div>
      {session.blocks.length > 0 && (
        <div style={{ opacity: isBefore ? 0.45 : 1 }}>
          <BlockBars blocks={session.blocks} height={isBefore ? 28 : 40} />
        </div>
      )}
      <span className="eyebrow" style={{ fontSize: 9.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-muted)' }}>
        {isBefore ? (de ? 'BISHER' : 'BEFORE') : (de ? 'NEU' : 'AFTER')}
        {session.intensity_factor != null && ` · IF ${session.intensity_factor.toFixed(2)}`}
        {` · ${session.duration_min} min`}
      </span>
    </div>
  )
}

export default function ProposalCard({
  proposal,
  de,
  applying,
  applied,
  onAccept,
  onTweak,
}: {
  proposal: PlanProposal
  de: boolean
  applying: boolean
  applied: boolean
  onAccept: () => void
  onTweak: () => void
}) {
  const view = deriveProposalView(proposal, de, { applied })
  const rationale = view.rationale

  // Not applicable — an honest, no-guilt note instead of a broken card.
  if (!view.applicable) {
    return (
      <div className="flex flex-col gap-2 p-4" style={{ ...CARD }}>
        <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-muted)' }}>
          {view.headline}
        </span>
        <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
          {localizeReason(proposal.reason, de) || (de ? 'Hier gibt es gerade nichts anzupassen.' : 'Nothing to adjust here right now.')}
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-3.5 p-[18px]"
      style={{ ...CARD, borderColor: applied ? 'var(--color-recovery)' : 'var(--color-accent)' }}
      data-testid="proposal-card"
    >
      {/* PropHead */}
      <div className="flex items-center justify-between">
        <span className="eyebrow inline-flex items-center gap-1.5" style={{ fontSize: 11, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-accent)' }}>
          <Sparkles size={14} />
          {view.headline}
        </span>
        {!applied && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)', fontSize: 10.5, fontWeight: 700, color: 'var(--color-accent)' }}
          >
            <Sparkles size={11} /> {de ? 'KI-Vorschlag' : 'AI suggested'}
          </span>
        )}
      </div>

      {/* Diff block */}
      <div className="flex flex-col gap-3 p-3.5" style={{ background: 'var(--color-surface-2)', borderRadius: 16 }}>
        {proposal.scope === 'day' && proposal.before && proposal.after ? (
          <>
            <SessionRow session={proposal.before} isBefore de={de} />
            <div className="flex items-center justify-center" style={{ height: 1 }}>
              <ArrowRight size={16} style={{ color: 'var(--color-accent)' }} />
            </div>
            <SessionRow session={proposal.after} isBefore={false} de={de} />
          </>
        ) : (
          <WeekDiff proposal={proposal} de={de} />
        )}
      </div>

      {/* Week-load impact line (day scope) */}
      {proposal.scope === 'day' && proposal.week_before_tss != null && proposal.week_after_tss != null && (
        <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
          <span style={{ fontWeight: 600 }}>{de ? 'Woche' : 'Week'}:</span>
          <span style={{ color: 'var(--color-muted)' }}>{Math.round(proposal.week_before_tss)}</span>
          <ArrowRight size={12} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{Math.round(proposal.week_after_tss)} TSS</span>
        </div>
      )}

      {/* Rationale */}
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{rationale}</p>

      {/* Actions */}
      {view.showActions && (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onAccept}
            disabled={applying}
            data-testid="proposal-accept"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full"
            style={{ background: 'var(--color-accent)', padding: '13px 16px', opacity: applying ? 0.6 : 1 }}
          >
            <Check size={18} style={{ color: '#0A0C0F' }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0A0C0F' }}>
              {applying ? (de ? 'Übernehme…' : 'Applying…') : (de ? 'Plan übernehmen' : 'Accept plan')}
            </span>
          </button>
          <button
            type="button"
            onClick={onTweak}
            disabled={applying}
            data-testid="proposal-tweak"
            className="inline-flex items-center justify-center gap-2 rounded-full"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', padding: '13px 20px' }}
          >
            <SlidersHorizontal size={17} style={{ color: 'var(--color-ink)' }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Anpassen' : 'Tweak'}</span>
          </button>
        </div>
      )}
      {applied && (
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-recovery)' }}>
          <Check size={14} /> {de ? 'In deinem Plan gespeichert.' : 'Saved to your plan.'}
        </span>
      )}
    </div>
  )
}

function WeekDiff({ proposal, de }: { proposal: PlanProposal; de: boolean }) {
  const rows = proposal.day_diffs
  const maxTss = Math.max(1, ...rows.map((r) => Math.max(r.before_tss, r.after_tss)))
  return (
    <div className="flex flex-col gap-2.5">
      {/* Week TSS bars: before (muted) behind after (accent) */}
      <div className="flex items-end gap-1.5" style={{ height: 52 }}>
        {rows.map((r) => (
          <div key={r.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${r.weekday}: ${Math.round(r.before_tss)}→${Math.round(r.after_tss)} TSS`}>
            <div className="w-full relative flex items-end justify-center" style={{ height: 40 }}>
              <div className="w-full rounded-[3px] absolute bottom-0" style={{ height: Math.max(2, (r.before_tss / maxTss) * 40), background: 'var(--color-surface-3, var(--color-rule))', opacity: 0.5 }} />
              <div className="w-full rounded-[3px]" style={{ height: Math.max(2, (r.after_tss / maxTss) * 40), background: r.changed ? 'var(--color-accent)' : 'var(--color-recovery)', opacity: r.changed ? 0.95 : 0.55 }} />
            </div>
            <span className="eyebrow" style={{ fontSize: 9, color: 'var(--color-muted)' }}>{r.weekday}</span>
          </div>
        ))}
      </div>
      {/* Changed rows list */}
      <div className="flex flex-col gap-1.5">
        {rows.filter((r) => r.changed).map((r) => (
          <div key={r.date} className="flex items-center gap-2" style={{ fontSize: 12 }}>
            <span style={{ width: 22, fontWeight: 700, color: 'var(--color-accent)' }}>{r.weekday}</span>
            <span style={{ color: 'var(--color-muted)', textDecoration: 'line-through' }}>{r.before_label}</span>
            <ArrowRight size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{r.after_label}</span>
          </div>
        ))}
      </div>
      {proposal.week_before_tss != null && proposal.week_after_tss != null && (
        <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
          <span style={{ fontWeight: 600 }}>{de ? 'Wochenlast' : 'Weekly load'}:</span>
          <span style={{ color: 'var(--color-muted)' }}>{Math.round(proposal.week_before_tss)}</span>
          <ArrowRight size={12} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{Math.round(proposal.week_after_tss)} TSS</span>
        </div>
      )}
    </div>
  )
}
