/**
 * WorkoutModifiedCard — inline chat card rendered after a successful
 * `modify_planned_workout` tool_use_result.
 *
 * UX principles (Phase 6 Wave 3 must-haves):
 *   - Show BEFORE / AFTER side-by-side (dimmed vs emphasised) so the user
 *     can verify the change at a glance.
 *   - If `rails_downgraded=true`, render an amber "Safety-adjusted" badge
 *     with the reason — never silently let a downgrade slip by. Trust is
 *     earned by visibility, not assumed.
 *   - Respect the LanguageContext: simple-mode uses feel-words
 *     ("Easy endurance · 45 min"), technical-mode cites the template id
 *     and category.
 *
 * Tap the card to expand and see the full AFTER interval ribbon when the
 * tool result includes `blocks` (the 06-02 backend does not yet ship them
 * on the chat response — left as a safe fallback).
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, ShieldAlert, Sparkles, Undo2 } from 'lucide-react'
import type { WorkoutModificationResult } from '../../hooks/useChatStream'
import type { ResolvedBlock } from '../../api/coach'
import { useLanguage } from '../../contexts/LanguageContext'
import IntervalRibbon from '../dashboard/IntervalRibbon'

// ─── Humanized template labels ────────────────────────────────────────────────
//
// The backend's `template_id` is a stable machine key (e.g. `z2_endurance_60`,
// `sweet_spot_2x20`). This map turns it into human-readable text per language
// mode. Keep it in sync with the 12-template library in
// backend/app/services/workout_templates.py.

interface TemplateLabel {
  simple: string
  technical: string
  category:
    | 'rest'
    | 'recovery'
    | 'endurance'
    | 'tempo'
    | 'sweet_spot'
    | 'threshold'
    | 'vo2'
}

const TEMPLATE_LABELS: Record<string, TemplateLabel> = {
  rest_day: {
    simple: 'Rest day',
    technical: 'Rest · full day off',
    category: 'rest',
  },
  recovery_30: {
    simple: 'Easy recovery · 30 min',
    technical: 'Recovery · 30min · Z1',
    category: 'recovery',
  },
  recovery_45: {
    simple: 'Easy recovery · 45 min',
    technical: 'Recovery · 45min · Z1',
    category: 'recovery',
  },
  z2_endurance_60: {
    simple: 'Easy endurance · 60 min',
    technical: 'Z2 endurance · 60min · 65% FTP',
    category: 'endurance',
  },
  z2_endurance_90: {
    simple: 'Easy endurance · 90 min',
    technical: 'Z2 endurance · 90min · 65% FTP',
    category: 'endurance',
  },
  z2_long_180: {
    simple: 'Long easy ride · 3 hours',
    technical: 'Z2 long · 180min · 65% FTP',
    category: 'endurance',
  },
  tempo_3x10: {
    simple: 'Tempo intervals · 3×10',
    technical: 'Tempo · 3×10min · 85% FTP',
    category: 'tempo',
  },
  sweet_spot_2x20: {
    simple: 'Sweet-spot intervals · 2×20',
    technical: 'Sweet-spot · 2×20min · 92% FTP',
    category: 'sweet_spot',
  },
  threshold_2x15: {
    simple: 'Hard intervals · 2×15',
    technical: 'Threshold · 2×15min · 100% FTP',
    category: 'threshold',
  },
  threshold_4x8: {
    simple: 'Hard intervals · 4×8',
    technical: 'Threshold · 4×8min · 102% FTP',
    category: 'threshold',
  },
  vo2_5x4: {
    simple: 'Hard intervals · 5×4',
    technical: 'VO2 · 5×4min · 115% FTP',
    category: 'vo2',
  },
  vo2_6x3: {
    simple: 'Hard intervals · 6×3',
    technical: 'VO2 · 6×3min · 118% FTP',
    category: 'vo2',
  },
}

function templateDisplayName(
  templateId: string | undefined,
  language: 'simple' | 'technical',
): string {
  if (!templateId) return 'Workout'
  const label = TEMPLATE_LABELS[templateId]
  if (!label) {
    // Unknown template id — humanize the key directly as fallback.
    return templateId
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return language === 'simple' ? label.simple : label.technical
}

function formatDuration(
  minutes: number | undefined,
  language: 'simple' | 'technical',
): string {
  if (!minutes || minutes <= 0) return '—'
  if (language === 'simple') {
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      if (m === 0) return h === 1 ? '1 hour' : `${h} hours`
      return `${h}h ${m}m`
    }
    return `${minutes} min`
  }
  return `${minutes}min`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** Tool result from `modify_planned_workout` — see backend coach_tools.py */
  result: WorkoutModificationResult & {
    /** Optional — backend may ship resolved blocks in a future extension */
    blocks?: ResolvedBlock[]
  }
  /**
   * Renders the Undo affordance when true. Only the LATEST modification
   * card in the session should pass this — the parent (CoachChat) tracks
   * which modify_planned_workout card is most recent.
   */
  isLatest?: boolean
  /** Fires "Undo that" through the chat stream. Provided by the parent. */
  onUndo?: () => void | Promise<void>
  /** Disable Undo while a send/stream is in flight to avoid double-firing. */
  undoDisabled?: boolean
}

export default function WorkoutModifiedCard({
  result,
  isLatest = false,
  onUndo,
  undoDisabled = false,
}: Props) {
  const { language } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const [undoClicked, setUndoClicked] = useState(false)
  const simpleMode = language === 'simple'
  const canUndo = isLatest && !!onUndo && !undoClicked

  const beforeTemplate = result.before?.template_id
  const afterTemplate = result.template_id
  const beforeDuration = result.before?.duration_min
  const afterDuration = result.duration_min
  const railsDowngraded = Boolean(result.rails_downgraded)
  const hasBlocks =
    Array.isArray(result.blocks) && (result.blocks?.length ?? 0) > 0

  // Visual delta arrow — hints at whether the change shortened or lengthened.
  const durationDelta =
    beforeDuration != null && afterDuration != null
      ? afterDuration - beforeDuration
      : null

  return (
    <section
      className="rounded-[14px] overflow-hidden"
      style={{
        border: '1px solid var(--color-rule)',
        backgroundColor: 'var(--color-paper)',
      }}
      aria-label="Workout updated"
    >
      {/* Header */}
      <header
        className="flex items-center justify-between gap-3 px-4 pt-3 pb-2"
        style={{ borderBottom: '1px solid var(--color-rule)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles
            size={13}
            strokeWidth={1.8}
            style={{ color: 'var(--color-amber)' }}
            aria-hidden
          />
          <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
            {simpleMode ? 'Workout updated' : 'Planned workout · modified'}
          </span>
        </div>
        {result.framework_cited && !simpleMode && (
          <span
            className="num-mono text-[10px] px-1.5 py-0.5 rounded-sm"
            style={{
              color: 'var(--color-muted)',
              border: '1px solid var(--color-rule)',
            }}
          >
            {result.framework_cited}
          </span>
        )}
      </header>

      {/* Body: before → after grid */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          {/* BEFORE */}
          <div className="min-w-0 flex flex-col gap-1">
            <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
              Before
            </span>
            <div
              className="text-[13px] leading-snug dashboard-break-words"
              style={{
                color: 'var(--color-ink-2)',
                textDecoration: 'line-through',
                textDecorationColor: 'rgba(20,24,17,0.3)',
              }}
            >
              {templateDisplayName(beforeTemplate, language)}
            </div>
            <div
              className="num-mono text-[11px]"
              style={{ color: 'var(--color-muted)' }}
            >
              {formatDuration(beforeDuration, language)}
            </div>
          </div>

          {/* Arrow */}
          <div
            className="flex-shrink-0 flex items-center justify-center"
            aria-hidden
          >
            <svg
              width="18"
              height="14"
              viewBox="0 0 24 16"
              fill="none"
              style={{ color: 'var(--color-ink-2)' }}
            >
              <path
                d="M3 8h17M14 2l6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* AFTER */}
          <div className="min-w-0 flex flex-col gap-1">
            <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
              {simpleMode ? 'Now' : 'After'}
            </span>
            <div
              className="text-[13px] leading-snug dashboard-break-words"
              style={{ color: 'var(--color-ink)', fontWeight: 500 }}
            >
              {templateDisplayName(afterTemplate, language)}
            </div>
            <div
              className="num-mono text-[11px] flex items-center gap-1.5"
              style={{ color: 'var(--color-ink-2)' }}
            >
              <span>{formatDuration(afterDuration, language)}</span>
              {durationDelta !== null && durationDelta !== 0 && (
                <span
                  style={{
                    color:
                      durationDelta < 0
                        ? 'var(--color-forest-2)'
                        : 'var(--color-amber)',
                  }}
                >
                  ({durationDelta > 0 ? '+' : ''}
                  {durationDelta}min)
                </span>
              )}
              {result.indoor && (
                <span
                  className="eyebrow"
                  style={{ color: 'var(--color-muted)' }}
                >
                  · indoor
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Rails downgrade badge */}
        {railsDowngraded && (
          <div
            className="mt-3 flex items-start gap-2 px-3 py-2 rounded-[10px]"
            style={{
              backgroundColor: 'rgba(176, 74, 12, 0.08)',
              border: '1px solid rgba(176, 74, 12, 0.28)',
            }}
            role="note"
            aria-label="Safety-adjusted modification"
          >
            <ShieldAlert
              size={13}
              strokeWidth={1.8}
              style={{
                color: 'var(--color-amber)',
                flexShrink: 0,
                marginTop: 2,
              }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="eyebrow" style={{ color: 'var(--color-amber)' }}>
                {simpleMode ? 'Safety-adjusted' : 'Rails downgraded'}
              </div>
              {result.reason && (
                <div
                  className="mt-0.5 text-[12px] leading-snug dashboard-break-words"
                  style={{ color: 'var(--color-ink-2)' }}
                >
                  {result.reason}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Predicted TSS pill (technical only) */}
        {!simpleMode && result.predicted_tss != null && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 num-mono text-[11px] px-2 py-0.5 rounded-sm"
            style={{
              color: 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
            }}
          >
            <span className="eyebrow">Target TSS</span>
            <span style={{ color: 'var(--color-ink)' }}>
              {Math.round(result.predicted_tss)}
            </span>
          </div>
        )}

        {/* Tap to expand — blocks ribbon */}
        {hasBlocks && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-[11px]"
            style={{ color: 'var(--color-ink-2)' }}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown size={12} strokeWidth={2} />
            ) : (
              <ChevronRight size={12} strokeWidth={2} />
            )}
            <span className="eyebrow">
              {expanded ? 'Hide ribbon' : 'Show ribbon'}
            </span>
          </button>
        )}
        {expanded && hasBlocks && (
          <div className="mt-3">
            <IntervalRibbon
              blocks={result.blocks!}
              language={language}
              className="h-16"
            />
          </div>
        )}
      </div>

      {/* Undo footer — only on the LATEST modification in session.
          Click fires "Undo that" through useChatStream.undoLastModification
          so the LLM narrates the revert + the backend's append-only audit
          contract is preserved (original audit row stays immutable). */}
      {canUndo && (
        <footer
          className="flex items-center justify-end px-4 py-2"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          <button
            type="button"
            disabled={undoDisabled || undoClicked}
            onClick={() => {
              setUndoClicked(true)
              void onUndo?.()
            }}
            className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-[8px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[rgba(20,24,17,0.04)]"
            style={{
              color: 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
              backgroundColor: 'var(--color-paper)',
            }}
            aria-label={simpleMode ? 'Put it back' : 'Undo modification'}
          >
            <Undo2 size={12} strokeWidth={1.8} aria-hidden />
            <span className="eyebrow">{simpleMode ? 'Put it back' : 'Undo'}</span>
          </button>
        </footer>
      )}
    </section>
  )
}
