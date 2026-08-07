import { isPresent, type Value } from '../data/value'
import { TOUCH_TARGET_MIN } from '../motion/touchTarget'

/**
 * The one chart rule every metric tile in this system obeys: exactly one
 * point carries the accent, everything else sits at the neutral depth
 * step. A record adds a star on that same point, never a second mark. It
 * is what makes a tile's chart argue something ("today, right here") in
 * stead of merely being drawn — the whole reason tests here count
 * highlights rather than just asserting a chart exists.
 */
export type TileChart =
  | { kind: 'spark'; points: number[]; highlightIndex: number; star?: boolean }
  | { kind: 'bars'; points: number[]; highlightIndex: number; star?: boolean }
  | { kind: 'band'; low: number; high: number; today: number }

export interface BentoTileProps {
  label: string
  value: Value<{ text: string; unit?: string }>
  chart: Value<TileChart>
  note?: string
  accent?: boolean
  tall?: boolean
  onExpand?: () => void
}

/**
 * On an accented tile the background itself IS the accent
 * (`var(--st-active)`), so every mark drawn on top swaps from the usual
 * light-on-dark palette to a dark ink instead — legible on a bright fill.
 * `--e-on-accent` (tokens.css) is that token, described there as "text/icon
 * on a bright accent fill" — exactly this role, so no literal hex belongs
 * here. The quiet/neutral variant follows the same `color-mix` pattern this
 * tree already uses to derive accent alphas (`--st-a07`..`--st-a40` in
 * tokens.css), rather than a hex+alpha-suffix string.
 */
const ACCENT_INK = 'var(--e-on-accent)'
const ACCENT_INK_QUIET = 'color-mix(in srgb, var(--e-on-accent) 35%, transparent)'

function TileChartView({ chart, accent }: { chart: TileChart; accent?: boolean }) {
  const neutral = accent ? ACCENT_INK_QUIET : 'var(--d-2)'
  const hot = accent ? ACCENT_INK : 'var(--st-active)'
  const W = 130
  const H = 30

  if (chart.kind === 'band') {
    const span = Math.max(chart.high - chart.low, 1)
    const x = ((chart.today - chart.low) / span) * W
    return (
      <svg width={W} height={H} aria-hidden="true">
        <rect x={0} y={H / 2 - 1} width={W} height={2} rx={1} fill={neutral} />
        <circle
          data-testid="bento-chart-point"
          data-highlight
          cx={Math.max(3, Math.min(W - 3, x))}
          cy={H / 2}
          r={4}
          fill={hot}
        />
        <circle data-testid="bento-chart-highlight" cx={Math.max(3, Math.min(W - 3, x))} cy={H / 2} r={4} fill={hot} />
      </svg>
    )
  }

  const max = Math.max(...chart.points, 1)
  const step = W / Math.max(chart.points.length - 1, 1)
  const y = (v: number) => H - (v / max) * (H - 6) - 3

  return (
    <svg width={W} height={H} aria-hidden="true">
      {chart.kind === 'spark' && (
        <polyline
          points={chart.points.map((v, i) => `${i * step},${y(v)}`).join(' ')}
          fill="none"
          stroke={neutral}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {chart.points.map((v, i) => {
        const isHot = i === chart.highlightIndex
        const common = { fill: isHot ? hot : neutral }
        return (
          <g key={i}>
            {chart.kind === 'bars' ? (
              <rect
                data-testid="bento-chart-point"
                x={i * (W / chart.points.length)}
                y={y(v)}
                width={Math.max(W / chart.points.length - 4, 2)}
                height={H - y(v) - 2}
                rx={2}
                {...common}
              />
            ) : (
              <circle data-testid="bento-chart-point" cx={i * step} cy={y(v)} r={isHot ? 4 : 0} {...common} />
            )}
            {isHot && <circle data-testid="bento-chart-highlight" cx={i * step} cy={y(v)} r={4} {...common} />}
            {isHot && chart.star && (
              <text data-testid="bento-chart-star" x={i * step} y={y(v) - 7} fontSize={9} textAnchor="middle" fill={hot}>
                ★
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function BentoTile({ label, value, chart, note, accent, tall, onExpand }: BentoTileProps) {
  const valuePresent = isPresent(value)
  const chartPresent = isPresent(chart)
  const interactive = onExpand != null
  const labelColor = accent ? ACCENT_INK_QUIET : 'var(--e-lo)'
  const valueColor = !valuePresent ? (accent ? ACCENT_INK_QUIET : 'var(--e-quiet)') : accent ? ACCENT_INK : 'var(--e-ink)'
  const noteColor = accent ? ACCENT_INK_QUIET : 'var(--e-quiet)'

  return (
    <div
      data-testid="bento-tile"
      data-accent={String(!!accent)}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onExpand : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onExpand?.()
              }
            }
          : undefined
      }
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        background: accent ? 'var(--st-active)' : 'var(--e-glass)',
        border: accent ? 'none' : '1px solid var(--e-rule)',
        borderRadius: 18,
        gridRow: tall ? 'span 2' : undefined,
        minHeight: interactive ? TOUCH_TARGET_MIN : undefined,
        cursor: interactive ? 'pointer' : undefined,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: labelColor,
        }}
      >
        {label}
      </span>

      <span
        data-testid="bento-tile-value"
        style={{
          fontFamily: 'var(--e-display)',
          fontSize: tall ? 44 : 34,
          fontWeight: 800,
          letterSpacing: -1,
          lineHeight: 1,
          color: valueColor,
        }}
      >
        {valuePresent ? value.value.text : '—'}
      </span>
      {valuePresent && value.value.unit && (
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 700, color: labelColor, marginTop: -6 }}>
          {value.value.unit}
        </span>
      )}
      {!valuePresent && (
        <p data-testid="bento-tile-missing" style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: noteColor, margin: 0 }}>
          {value.missing}
        </p>
      )}

      {chartPresent && <TileChartView chart={chart.value} accent={accent} />}

      {note && (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 500, color: noteColor, margin: 0 }}>{note}</p>
      )}
    </div>
  )
}
