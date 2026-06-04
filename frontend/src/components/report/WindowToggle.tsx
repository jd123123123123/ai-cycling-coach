import { useState } from 'react'

const PRESETS = [7, 14, 30] as const

/** 7 / 14 / 30 / custom day-window selector. Custom reveals a number input. */
export default function WindowToggle({
  value,
  onChange,
}: {
  value: number
  onChange: (days: number) => void
}) {
  const isPreset = (PRESETS as readonly number[]).includes(value)
  const [customOpen, setCustomOpen] = useState(!isPreset)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((d) => {
        const active = value === d && !customOpen
        return (
          <button
            key={d}
            type="button"
            onClick={() => { setCustomOpen(false); onChange(d) }}
            className="px-3 py-1.5 rounded-full num-mono transition-colors"
            style={{
              fontSize: 12,
              letterSpacing: '0.08em',
              backgroundColor: active ? 'var(--color-ink)' : 'var(--color-paper-2)',
              color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
            }}
            aria-pressed={active}
          >
            {d}D
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => setCustomOpen(true)}
        className="px-3 py-1.5 rounded-full num-mono transition-colors"
        style={{
          fontSize: 12,
          letterSpacing: '0.08em',
          backgroundColor: customOpen ? 'var(--color-ink)' : 'var(--color-paper-2)',
          color: customOpen ? 'var(--color-paper)' : 'var(--color-ink-2)',
          border: '1px solid var(--color-rule)',
        }}
        aria-pressed={customOpen}
      >
        Custom
      </button>
      {customOpen && (
        <input
          type="number"
          min={3}
          max={365}
          value={value}
          onChange={(e) => {
            const n = Math.max(3, Math.min(365, Number(e.target.value) || 3))
            onChange(n)
          }}
          className="w-20 px-2 py-1.5 rounded-md num-mono"
          style={{
            fontSize: 12,
            backgroundColor: 'var(--color-paper-2)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-rule)',
          }}
          aria-label="Custom day count"
        />
      )}
    </div>
  )
}
