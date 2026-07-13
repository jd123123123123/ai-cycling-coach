import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import type { DeltaItem } from '../../api/report'

/**
 * "Then → Now" — the explicit before/after of the window. Each metric shows its
 * previous-window value transitioning to the current one, colored by whether it
 * improved, so the athlete sees at a glance HOW they changed and WHAT is still
 * lacking. Rows expand for the why. This is the visual heart of the Analyze story.
 */

const fmtVal = (v: number | null | undefined): string => {
  if (v == null) return '—'
  // Integers stay integers; small fractional metrics (W/kg, EF, TSB) keep 1 dp.
  const abs = Math.abs(v)
  return Number.isInteger(v) ? String(v) : abs < 10 ? v.toFixed(1) : String(Math.round(v))
}

function ProgressRow({ item }: { item: DeltaItem }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [open, setOpen] = useState(false)
  const accent = item.is_improvement ? 'var(--color-good)' : 'var(--color-caution)'
  const before = item.prev_value
  const after = item.curr_value ?? (before != null ? before + item.delta : null)
  const magnitude = `${item.delta > 0 ? '+' : ''}${item.delta}${item.unit ? ` ${item.unit}` : ''}`
  // Position the two dots on a shared track by relative magnitude (only when both
  // are finite & non-negative — otherwise we just show the values + arrow).
  const canTrack = before != null && after != null && before >= 0 && after >= 0
  const max = canTrack ? Math.max(before as number, after as number, 1) : 1
  const bx = canTrack ? Math.max(4, ((before as number) / max) * 100) : 0
  const ax = canTrack ? Math.max(4, ((after as number) / max) * 100) : 0

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="w-full text-left rounded-[14px] p-3.5 transition-colors"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0" style={{ color: 'var(--color-ink)', fontSize: 13.5, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
          {item.label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="num-mono" style={{ fontSize: 13, color: 'var(--color-muted)' }}>{fmtVal(before)}</span>
          <span style={{ color: accent, fontSize: 12 }}>→</span>
          <span className="num-mono" style={{ fontSize: 15, color: accent, fontWeight: 600 }}>{fmtVal(after)}</span>
          {item.unit && <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>{item.unit}</span>}
        </div>
        <span className="num-mono shrink-0 px-2 py-0.5 rounded-full" style={{ fontSize: 10.5, color: accent, backgroundColor: `color-mix(in srgb, ${accent} 13%, transparent)` }}>
          {magnitude}
        </span>
        <ChevronDown size={15} style={{ color: 'var(--color-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }} />
      </div>

      {canTrack && (
        <div className="relative mt-2.5 mx-0.5" style={{ height: 6 }}>
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full" style={{ height: 2, background: 'var(--color-rule)' }} />
          {/* travel segment between before and after */}
          <div className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ left: `${Math.min(bx, ax)}%`, width: `${Math.abs(ax - bx)}%`, height: 2, background: accent, opacity: 0.5 }} />
          <span className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ left: `calc(${bx}% - 3px)`, width: 6, height: 6, background: 'var(--color-muted)' }} />
          <span className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ left: `calc(${ax}% - 4px)`, width: 8, height: 8, background: accent, boxShadow: `0 0 8px ${accent}` }} />
        </div>
      )}

      {open && (
        <div className="mt-2.5 flex flex-col gap-1">
          <span className="num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 13 }}>{item.detail}</span>
          <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>{item.why}</span>
        </div>
      )}
      {!open && <span className="sr-only">{de ? 'Details' : 'Details'}</span>}
    </button>
  )
}

export default function ProgressLedger({
  improvements, hasBaseline,
}: { improvements: DeltaItem[]; hasBaseline: boolean }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const nUp = improvements.length

  // The limiters live in one place — CausesPanel ("Was dich bremst"). This
  // ledger owns only the wins, so the two lists never restate the same metric.
  const emptyMsg = !hasBaseline
    ? (de ? 'Noch kein Vergleichszeitraum.' : 'No previous window to compare yet.')
    : (de ? 'Nichts hat sich genug bewegt für einen Erfolg.' : 'Nothing moved enough to call a win.')

  return (
    <div className="rounded-[18px] p-5 sm:p-6" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
            {de ? 'FORTSCHRITT · DAMALS → JETZT' : 'PROGRESS · THEN → NOW'}
          </span>
          <h3 className="mt-1" style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(19px, 2.2vw, 23px)', fontWeight: 500, color: 'var(--color-ink)', lineHeight: 1.1 }}>
            {de ? 'Was ich verbessert habe' : 'What I’ve improved'}
          </h3>
        </div>
        {hasBaseline && nUp > 0 && (
          <div className="shrink-0 num-mono" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--color-good)' }}>▲ {nUp} {de ? 'besser' : 'up'}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="eyebrow num-mono" style={{ color: 'var(--color-good)', fontSize: 10, letterSpacing: '0.22em' }}>
          {de ? 'VERBESSERT' : 'IMPROVED'}
        </span>
        {nUp === 0
          ? <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>{emptyMsg}</p>
          : improvements.map((d) => <ProgressRow key={d.key} item={d} />)}
      </div>
    </div>
  )
}
