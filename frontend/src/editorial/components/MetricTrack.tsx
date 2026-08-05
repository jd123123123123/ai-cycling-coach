import { isPresent, type Value } from '../data/value'
import type { RangeBand } from '../data/useTodayModel'

/**
 * The hero's headline metric. Primary geometry transcribed from the Trained
 * frame's own "Metric Track" node (cjLpM -> M1 Load, LdBJ4): value 146px
 * Sora 800, letterSpacing -9, lineHeight 0.86, coloured by the metric's own
 * hue with a glow at the pen's literal alpha (#FF5E0038, ~22% of the hue —
 * no --st-a* stop matches 22% exactly, so the glow is mixed from `hue`
 * inline rather than forcing a mismatched token). The unit stack (gap 3,
 * padding-bottom 20) carries a hue-coloured primary unit ("TSS") — Trained's
 * literal colour for that text.
 *
 * state/delta/band never co-occur with the big numeral in ANY of the five
 * flagship Cover instances checked (Trained's own TSS metric and Resting's
 * Recovery metric both carry null delta/band) — but this task's own test
 * (brief Step 2) requires all three, and so does component/RangeRow (KT5iR),
 * the pen's canonical smaller (30px) version of this same idea. Where the
 * two disagree on placement/colour, Trained wins (it is the frame this task
 * renders): RangeRow puts its Label top-left in a row layout and its Value
 * in plain $e-ink; here `label` renders as the top caption (RangeRow's
 * position — matches this task's own test, which asserts "HRV" survives the
 * missing arm) but the Value stays hue-tinted, matching Trained's literal
 * colour instead of RangeRow's white. This mixing is a genuine, unresolved
 * disagreement between the two source nodes — flagged in task-8-report.md,
 * not silently picked.
 *
 * Delta and the band's "Mark" both transcribe RangeRow's literal $e-acid.
 * The Track's Base/Band rail reuses RangeRow's own geometry (Base 2px
 * @y5/12, Band 4px rounded @y4/12, both --e-track-*) scaled to fill_container
 * width. RangeRow gives exactly one concrete example of the Mark's position
 * (HRV, position "above", Mark at 236/322 = 73.8% of track width, Band
 * spanning 104-217/322 = 32.3%-67.4%); the pen does not encode a general
 * value-to-position formula, so `markPct` below is this task's own
 * placement rule (below/in/above -> fixed thirds), not a transcribed value.
 */
export default function MetricTrack({
  label,
  state,
  value,
  unit,
  delta,
  band,
  hue,
}: {
  label: string
  state: string
  value: Value<number>
  unit: string
  delta: number | null
  band: RangeBand | null
  hue: string
}) {
  const present = isPresent(value)
  return (
    <div data-metric-track style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.4,
            color: 'var(--e-mid)',
          }}
        >
          {label}
        </span>
        {state && (
          <span
            style={{
              fontFamily: 'var(--e-body)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1.2,
              color: 'var(--e-lo)',
            }}
          >
            {state}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', width: '100%', gap: 20, alignItems: 'flex-end' }}>
        <span
          style={{
            fontFamily: 'var(--e-display)',
            fontSize: 146,
            fontWeight: 800,
            letterSpacing: -9,
            lineHeight: 0.86,
            color: present ? hue : 'var(--e-lo)',
            filter: present
              ? `drop-shadow(0 0 44px color-mix(in srgb, ${hue} 22%, transparent))`
              : undefined,
          }}
        >
          {present ? value.value : '—'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 20 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 1.5,
                color: hue,
              }}
            >
              {unit}
            </span>
            {present && delta != null && (
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--e-acid)',
                }}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
        </div>
      </div>
      {band && (
        <div style={{ position: 'relative', width: '100%', height: 12 }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 5,
              width: '100%',
              height: 2,
              background: 'var(--e-track-base)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '32%',
              top: 4,
              width: '35%',
              height: 4,
              borderRadius: 2,
              background: 'var(--e-track-band)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${markPct(band)}%`,
              top: 0,
              width: 3,
              height: 12,
              background: 'var(--e-acid)',
              boxShadow: '0 0 10px color-mix(in srgb, var(--e-acid) 50%, transparent)',
            }}
          />
        </div>
      )}
      {!present && (
        <p
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--e-quiet)',
            margin: 0,
          }}
        >
          {value.missing}
        </p>
      )}
    </div>
  )
}

function markPct(band: RangeBand): number {
  if (band.position === 'below') return 10
  if (band.position === 'above') return 74
  return 49.5
}
