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
  /**
   * The informative one, and the default for any metric that has a personal
   * range. A line on its own says nothing — 68 is only meaningful against
   * the band you normally sit in. So the band is drawn as a shaded zone and
   * each day is a column measured against it: you read direction (above or
   * below), distance (how far), and the week's shape, in one glance.
   */
  | {
      kind: 'deviation'
      points: number[]
      low: number
      high: number
      highlightIndex: number
      star?: boolean
    }
  /**
   * Composition, for a metric whose story is how a total splits rather than
   * how it moved: sleep's deep/REM/light/awake. One segment is the one that
   * matters (deep) and carries the accent; the rest stay neutral, so the
   * same "exactly one thing is highlighted" rule holds here too.
   */
  | { kind: 'stages'; segments: { label: string; seconds: number }[]; highlightIndex: number }

export interface BentoTileProps {
  label: string
  value: Value<{ text: string; unit?: string }>
  chart: Value<TileChart>
  /**
   * The tile's real multi-day series, drawn ONLY when this tile ends up in
   * the double-height/accented slot (`tall`) — see BentoGrid.tsx's own doc
   * comment on why the tall tile earns a fuller chart than the one-line
   * band every single-height tile keeps. Absent, or an honestly-missing
   * `Value`, when no such series exists for this metric; the tall tile then
   * falls back to the regular `chart` (band, or its own missing reason)
   * rather than fabricate points that were never measured.
   */
  tallChart?: Value<TileChart>
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

/**
 * `tall`: the accented lead tile spans two grid rows (`gridRow: 'span 2'`
 * below) but, left to its own intrinsic content, doesn't grow to fill that
 * stretched height — the exact "two-thirds of the brightest element on the
 * screen is empty" defect this prop fixes (owner ruling, Change 2). The
 * drawing coordinate system grows from a fixed 30 units tall to 120, and
 * both the `<svg>` and its wrapping `<div>` (in `BentoTile` below) go from a
 * fixed pixel box to `width/height: '100%'` inside a `flex: 1` container —
 * so the chart actually consumes whatever vertical space the tall tile's
 * grid stretch hands it, rather than sitting pinned to a small fixed box
 * with dead air beneath. `preserveAspectRatio="none"` lets the 130×120
 * drawing coordinates stretch non-uniformly to fill that real box; every
 * cx/cy/x/y computed below is still in the same 0–130 / 0–H space either
 * way, so the point-highlighting math (and its existing tests, which never
 * pass `tall`) is untouched.
 */
function TileChartView({ chart, accent, tall }: { chart: TileChart; accent?: boolean; tall?: boolean }) {
  const neutral = accent ? ACCENT_INK_QUIET : 'var(--d-2)'
  const hot = accent ? ACCENT_INK : 'var(--st-active)'
  const W = 130
  const H = tall ? 120 : 30
  const svgSize = tall ? { width: '100%', height: '100%' } : { width: W, height: H }

  if (chart.kind === 'stages') {
    const segs = chart.segments.filter((s) => s.seconds > 0)
    const total = segs.reduce((sum, s) => sum + s.seconds, 0)
    if (segs.length === 0 || total <= 0) return null
    const gap = 2
    const usable = Math.max(W - gap * (segs.length - 1), 1)
    let x = 0
    const barH = tall ? Math.min(H * 0.42, 54) : Math.min(H, 14)
    const yTop = tall ? H / 2 - barH / 2 : H - barH

    return (
      <svg {...svgSize} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {segs.map((s, i) => {
          const w = Math.max((s.seconds / total) * usable, 1)
          const isHot = i === chart.highlightIndex
          const rect = (
            <rect
              key={i}
              data-testid="bento-chart-point"
              {...(isHot ? { 'data-highlight': true } : {})}
              x={x}
              y={yTop}
              width={w}
              height={barH}
              rx={2}
              fill={isHot ? hot : neutral}
              opacity={isHot ? 1 : 0.6}
            />
          )
          x += w + gap
          return rect
        })}
        {/* the highlight duplicate keeps this chart obeying the same
            one-point-highlighted contract every other kind here follows */}
        {segs[chart.highlightIndex] != null && (
          <rect
            data-testid="bento-chart-highlight"
            x={segs.slice(0, chart.highlightIndex).reduce((acc, s) => acc + (s.seconds / total) * usable + gap, 0)}
            y={yTop}
            width={Math.max((segs[chart.highlightIndex].seconds / total) * usable, 1)}
            height={barH}
            rx={2}
            fill={hot}
          />
        )}
      </svg>
    )
  }

  if (chart.kind === 'deviation') {
    const pts = chart.points
    const lo = Math.min(chart.low, chart.high)
    const hi = Math.max(chart.low, chart.high)
    // Scale to whichever is wider — the band or the data — so a value far
    // outside the band still lands inside the box instead of being clipped,
    // and a quiet week doesn't get magnified into drama.
    const dMin = Math.min(lo, ...pts)
    const dMax = Math.max(hi, ...pts)
    const pad = Math.max((dMax - dMin) * 0.18, 1)
    const vMin = dMin - pad
    const vMax = dMax + pad
    const y = (v: number) => H - ((v - vMin) / Math.max(vMax - vMin, 1)) * H
    const slot = W / Math.max(pts.length, 1)
    const barW = Math.max(slot - (tall ? 5 : 3), 2)
    const bandTop = y(hi)
    const bandBottom = y(lo)
    const mid = (bandTop + bandBottom) / 2

    return (
      <svg {...svgSize} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {/* your normal range — the reference that makes every column mean something */}
        <rect
          data-testid="bento-chart-band"
          x={0}
          y={bandTop}
          width={W}
          height={Math.max(bandBottom - bandTop, 1)}
          fill={neutral}
          opacity={accent ? 0.45 : 0.3}
        />
        {pts.map((v, i) => {
          const isHot = i === chart.highlightIndex
          const vy = y(v)
          const top = Math.min(vy, mid)
          const height = Math.max(Math.abs(vy - mid), 1.5)
          return (
            <g key={i}>
              <rect
                data-testid="bento-chart-point"
                x={i * slot + (slot - barW) / 2}
                y={top}
                width={barW}
                height={height}
                rx={Math.min(barW / 2, 2)}
                fill={isHot ? hot : neutral}
                opacity={isHot ? 1 : 0.75}
              />
              {isHot && (
                <>
                  <rect
                    data-testid="bento-chart-highlight"
                    x={i * slot + (slot - barW) / 2}
                    y={top}
                    width={barW}
                    height={height}
                    rx={Math.min(barW / 2, 2)}
                    fill={hot}
                  />
                  <circle cx={i * slot + slot / 2} cy={vy} r={tall ? 3.5 : 2.5} fill={hot} />
                </>
              )}
              {isHot && chart.star && (
                <text
                  data-testid="bento-chart-star"
                  x={i * slot + slot / 2}
                  y={Math.max(vy - 6, 8)}
                  fontSize={tall ? 11 : 9}
                  textAnchor="middle"
                  fill={hot}
                >
                  ★
                </text>
              )}
            </g>
          )
        })}
      </svg>
    )
  }

  if (chart.kind === 'band') {
    // The band itself has to be VISIBLE or the dot has nothing to mean. The
    // old version drew a flat rule and a dot on it: the reading's position
    // was plotted, but the range it was being judged against was invisible,
    // so the chart argued nothing. Here the normal range is a shaded segment
    // of the track, and today's marker reads as inside it, above it, or
    // below it without needing the numbers.
    const lo = Math.min(chart.low, chart.high)
    const hi = Math.max(chart.low, chart.high)
    // Extend the track past whichever is more extreme — the band or today's
    // reading — so a value outside the band is still drawn outside it rather
    // than clamped onto the edge and silently misreported as "at the limit".
    const tMin = Math.min(lo, chart.today)
    const tMax = Math.max(hi, chart.today)
    const pad = Math.max((tMax - tMin) * 0.25, (hi - lo) * 0.25, 1)
    const vMin = tMin - pad
    const vMax = tMax + pad
    const px = (v: number) => ((v - vMin) / Math.max(vMax - vMin, 1)) * W
    // Tall tiles turn the range on its side: a vertical scale filling the
    // whole tile, your normal range as a shaded zone on it, today's reading
    // as a full-width rule across it. Same information as the horizontal
    // track, but it uses the height the tall slot actually hands us instead
    // of leaving two thirds of the brightest tile on the screen empty.
    if (tall) {
      const py = (v: number) => H - ((v - vMin) / Math.max(vMax - vMin, 1)) * H
      const todayY = Math.max(3, Math.min(H - 3, py(chart.today)))
      const bandTop = py(hi)
      const bandBottom = py(lo)
      return (
        <svg {...svgSize} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <rect x={0} y={0} width={W} height={H} rx={3} fill={neutral} opacity={0.22} />
          <rect
            data-testid="bento-chart-band"
            x={0}
            y={bandTop}
            width={W}
            height={Math.max(bandBottom - bandTop, 2)}
            rx={3}
            fill={neutral}
          />
          <rect data-testid="bento-chart-highlight" x={0} y={todayY - 2} width={W} height={4} rx={2} fill={hot} />
          <circle data-testid="bento-chart-point" data-highlight cx={W - 10} cy={todayY} r={6} fill={hot} />
        </svg>
      )
    }

    const cy = H / 2
    const trackH = 5
    const r = 4.5

    return (
      <svg {...svgSize} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <rect x={0} y={cy - trackH / 2} width={W} height={trackH} rx={trackH / 2} fill={neutral} opacity={0.35} />
        <rect
          data-testid="bento-chart-band"
          x={px(lo)}
          y={cy - trackH / 2}
          width={Math.max(px(hi) - px(lo), 2)}
          height={trackH}
          rx={trackH / 2}
          fill={neutral}
        />
        <circle
          data-testid="bento-chart-point"
          data-highlight
          cx={Math.max(r, Math.min(W - r, px(chart.today)))}
          cy={cy}
          r={r}
          fill={hot}
        />
        <circle
          data-testid="bento-chart-highlight"
          cx={Math.max(r, Math.min(W - r, px(chart.today)))}
          cy={cy}
          r={r}
          fill={hot}
        />
      </svg>
    )
  }

  const max = Math.max(...chart.points, 1)
  const step = W / Math.max(chart.points.length - 1, 1)
  const y = (v: number) => H - (v / max) * (H - 6) - 3

  return (
    <svg {...svgSize} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
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

export default function BentoTile({ label, value, chart, tallChart, note, accent, tall, onExpand }: BentoTileProps) {
  const valuePresent = isPresent(value)
  // The tall slot prefers its own real series; it falls back to the regular
  // (band, or missing) chart when no series exists for this metric — never
  // a fabricated multi-point line. A single-height tile never consults
  // `tallChart` at all, so it always keeps the band it already had.
  const effectiveChart = tall && tallChart && isPresent(tallChart) ? tallChart : chart
  const chartPresent = isPresent(effectiveChart)
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

      {chartPresent && (
        // `flex: 1` only when tall: the chart is the tile's remaining
        // vertical space, not a fixed-size decoration, once it is drawing a
        // real series rather than the one-line band. A single-height tile
        // keeps its natural (content-sized) height, unchanged.
        <div style={tall ? { flex: 1, minHeight: 0, display: 'flex' } : undefined}>
          <TileChartView chart={effectiveChart.value} accent={accent} tall={tall} />
        </div>
      )}

      {note && (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 500, color: noteColor, margin: 0 }}>{note}</p>
      )}
    </div>
  )
}
