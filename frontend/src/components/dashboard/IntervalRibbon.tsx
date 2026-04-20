import { useMemo, useState } from 'react'
import type { ResolvedBlock } from '../../api/coach'

interface IntervalRibbonProps {
  blocks: ResolvedBlock[]
  /** If present, renders a single-line summary under the ribbon. */
  summary?: string
  /** Optional className override for sizing. Default is h-20 (80px). */
  className?: string
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
export default function IntervalRibbon({ blocks, summary, className = 'h-20' }: IntervalRibbonProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

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
        aria-label="Rest day — no intervals"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
            Rest
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
        aria-label={`Workout ribbon — ${blocks.length} segments`}
        style={{
          borderBottom: '1px solid var(--color-rule)',
        }}
      >
        {blocks.map((b, idx) => {
          const widthPct = (b.duration_s / totalSeconds) * 100
          const h = heightPct(b.target_pct_ftp)
          const isHovered = hoverIdx === idx
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
              aria-label={`${b.name}: ${formatMinutes(b.duration_s)} at ${b.target_watts_low}-${b.target_watts_high}W, zone ${b.zone}, RPE ${b.rpe}`}
              title={`${b.name} · ${formatMinutes(b.duration_s)} · ${b.target_watts_low}–${b.target_watts_high}W · Z${b.zone} · RPE ${b.rpe}`}
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
            {formatMinutes(blocks[hoverIdx].duration_s)} ·{' '}
            {blocks[hoverIdx].target_watts_low}–{blocks[hoverIdx].target_watts_high}W · Z
            {blocks[hoverIdx].zone} · RPE {blocks[hoverIdx].rpe}
          </div>
        )}
      </div>

      {/* Zone legend pips — only shown if >1 distinct zone */}
      <LegendStrip blocks={blocks} />

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
