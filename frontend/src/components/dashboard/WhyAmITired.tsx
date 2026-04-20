import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { useWhyTired } from '../../hooks/useWhyTired'
import type { CauseEntry } from '../../api/coach'
import { useLanguage } from '../../contexts/LanguageContext'
import { translateCoach } from '../../utils/coachLanguage'

// Plain-English rewrites of the backend's technical `evidence` strings
// (which contain "HRV", "TSB", "Z2", etc.). The backend label is the
// discriminator — we match exact labels we know, and fall back to the
// server-provided evidence for anything unexpected. This keeps simple
// mode fully jargon-free even though /coach/why isn't language-aware.
function simpleEvidenceFor(cause: CauseEntry): string {
  switch (cause.label) {
    case 'HRV suppressed':
      return "Your body's showing signs of not fully recovering yet."
    case 'Resting HR elevated':
      return 'Your resting heart rate is a bit higher than normal.'
    case 'Sleep debt accumulated':
      return "You've been getting less sleep than your body wants."
    case 'Overreach (TSB deep-negative)':
      return "You've piled on a lot of training lately — your body is deep in the hole."
    case 'Carrying productive fatigue':
      return 'Normal tired-from-training feeling — nothing to worry about.'
    case 'Grey-zone creep':
      return 'Recent rides have drifted into the "too hard to be easy, too easy to be hard" zone.'
    default:
      // Unknown label — rewrite technical substrings to be safe
      return cause.evidence
        .replace(/HRV/g, 'recovery')
        .replace(/TSB/g, 'fitness balance')
        .replace(/CTL/g, 'fitness')
        .replace(/ATL/g, 'fatigue')
        .replace(/Z\d/g, 'pace zone')
  }
}

// ─── Severity metadata ───────────────────────────────────────────────────────

const SEVERITY_META: Record<CauseEntry['severity'], {
  dot: string
  label: string
  order: number
}> = {
  high: { dot: 'var(--color-alert)',   label: 'high', order: 0 },
  med:  { dot: 'var(--color-amber-2)', label: 'med',  order: 1 },
  low:  { dot: 'var(--color-muted)',   label: 'low',  order: 2 },
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export default function WhyAmITired({ open, onClose }: Props) {
  const { data, isLoading, isError, refetch } = useWhyTired(open)
  const [showRaw, setShowRaw] = useState(false)
  const { language } = useLanguage()
  const simpleMode = language === 'simple'

  // Body scroll lock + escape
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // Reset raw-data toggle when drawer closes
  useEffect(() => {
    if (!open) setShowRaw(false)
  }, [open])

  if (!open) return null

  const sortedCauses = [...(data?.causes ?? [])].sort(
    (a, b) => SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order,
  )

  const hasCauses = sortedCauses.length > 0

  const content = (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(20,24,17,0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="why-tired-title"
    >
      <div
        className="paper-grain w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-[20px] sm:rounded-[20px] shadow-2xl"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-6 pb-2"
          style={{ borderBottom: '1px solid var(--color-rule)' }}
        >
          <div className="min-w-0">
            <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
              Diagnostic · causal chain
            </span>
            <h2
              id="why-tired-title"
              className="num-display mt-1 leading-tight"
              style={{
                fontSize: 'clamp(22px, 3vw, 28px)',
                color: 'var(--color-ink)',
                fontStyle: 'italic',
              }}
            >
              Why am I tired?
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-full min-w-[40px] min-h-[40px] flex items-center justify-center"
            style={{
              color: 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
              backgroundColor: 'var(--color-paper)',
            }}
            aria-label="Close"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-7 py-5 flex flex-col gap-5">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[0,1,2].map((i) => (
                <div key={i} className="h-16 rounded-[10px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
              ))}
            </div>
          ) : isError ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} strokeWidth={1.8} style={{ color: 'var(--color-alert)' }} />
                <span className="text-[13px]" style={{ color: 'var(--color-alert)' }}>
                  Couldn&apos;t load the diagnostic.
                </span>
              </div>
              <button
                onClick={() => void refetch()}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium"
                style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
              >
                Retry
              </button>
            </div>
          ) : !hasCauses ? (
            <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
              Nothing is flagging today — your recent HRV, sleep, and load all sit inside normal bands.
              If you still feel off, check for non-tracked stressors (travel, illness, fueling).
            </p>
          ) : (
            <>
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
                Your recent fatigue tracks {sortedCauses.length === 1 ? '1 signal' : `${sortedCauses.length} signals`}, ordered by strength:
              </p>
              <ul className="flex flex-col gap-4">
                {sortedCauses.map((c, i) => {
                  const displayLabel = simpleMode
                    ? translateCoach(`cause.label.${c.label}`, 'simple')
                    : c.label
                  const displayEvidence = simpleMode ? simpleEvidenceFor(c) : c.evidence
                  return (
                    <li key={i} className="flex gap-3 min-w-0">
                      <span
                        className="inline-block w-2 h-2 rounded-full mt-2 flex-shrink-0"
                        style={{ backgroundColor: SEVERITY_META[c.severity].dot }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="eyebrow"
                            style={{ color: SEVERITY_META[c.severity].dot, letterSpacing: '0.22em' }}
                          >
                            {SEVERITY_META[c.severity].label}
                          </span>
                          <span className="serif-caps text-[15px]" style={{ color: 'var(--color-ink)' }}>
                            {displayLabel}
                          </span>
                        </div>
                        <p
                          className="mt-1 text-[13px] leading-relaxed dashboard-break-words"
                          style={{ color: 'var(--color-ink-2)' }}
                        >
                          {displayEvidence}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* Raw data toggle */}
          {data && (
            <div
              className="pt-4 mt-1"
              style={{ borderTop: '1px solid var(--color-rule)' }}
            >
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium"
                style={{ color: 'var(--color-ink-2)' }}
                aria-expanded={showRaw}
              >
                {showRaw ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
                <span className="underline underline-offset-2 decoration-[var(--color-rule)] hover:decoration-[var(--color-ink)]">
                  {showRaw ? 'Hide raw data' : 'See raw data'}
                </span>
              </button>
              {showRaw && (
                <pre
                  className="num-mono text-[11px] leading-relaxed mt-3 p-3 rounded-[10px] overflow-x-auto dashboard-break-words"
                  style={{
                    backgroundColor: 'var(--color-paper)',
                    border: '1px solid var(--color-rule)',
                    color: 'var(--color-ink)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(data.snapshot, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
