import { useState } from 'react'
import { Activity, ArrowDown, ArrowUp, Heart, Layers, Minus, Moon, TrendingUp } from 'lucide-react'
import { MOTION_EASE, prefersReducedMotion } from '../motion/useReveal'
import type { MetricGlyph, MetricTile } from './model'

/** One mark per metric, always the same mark. Lucide is already this system's
 *  icon library — see DayMark, HeaderSpine, TabBar, TomorrowBand — and the
 *  house convention is size + a token colour + aria-hidden. */
const GLYPH: Record<MetricGlyph, typeof Activity> = {
  hrv: Activity,
  cardiac: Heart,
  form: TrendingUp,
  load: Layers,
  sleep: Moon,
}

/**
 * A week of the metric, at a glance.
 *
 * Deliberately not `components/ui/Sparkline`: that one is `motion/react`-based
 * (this subtree uses CSS transitions only) and draws a gradient area fill that
 * would put four more filled shapes on a screen whose one filled shape is
 * supposed to be the form ribbon. This is a bare 7-point line with the last
 * point marked — enough to answer "blip or trend?" and nothing more.
 */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const W = 46
  const H = 16
  const lo = Math.min(...values)
  const span = Math.max(Math.max(...values) - lo, 0.0001)
  const pt = (v: number, i: number) => [
    (i / (values.length - 1)) * W,
    2 + (1 - (v - lo) / span) * (H - 4),
  ] as const

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={values.map((v, i) => pt(v, i).join(',')).join(' ')}
        fill="none" stroke="var(--d-3)" strokeWidth={1.25}
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
      />
      {/* --e-ink, not the good/bad tone: the arrow beside this already carries
          that judgement, and repeating it here put eight marks of the same
          colour on one grid, which reads as decoration rather than as signal.
          The dot's job is only "this is where you are now". */}
      <circle cx={pt(values[values.length - 1], values.length - 1)[0]} cy={pt(values[values.length - 1], values.length - 1)[1]} r={2.2} fill="var(--e-ink)" />
    </svg>
  )
}

function Arrow({ dir, tone }: { dir: 'up' | 'down' | 'flat'; tone: string }) {
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus
  return <Icon size={12} color={tone} strokeWidth={3} aria-hidden="true" />
}

function Tile({ tile }: { tile: MetricTile }) {
  const [open, setOpen] = useState(false)
  const Icon = tile.glyph ? GLYPH[tile.glyph] : null
  // Direction is meaningless without knowing which direction is GOOD for this
  // metric — resting HR falling is the good arrow, HRV falling is not. The
  // colour carries that judgement so the arrow alone never has to.
  const tone = tile.good == null ? 'var(--e-mid)' : tile.good ? 'var(--s-good)' : 'var(--s-mid)'
  const valueTone = tile.tone === 'accent' ? 'var(--st-active)' : 'var(--e-ink)'

  return (
    <button
      type="button"
      data-testid="metric-tile"
      onClick={() => tile.note && setOpen((o) => !o)}
      aria-expanded={tile.note ? open : undefined}
      style={{
        display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 13px',
        borderRadius: 14, background: 'var(--e-glass)', border: '1px solid var(--e-rule)',
        textAlign: 'left', color: 'inherit', cursor: tile.note ? 'pointer' : 'default',
        transition: prefersReducedMotion() ? undefined : `border-color 240ms ${MOTION_EASE}`,
        borderColor: open ? 'var(--st-a40)' : 'var(--e-rule)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={13} color="var(--st-active)" strokeWidth={2.5} aria-hidden="true" />}
        <span style={{
          fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800,
          letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--e-quiet)',
        }}>{tile.label}</span>
      </span>

      <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800,
          letterSpacing: '-0.03em', color: valueTone,
        }}>{tile.value}</span>
        {tile.unit && <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', color: 'var(--e-quiet)' }}>{tile.unit}</span>}
      </span>

      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {tile.dir && <Arrow dir={tile.dir} tone={tone} />}
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700, color: tile.dir ? tone : 'var(--e-quiet)' }}>
            {tile.sub}
          </span>
        </span>
        {tile.spark && <Spark values={tile.spark} />}
      </span>

      {tile.note && open && (
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', lineHeight: 1.45, color: 'var(--e-mid)' }}>
          {tile.note}
        </span>
      )}
    </button>
  )
}

/**
 * The brief's four numbers, built to be glanced at rather than read.
 *
 * Three encodings stack on every tile, in decreasing speed: the glyph (which
 * metric), the arrow's colour (good or not), then the spark (blip or trend).
 * All three land before the label does. The sentence explaining any of it is
 * one tap away and closed by default, so depth never costs scannability.
 */
export default function MetricTiles({ tiles }: { tiles: MetricTile[] }) {
  return (
    <div data-testid="metric-tiles" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' }}>
      {tiles.map((t) => <Tile key={t.label} tile={t} />)}
    </div>
  )
}
