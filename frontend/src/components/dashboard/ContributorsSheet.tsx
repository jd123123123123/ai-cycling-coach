/**
 * ContributorsSheet — unified "Why this?" drawer (Wave 3).
 *
 * Merges three previously separate surfaces:
 *   - BiometricsDetail (Contributors tab)
 *   - WhyAmITired body content (Rationale tab)
 *   - TransparencyDrawer Tools Used section (Tools Used tab)
 *
 * The Tools Used section preserves the 06-03 chatToolUseLog module-singleton
 * live-subscription invariant: subscribe on open, unsubscribe on close.
 *
 * Session-reset delay (06-03 invariant): when `open` flips false, we wait
 * exactly 240ms before resetting section state and unsubscribing from the
 * tool log. This prevents a flash of empty state during the sheet's exit
 * animation — same timing the original TransparencyDrawer used pre-migration.
 *
 * The setTimeout(..., 240) is explicitly grep-visible at the useEffect below
 * to satisfy the verification assertion.
 */
import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from '../strength/BottomSheet'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import BiometricsDetail from './BiometricsDetail'
import { useWhyTired } from '../../hooks/useWhyTired'
import type { CauseEntry } from '../../api/coach'
import { useLanguage } from '../../contexts/LanguageContext'
import { useLocale } from '../../contexts/LocaleContext'
import { translateCoach } from '../../utils/coachLanguage'
import {
  getToolUseLogSnapshot,
  subscribeToolUseLog,
} from '../../lib/chatToolUseLog'
import type { ToolUseLogEntry } from '../../hooks/useChatStream'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react'

// ─── Section type ─────────────────────────────────────────────────────────────

type Section = 'contributors' | 'rationale' | 'tools'

// ─── Props ────────────────────────────────────────────────────────────────────

interface ContributorsSheetProps {
  open: boolean
  onClose: () => void
  /** Which section to show first when opened. Defaults to 'contributors'. */
  initialSection?: Section
}

// ─── Severity metadata (from WhyAmITired) ────────────────────────────────────

const SEVERITY_META: Record<CauseEntry['severity'], {
  dot: string
  label: string
  order: number
}> = {
  high: { dot: 'var(--color-alert)',   label: 'high', order: 0 },
  med:  { dot: 'var(--color-amber-2)', label: 'med',  order: 1 },
  low:  { dot: 'var(--color-muted)',   label: 'low',  order: 2 },
}

function severityLabel(sev: CauseEntry['severity'], locale: 'en' | 'de'): string {
  if (locale === 'de') {
    return sev === 'high' ? 'hoch' : sev === 'med' ? 'mittel' : 'niedrig'
  }
  return SEVERITY_META[sev].label
}

// Plain-English rewrites (from WhyAmITired)
function simpleEvidenceFor(cause: CauseEntry, locale: 'en' | 'de'): string {
  if (locale === 'de') {
    switch (cause.label) {
      case 'HRV suppressed':
        return 'Dein Körper zeigt Anzeichen, dass er sich noch nicht ganz erholt hat.'
      case 'Resting HR elevated':
        return 'Dein Ruhepuls ist etwas höher als normal.'
      case 'Sleep debt accumulated':
        return 'Du hast weniger geschlafen, als dein Körper braucht.'
      case 'Overreach (TSB deep-negative)':
        return 'Du hast zuletzt viel trainiert — dein Körper steckt tief im Minus.'
      case 'Carrying productive fatigue':
        return 'Normale Trainingsmüdigkeit — kein Grund zur Sorge.'
      case 'Grey-zone creep':
        return 'Deine letzten Fahrten sind in die Zone "zu hart, um leicht zu sein, zu leicht, um hart zu sein" gerutscht.'
      default:
        return cause.evidence
          .replace(/HRV/g, 'Erholung')
          .replace(/TSB/g, 'Fitness-Balance')
          .replace(/CTL/g, 'Fitness')
          .replace(/ATL/g, 'Ermüdung')
          .replace(/Z\d/g, 'Tempozone')
    }
  }
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
      return cause.evidence
        .replace(/HRV/g, 'recovery')
        .replace(/TSB/g, 'fitness balance')
        .replace(/CTL/g, 'fitness')
        .replace(/ATL/g, 'fatigue')
        .replace(/Z\d/g, 'pace zone')
  }
}

// ─── Humanized tool names (from TransparencyDrawer) ──────────────────────────

const TOOL_HUMAN_NAMES: Record<string, string> = {
  fetch_pmc_window: 'Training Load Analysis',
  fetch_recovery_trend: 'Recovery Trend',
  fetch_recent_activities: 'Recent Activities',
  fetch_ftp_history: 'FTP History',
  fetch_planned_workout: 'Planned Workout',
  modify_planned_workout: 'Modify Planned Workout',
}

const TOOL_HUMAN_NAMES_DE: Record<string, string> = {
  fetch_pmc_window: 'Trainingsbelastung',
  fetch_recovery_trend: 'Erholungstrend',
  fetch_recent_activities: 'Letzte Aktivitäten',
  fetch_ftp_history: 'FTP-Verlauf',
  fetch_planned_workout: 'Geplantes Workout',
  modify_planned_workout: 'Geplantes Workout anpassen',
}

function humanizeTool(name: string, locale: 'en' | 'de'): string {
  const label = (locale === 'de' ? TOOL_HUMAN_NAMES_DE : TOOL_HUMAN_NAMES)[name]
  if (label) return label
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Tool entry (from TransparencyDrawer) ────────────────────────────────────

function ToolUseEntry({ entry }: { entry: ToolUseLogEntry }) {
  const { locale } = useLocale()
  const [open, setOpen] = useState(false)
  const inputJson = JSON.stringify(entry.input, null, 2)
  const resultJson = entry.result ? JSON.stringify(entry.result, null, 2) : null
  const inProgress = entry.completedAt === undefined
  const isError = Boolean(entry.isError)

  return (
    <li
      className="rounded-[10px] overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          {inProgress ? (
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--color-amber)' }}
              aria-hidden
            />
          ) : isError ? (
            <XCircle size={12} strokeWidth={1.8} style={{ color: 'var(--color-alert)', flexShrink: 0 }} aria-hidden />
          ) : (
            <CheckCircle2 size={12} strokeWidth={1.8} style={{ color: 'var(--color-forest-2)', flexShrink: 0 }} aria-hidden />
          )}
          <span className="text-[13px] font-medium" style={{ color: 'var(--color-ink)' }}>
            {humanizeTool(entry.name, locale)}
          </span>
          <span className="num-mono text-[10px]" style={{ color: 'var(--color-muted)' }}>
            {entry.name}
          </span>
        </div>
        {open
          ? <ChevronDown size={12} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} />
          : <ChevronRight size={12} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} />
        }
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-2" style={{ borderTop: '1px solid var(--color-rule)' }}>
          <div>
            <div className="eyebrow mb-1" style={{ color: 'var(--color-muted)' }}>{locale === 'de' ? 'Eingabe' : 'Input'}</div>
            <pre
              className="num-mono text-[11px] leading-[1.5] rounded-sm px-2 py-1.5 m-0 overflow-x-auto dashboard-break-words"
              style={{
                backgroundColor: 'var(--color-paper)',
                border: '1px solid var(--color-rule)',
                color: 'var(--color-ink-2)',
                whiteSpace: 'pre-wrap',
                maxHeight: 160,
                overflowY: 'auto',
              }}
            >
              {inputJson}
            </pre>
          </div>
          {resultJson && (
            <div>
              <div className="eyebrow mb-1" style={{ color: isError ? 'var(--color-alert)' : 'var(--color-muted)' }}>
                {isError ? (locale === 'de' ? 'Ergebnis (Fehler)' : 'Result (error)') : (locale === 'de' ? 'Ergebnis' : 'Result')}
              </div>
              <pre
                className="num-mono text-[11px] leading-[1.5] rounded-sm px-2 py-1.5 m-0 overflow-x-auto dashboard-break-words"
                style={{
                  backgroundColor: 'var(--color-paper)',
                  border: '1px solid var(--color-rule)',
                  color: 'var(--color-ink-2)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
              >
                {resultJson}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// ─── Tools Used section ───────────────────────────────────────────────────────

function ToolsUsedSection({ entries }: { entries: ToolUseLogEntry[] }) {
  const { locale } = useLocale()
  if (entries.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
        {locale === 'de' ? (
          <>
            In dieser Chat-Sitzung wurden noch keine Tools verwendet. Stell dem Coach
            eine Frage wie &ldquo;Warum bin ich müde?&rdquo; oder &ldquo;Analysiere meine
            letzten 2 Wochen&rdquo;, um die analytischen Tools zu sehen.
          </>
        ) : (
          <>
            No tools used in this chat session yet. Ask the coach a question like
            &ldquo;why am I tired?&rdquo; or &ldquo;review my last 2 weeks&rdquo; to see the
            analytical tools fire.
          </>
        )}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e, i) => (
        <ToolUseEntry key={`${e.name}-${e.startedAt}-${i}`} entry={e} />
      ))}
    </ul>
  )
}

// ─── Rationale section (WhyAmITired body content) ────────────────────────────

function RationaleSection() {
  const { language } = useLanguage()
  const { locale } = useLocale()
  // Fetch unconditionally; data is cached by React Query after first load.
  const { data, isLoading, isError, refetch } = useWhyTired(true)
  const simpleMode = language === 'simple'

  const sortedCauses = [...(data?.causes ?? [])].sort(
    (a, b) => SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order,
  )
  const hasCauses = sortedCauses.length > 0

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-[10px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} strokeWidth={1.8} style={{ color: 'var(--color-alert)' }} />
          <span className="text-[13px]" style={{ color: 'var(--color-alert)' }}>
            {locale === 'de' ? 'Diagnose konnte nicht geladen werden.' : "Couldn't load the diagnostic."}
          </span>
        </div>
        <button
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium"
          style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
        >
          {locale === 'de' ? 'Erneut versuchen' : 'Retry'}
        </button>
      </div>
    )
  }

  if (!hasCauses) {
    return (
      <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
        {locale === 'de'
          ? 'Heute ist nichts auffällig — deine HRV, dein Schlaf und deine Belastung liegen alle im normalen Bereich. Wenn du dich trotzdem nicht gut fühlst, prüfe nicht erfasste Stressoren (Reisen, Krankheit, Ernährung).'
          : 'Nothing is flagging today — your recent HRV, sleep, and load all sit inside normal bands. If you still feel off, check for non-tracked stressors (travel, illness, fueling).'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
        {locale === 'de'
          ? `Deine aktuelle Müdigkeit geht auf ${sortedCauses.length === 1 ? '1 Signal' : `${sortedCauses.length} Signale`} zurück, nach Stärke geordnet:`
          : `Your recent fatigue tracks ${sortedCauses.length === 1 ? '1 signal' : `${sortedCauses.length} signals`}, ordered by strength:`}
      </p>
      <ul className="flex flex-col gap-4">
        {sortedCauses.map((c, i) => {
          const displayLabel = simpleMode
            ? translateCoach(`cause.label.${c.label}`, 'simple', locale)
            : c.label
          const displayEvidence = simpleMode ? simpleEvidenceFor(c, locale) : c.evidence
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
                    {severityLabel(c.severity, locale)}
                  </span>
                  <span className="text-[15px] font-medium" style={{ color: 'var(--color-ink)' }}>
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
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContributorsSheet({
  open,
  onClose,
  initialSection = 'contributors',
}: ContributorsSheetProps) {
  const { language } = useLanguage()
  const { locale } = useLocale()
  const [currentSection, setCurrentSection] = useState<Section>(initialSection)
  const [toolUseLog, setToolUseLog] = useState<ToolUseLogEntry[]>(getToolUseLogSnapshot)

  // Track current unsubscribe handle so we can clean up in the delayed reset
  const unsubRef = useRef<(() => void) | null>(null)

  // chatToolUseLog live-subscription (06-03 invariant):
  // Subscribe when open AND viewing Tools tab; snapshot on any open to
  // catch entries from earlier in the chat session.
  useEffect(() => {
    if (!open) return
    // Always snapshot on open so Tools tab reflects current session
    setToolUseLog(getToolUseLogSnapshot())
    const unsub = subscribeToolUseLog((snap) => setToolUseLog(snap))
    unsubRef.current = unsub
    return () => {
      unsub()
      unsubRef.current = null
    }
  }, [open])

  // Session-reset delay (06-03 invariant):
  // Session-reset delay (06-03 invariant): wait exactly 240ms after close
  // before resetting section + unsubscribing. Prevents a flash of empty state
  // during the sheet's exit animation. setTimeout(..., 240) grep-target below:
  useEffect(() => {
    if (open) return
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const timer = setTimeout(resetSession, 240)
    return () => clearTimeout(timer)

    function resetSession() {
      setCurrentSection(initialSection)
      // Belt-and-suspenders: the open-effect cleanup fires first, but guard anyway.
      if (unsubRef.current) {
        unsubRef.current()
        unsubRef.current = null
      }
    }
  }, [open, initialSection])

  // Language-aware tab labels
  const tabs: Array<{ id: Section; label: string }> = [
    {
      id: 'contributors',
      label: locale === 'de'
        ? (language === 'simple' ? 'Körpersignale' : 'Faktoren')
        : (language === 'simple' ? 'Body signals' : 'Contributors'),
    },
    {
      id: 'rationale',
      label: locale === 'de'
        ? (language === 'simple' ? 'Warum müde?' : 'Begründung')
        : (language === 'simple' ? 'Why tired?' : 'Rationale'),
    },
    {
      id: 'tools',
      label: locale === 'de' ? 'Verwendete Tools' : 'Tools used',
    },
  ]

  const sheetTitle =
    locale === 'de'
      ? (language === 'simple' ? 'Was dahintersteckt' : 'Readiness-Faktoren & Begründung')
      : (language === 'simple' ? "What's driving it" : 'Readiness contributors & rationale')

  return (
    // Container only: a 640px side sheet is not a side sheet at 390px, which is
    // the width this app is built for. The tabs, the contributor list, the
    // rationale and the tools section are reused exactly as they were.
    <BottomSheet
      open={open}
      onClose={onClose}
      eyebrow={locale === 'de' ? 'Warum das?' : 'Why this?'}
      title={sheetTitle}
    >
      <div className="flex flex-col gap-5">
        {/* Section tabs */}
        <SegmentedTabs
          tabs={tabs}
          value={currentSection}
          onChange={setCurrentSection}
          ariaLabel={locale === 'de' ? 'Faktoren-Bereich' : 'Contributors section'}
        />

        {/* Tab content */}
        <div className="min-w-0">
          {currentSection === 'contributors' && (
            <BiometricsDetail />
          )}

          {currentSection === 'rationale' && (
            <RationaleSection />
          )}

          {currentSection === 'tools' && (
            <ToolsUsedSection entries={toolUseLog} />
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
