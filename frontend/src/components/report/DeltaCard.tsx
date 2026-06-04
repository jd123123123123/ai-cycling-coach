import { useState } from 'react'
import { ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { DeltaItem } from '../../api/report'

/** A single improvement/weakness. Plain verdict collapsed; tap expands to the
 * real numbers + why-it-matters. */
export default function DeltaCard({ item }: { item: DeltaItem }) {
  const [open, setOpen] = useState(false)
  const accent = item.is_improvement ? 'var(--color-good)' : 'var(--color-caution)'
  const Arrow = item.direction === 'up' ? ArrowUp : ArrowDown

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="w-full text-left rounded-[14px] p-3.5 transition-colors"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 26, height: 26, backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
        >
          <Arrow size={15} strokeWidth={2.2} />
        </span>
        <span className="flex-1" style={{ color: 'var(--color-ink)', fontSize: 14 }}>
          {item.label}
        </span>
        <ChevronDown
          size={16}
          style={{ color: 'var(--color-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
        />
      </div>
      {open && (
        <div className="mt-2.5 pl-9 flex flex-col gap-1">
          <span className="num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 12 }}>{item.detail}</span>
          <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{item.why}</span>
        </div>
      )}
    </button>
  )
}
