import { Minus, Plus } from 'lucide-react'

interface StepperProps {
  value: number
  onChange: (next: number) => void
  step?: number
  min?: number
  /** decimals to keep on the direct-input value (weights use 1, reps use 0). */
  decimals?: number
  suffix?: string
  /** Accent used for the numeric value + tap targets. */
  color?: string
  ariaLabel?: string
}

/**
 * Big-tap-target −/＋ stepper with a direct-input field between the buttons.
 * Built for one-handed logging: nudge the last-time weight up/down, or type it.
 */
export function Stepper({
  value,
  onChange,
  step = 2.5,
  min = 0,
  decimals = 1,
  suffix,
  color = 'var(--color-ink)',
  ariaLabel,
}: StepperProps) {
  const clamp = (n: number) => Math.max(min, Math.round(n * 100) / 100)
  const display = Number.isFinite(value)
    ? (decimals === 0 ? String(Math.round(value)) : String(value))
    : ''

  const btn = (dir: -1 | 1, icon: React.ReactNode) => (
    <button
      type="button"
      aria-label={`${ariaLabel ?? ''} ${dir > 0 ? '+' : '-'}${step}`}
      onClick={() => onChange(clamp(value + dir * step))}
      className="flex items-center justify-center"
      style={{
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: 12,
        border: '1px solid var(--color-rule)',
        background: 'var(--color-surface-2)',
        color: 'var(--color-ink)',
      }}
    >
      {icon}
    </button>
  )

  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      {btn(-1, <Minus size={18} />)}
      <div
        className="flex flex-1 items-baseline justify-center"
        style={{
          gap: 3,
          height: 44,
          borderRadius: 12,
          border: '1px solid var(--color-rule)',
          background: 'var(--color-paper-2)',
          paddingLeft: 6,
          paddingRight: 6,
        }}
      >
        <input
          inputMode="decimal"
          aria-label={ariaLabel}
          value={display}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.')
            if (raw === '') {
              onChange(min)
              return
            }
            const n = Number(raw)
            if (!Number.isNaN(n)) onChange(clamp(n))
          }}
          className="num-display"
          style={{
            width: '100%',
            minWidth: 0,
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 700,
            color,
            background: 'transparent',
            border: 'none',
            outline: 'none',
          }}
        />
        {suffix && (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', flexShrink: 0 }}>{suffix}</span>
        )}
      </div>
      {btn(1, <Plus size={18} />)}
    </div>
  )
}
