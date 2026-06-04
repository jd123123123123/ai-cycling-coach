import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { RadarAxis } from '../../api/report'

/** Collapsible per-axis breakdown — the report's "Why this score?" panel.
 * Renders each axis's score as a bar + the backend detail string. */
export default function WhyThisGrade({ axes }: { axes: RadarAxis[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-[18px]" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4"
      >
        <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
          WHY THIS GRADE
        </span>
        <ChevronDown size={16} style={{ color: 'var(--color-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }} />
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {axes.map((a) => (
            <div key={a.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span style={{ color: 'var(--color-ink)', fontSize: 13 }}>{a.label}</span>
                <span className="num-mono" style={{ color: a.insufficient_data ? 'var(--color-muted)' : 'var(--color-ink-2)', fontSize: 12 }}>
                  {a.score == null ? '—' : Math.round(a.score)}
                </span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 5, backgroundColor: 'var(--color-rule)' }}>
                <div style={{
                  height: '100%', width: `${a.score ?? 0}%`,
                  backgroundColor: a.insufficient_data ? 'var(--color-muted)' : 'var(--color-good)',
                  transition: 'width 600ms var(--ease-apple-default, ease)',
                }} />
              </div>
              {a.detail && (
                <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{a.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
