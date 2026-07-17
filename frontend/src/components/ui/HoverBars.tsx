import { useState } from 'react'

export interface HoverBar {
  value: number
  /** Primary tooltip line (e.g. the formatted value "240 TSS"). */
  valueLabel: string
  /** Secondary tooltip line (e.g. the date/period "Jun 30 – Jul 6"). */
  label: string
  color?: string
  /** Emphasized (e.g. current week) — full opacity + accent. */
  highlight?: boolean
}

/**
 * Interactive bar chart: hover (or tap) any bar to see its value + period in a
 * floating tooltip. Pure presentational, data-driven — pass real bars. Works
 * with mouse and touch (pointer events); the active bar brightens.
 */
export default function HoverBars({
  bars,
  height = 90,
  gap = 3,
  defaultColor = 'var(--color-strain)',
  radius = 3,
}: {
  bars: HoverBar[]
  height?: number
  gap?: number
  defaultColor?: string
  radius?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...bars.map((b) => b.value), 1)
  const act = active != null ? bars[active] : null

  return (
    <div className="relative select-none" style={{ width: '100%' }}>
      {/* Tooltip */}
      {act && (
        <div
          className="absolute z-20 pointer-events-none flex flex-col items-center"
          style={{
            left: `${((active! + 0.5) / bars.length) * 100}%`,
            bottom: height + 8,
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className="rounded-[10px] px-2.5 py-1.5 flex flex-col items-center gap-0.5 whitespace-nowrap"
            style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-rule)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)' }}
          >
            <span className="num-display" style={{ fontSize: 14, lineHeight: 1, color: act.color ?? (act.highlight ? 'var(--color-accent)' : 'var(--color-ink)') }}>{act.valueLabel}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>{act.label}</span>
          </div>
          <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid var(--color-surface-3)' }} />
        </div>
      )}

      <div className="flex items-end" style={{ height, gap }}>
        {bars.map((b, i) => {
          const on = active === i
          const col = b.color ?? (b.highlight ? 'var(--color-accent)' : defaultColor)
          return (
            <button
              key={i}
              type="button"
              className="flex-1 min-w-0 p-0 border-0 bg-transparent"
              style={{ height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'pointer' }}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
              aria-label={`${b.label}: ${b.valueLabel}`}
            >
              <span
                className="block w-full"
                style={{
                  height: `${Math.max(6, (b.value / max) * 100)}%`,
                  background: col,
                  borderRadius: `${radius}px ${radius}px 0 0`,
                  opacity: on ? 1 : b.highlight ? 1 : 0.8,
                  outline: on ? '2px solid color-mix(in srgb, var(--color-ink) 25%, transparent)' : 'none',
                  outlineOffset: 1,
                  transition: 'opacity 0.12s ease',
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
