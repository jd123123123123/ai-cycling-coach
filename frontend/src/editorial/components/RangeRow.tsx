import { isPresent, type Value } from '../data/value'
import type { RangeBand } from '../data/useTodayModel'
import { useCopy } from '../i18n/useCopy'

/**
 * Transcribed from component/RangeRow (KT5iR), instanced three times per
 * flagship (HRV / RESTING HR / SLEEP) on both Rest's `01 Why` (GJB6C,
 * L4DYK, A9FmHG) and Training's `01 Recovery` (t5ks7V, Scyce, t84bR).
 *
 * Geometry (KT5iR, depth 4): root vertical, gap 9, width 322 (fill_container
 * in real use). Top row: LW (Label 11/800 ls1.4 $e-mid, Caption "ABOVE
 * RANGE"/"BELOW RANGE"/"IN RANGE" 9/700 ls1.2 $e-lo, gap 5, padding-bottom
 * 4) on the left, VR (Value 30/800 ls-1 lh1 $e-ink, then UW: Unit 12/700
 * $e-lo + Delta 12/800) on the right. Track (t8t8i7): layout none, 322x12 —
 * Base 2px @y5 (#FFFFFF12 → --e-track-base), Band 4px rounded @y4
 * (#FFFFFF26 → --e-track-band, width/x vary per row's real low/high), Mark
 * 3x12 (the pen's canonical fill is $e-acid, but EVERY real instance
 * overrides it to $e-ink — see below). Sep: 1px #FFFFFF12 → --e-hairline.
 *
 * CORRECTED against the canonical component: KT5iR's own Delta text is
 * $e-acid, but reading every real instance by node path (GJB6C/OsH9s,
 * L4DYK/OsH9s, A9FmHG/OsH9s in Rest; t5ks7V/OsH9s, Scyce/OsH9s, t84bR/OsH9s
 * in Training — six for six) shows every one overridden to $e-ink. The real
 * usage wins over the canonical default: Delta renders var(--e-ink), not an
 * accent.
 *
 * `format` (new prop, not in the canonical component): SLEEP's own Value
 * text reads "7:42" — a formatted duration, not the raw numeral — while
 * HRV/RESTING HR read raw numbers ("68", "48"). `RangeRow`'s `value` stays
 * `Value<number>` (the Mark/Band math needs a real number either way);
 * `format` lets a caller turn that number into "7:42" for sleep without
 * forking a second component for one row.
 *
 * Track math reuses `MetricTrack`'s own `markPct` interpolation of RangeRow's
 * one concrete example (HRV: Mark at 236/322 ≈ 73.8%, Band 104-217/322 ≈
 * 32.3%-67.4%) — not a formula the pen states, flagged there and here.
 *
 * Rest's real Track instances (GJB6C etc.) are UN-overridden — same
 * Base/Band/Mark shape as the canonical component. Training's real Track
 * instances (t5ks7V etc.) ARE overridden, to a bespoke 10-segment
 * "sparkline" histogram with one highlighted "current" bucket — a 10-day
 * trend view TodayModel has no source for (no per-day HRV/RHR/sleep history
 * array exists anywhere in this app). Rather than fabricate that trend,
 * Training's rows render through this SAME component as Rest's, using the
 * one real thing both frames' Track shapes agree on: today's value inside
 * its band. Flagged in task-10-report.md as a deliberate, documented
 * departure from Training's own Track node.
 */
export default function RangeRow({
  label,
  value,
  unit,
  band,
  delta,
  format,
}: {
  label: string
  value: Value<number>
  unit: string
  band: RangeBand | null
  delta?: number | null
  format?: (n: number) => string
}) {
  const { t } = useCopy()
  const present = isPresent(value)
  const displayValue = present ? (format ? format(value.value) : String(value.value)) : '—'
  const caption = band ? (band.position === 'below' ? t('rangeBelow') : band.position === 'above' ? t('rangeAbove') : t('rangeIn')) : null

  return (
    <div data-range-row style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 4 }}>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-mid)' }}>
            {label}
          </span>
          {caption && (
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: 'var(--e-lo)' }}>
              {caption}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
          <span style={{ fontFamily: 'var(--e-display)', fontSize: 30, fontWeight: 800, letterSpacing: -1, lineHeight: 1, color: present ? 'var(--e-ink)' : 'var(--e-lo)' }}>
            {displayValue}
          </span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
            {present && unit && (
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 700, color: 'var(--e-lo)' }}>{unit}</span>
            )}
            {present && delta != null && (
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 800, color: 'var(--e-ink)' }}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
        </div>
      </div>

      {band && (
        <div style={{ position: 'relative', width: '100%', height: 12 }}>
          <div style={{ position: 'absolute', left: 0, top: 5, width: '100%', height: 2, background: 'var(--e-track-base)' }} />
          <div style={{ position: 'absolute', left: '32%', top: 4, width: '35%', height: 4, borderRadius: 2, background: 'var(--e-track-band)' }} />
          <div
            data-range-marker
            style={{ position: 'absolute', left: `${markPct(band)}%`, top: 0, width: 3, height: 12, background: 'var(--e-ink)' }}
          />
        </div>
      )}

      {!present && (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: 0 }}>
          {value.missing}
        </p>
      )}

      <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
    </div>
  )
}

function markPct(band: RangeBand): number {
  if (band.position === 'below') return 10
  if (band.position === 'above') return 74
  return 50
}
