import { useMemo, useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import type { ResolvedBlock } from '../../api/coach'
import type { CoachLanguage } from '../../contexts/LanguageContext'
import type { Locale } from '../../i18n/strings'

interface IntervalRibbonProps {
  blocks: ResolvedBlock[]
  /** If present, renders a single-line summary under the ribbon. */
  summary?: string
  /** Optional className override for sizing. Default is h-20 (80px). */
  className?: string
  /**
   * Language mode — controls tooltip phrasing.
   * simple    → "15 min · easy"
   * technical → "15min · 145W · Z1 · RPE 3"
   * Defaults to 'technical' for callers that haven't migrated yet.
   */
  language?: CoachLanguage
}

/**
 * Plain-English "feel" label per Coggan zone, for simple-mode tooltips.
 * Kept as a small static map instead of pulling in `translateCoach` so the
 * component stays standalone and testable.
 */
const ZONE_FEEL_SIMPLE: Record<number, string> = {
  1: 'very easy',
  2: 'easy',
  3: 'steady',
  4: 'hard',
  5: 'very hard',
  6: 'almost all-out',
  7: 'sprint',
}

const ZONE_FEEL_SIMPLE_DE: Record<number, string> = {
  1: 'sehr locker',
  2: 'locker',
  3: 'gleichmäßig',
  4: 'hart',
  5: 'sehr hart',
  6: 'fast Vollgas',
  7: 'Sprint',
}

function zoneFeel(zone: number, locale: Locale): string {
  const map = locale === 'de' ? ZONE_FEEL_SIMPLE_DE : ZONE_FEEL_SIMPLE
  return map[zone] ?? (locale === 'de' ? 'gleichmäßig' : 'steady')
}

/** Block-name soft-simplification — prettier "Warm-up" → "Warm up" etc. */
function simpleBlockName(name: string, locale: Locale): string {
  const lower = name.trim().toLowerCase()
  if (lower.startsWith('warm')) return locale === 'de' ? 'Aufwärmen' : 'Warm up'
  if (lower.startsWith('cool')) return locale === 'de' ? 'Ausfahren' : 'Cool down'
  if (lower.startsWith('recover')) return locale === 'de' ? 'Pause' : 'Rest'
  if (lower.startsWith('main') || lower.startsWith('interval')) return locale === 'de' ? 'Belastung' : 'Effort'
  return name
}

const ZONE_COLOR: Record<number, string> = {
  1: 'var(--color-zone-1)',
  2: 'var(--color-zone-2)',
  3: 'var(--color-zone-3)',
  4: 'var(--color-zone-4)',
  5: 'var(--color-zone-5)',
  6: 'var(--color-zone-6)',
  7: 'var(--color-zone-7)',
}

// Segment height (as a %, 0–100) scales with target_pct_ftp so VO2 blocks are
// visually taller than Z2. At 55% FTP → 38%. At 115% FTP → 92%. Clamped so
// Z1 blocks still have presence.
function heightPct(pctFtp: number): number {
  const raw = pctFtp * 80 // 1.0 FTP → 80% height
  return Math.max(22, Math.min(96, raw))
}

function formatMinutes(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (s === 0) return `${m}min`
  return `${m}:${String(s).padStart(2, '0')}`
}

function zoneColor(zone: number): string {
  return ZONE_COLOR[zone] ?? ZONE_COLOR[2]
}

/**
 * Horizontal width-proportional interval ribbon.
 *
 * Each block becomes a segment whose width is proportional to duration_s and
 * whose height scales with target_pct_ftp (so VO2 looks visually taller than
 * Z2). Zone colors follow the Phase 5.1 palette introduced in index.css.
 *
 * Hover / tap surfaces a tiny label with duration · watts · zone · RPE.
 * Empty blocks (rest_day) renders a subtle dashed placeholder.
 */
export default function IntervalRibbon({
  blocks,
  summary,
  className = 'h-20',
  language = 'technical',
}: IntervalRibbonProps) {
  const { locale } = useLocale()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const simpleMode = language === 'simple'

  const totalSeconds = useMemo(
    () => blocks.reduce((acc, b) => acc + b.duration_s, 0),
    [blocks],
  )

  // Edge case: rest day — show a single placeholder strip
  if (blocks.length === 0 || totalSeconds === 0) {
    return (
      <div
        className={`relative w-full ${className} rounded-md`}
        style={{
          border: '1px dashed var(--color-rule)',
          backgroundColor: 'var(--color-paper)',
        }}
        aria-label={locale === 'de' ? 'Ruhetag — keine Intervalle' : 'Rest day — no intervals'}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
            {locale === 'de' ? 'Pause' : 'Rest'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 flex flex-col gap-2">
      {/* Ribbon */}
      <div
        className={`relative w-full ${className} flex items-end min-w-0`}
        role="img"
        aria-label={locale === 'de' ? `Workout-Verlauf — ${blocks.length} Segmente` : `Workout ribbon — ${blocks.length} segments`}
        style={{
          borderBottom: '1px solid var(--color-rule)',
        }}
      >
        {blocks.map((b, idx) => {
          const widthPct = (b.duration_s / totalSeconds) * 100
          const h = heightPct(b.target_pct_ftp)
          const isHovered = hoverIdx === idx
          // Language-aware aria + tooltip: technical keeps the full watts/zone/RPE;
          // simple shows a block-name + duration + feel only.
          const simpleName = simpleMode ? simpleBlockName(b.name, locale) : b.name
          const feel = zoneFeel(b.zone, locale)
          // Cadence appendix — only added when explicitly set (climbing blocks
          // override to 60-70rpm; otherwise the zone default still renders).
          const cadenceStr =
            b.cadence_low != null && b.cadence_high != null
              ? ` · ${b.cadence_low}-${b.cadence_high}rpm`
              : ''
          const hrStr =
            b.target_hr_low != null && b.target_hr_high != null
              ? ` · ${b.target_hr_low}-${b.target_hr_high} bpm`
              : ''
          const ariaLabel = simpleMode
            ? (locale === 'de'
                ? `${simpleName}: ${formatMinutes(b.duration_s)}, Tempo ${feel}`
                : `${simpleName}: ${formatMinutes(b.duration_s)}, ${feel} pace`)
            : (locale === 'de'
                ? `${b.name}: ${formatMinutes(b.duration_s)} bei ${b.target_watts_low}-${b.target_watts_high}W${hrStr}, Zone ${b.zone}, RPE ${b.rpe}${cadenceStr ? ', ' + cadenceStr.slice(3) : ''}`
                : `${b.name}: ${formatMinutes(b.duration_s)} at ${b.target_watts_low}-${b.target_watts_high}W${hrStr}, zone ${b.zone}, RPE ${b.rpe}${cadenceStr ? ', ' + cadenceStr.slice(3) : ''}`)
          const titleAttr = simpleMode
            ? `${simpleName} · ${formatMinutes(b.duration_s)} · ${feel}`
            : `${b.name} · ${formatMinutes(b.duration_s)} · ${b.target_watts_low}–${b.target_watts_high}W${hrStr} · Z${b.zone} · RPE ${b.rpe}${cadenceStr}`
          return (
            <button
              key={`${b.name}-${idx}`}
              type="button"
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              onFocus={() => setHoverIdx(idx)}
              onBlur={() => setHoverIdx(null)}
              onTouchStart={() => setHoverIdx(idx)}
              className="relative h-full transition-opacity focus:outline-none"
              style={{
                width: `${widthPct}%`,
                minWidth: 4,
                opacity: hoverIdx === null || isHovered ? 1 : 0.55,
                padding: 0,
                border: 'none',
                background: 'transparent',
              }}
              aria-label={ariaLabel}
              title={titleAttr}
            >
              <div
                className="absolute bottom-0 left-0 right-0 transition-all"
                style={{
                  height: `${h}%`,
                  backgroundColor: zoneColor(b.zone),
                  borderRight: '1px solid rgba(20, 24, 17, 0.06)',
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                }}
              />
            </button>
          )
        })}

        {/* Hover callout */}
        {hoverIdx !== null && blocks[hoverIdx] && (
          <div
            className="absolute top-0 right-0 pointer-events-none num-mono text-[11px] whitespace-nowrap px-2 py-1 rounded-sm"
            style={{
              color: 'var(--color-ink)',
              backgroundColor: 'var(--color-paper-2)',
              border: '1px solid var(--color-rule)',
              transform: 'translateY(-110%)',
            }}
          >
            {simpleMode ? (
              <>
                {formatMinutes(blocks[hoverIdx].duration_s)} ·{' '}
                {zoneFeel(blocks[hoverIdx].zone, locale)}
              </>
            ) : (
              <>
                {formatMinutes(blocks[hoverIdx].duration_s)} ·{' '}
                {blocks[hoverIdx].target_watts_low}–{blocks[hoverIdx].target_watts_high}W
                {blocks[hoverIdx].target_hr_low != null &&
                  blocks[hoverIdx].target_hr_high != null && (
                    <>
                      {' · '}
                      {blocks[hoverIdx].target_hr_low}–{blocks[hoverIdx].target_hr_high} bpm
                    </>
                  )}
                {' · '}Z{blocks[hoverIdx].zone} · RPE {blocks[hoverIdx].rpe}
                {blocks[hoverIdx].cadence_low != null && blocks[hoverIdx].cadence_high != null && (
                  <>
                    {' · '}
                    {blocks[hoverIdx].cadence_low}–{blocks[hoverIdx].cadence_high}rpm
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Zone legend pips — technical mode only. In simple mode zone numbers
         ARE the jargon we're hiding. */}
      {!simpleMode && <LegendStrip blocks={blocks} />}

      {summary && (
        <div
          className="num-mono text-[12px] dashboard-break-words"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {summary}
        </div>
      )}
    </div>
  )
}

function LegendStrip({ blocks }: { blocks: ResolvedBlock[] }) {
  const zones = Array.from(new Set(blocks.map((b) => b.zone))).sort((a, b) => a - b)
  if (zones.length <= 1) return null
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {zones.map((z) => (
        <span key={z} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: zoneColor(z) }}
          />
          <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
            Z{z}
          </span>
        </span>
      ))}
    </div>
  )
}
