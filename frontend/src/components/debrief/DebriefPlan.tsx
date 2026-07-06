import { useLocale } from '../../contexts/LocaleContext'
import type { Prescription } from '../../api/debrief'

// Act 4 — the plan. Ranked prescriptions from this ride: what to carry into
// the next race, and what to fix in training. Mirrors the Card idiom from
// BreakdownPanels / PrescriptionList but stays a numbered list, since order
// (priority) is the point here.

const TONE_COLOR: Record<string, string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink-2)',
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 11%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 30%, var(--color-rule))` }}
    >
      <span className="num-mono" style={{ fontSize: 9, letterSpacing: '0.12em', color, fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: 'var(--color-ink)' }}>{value}</span>
    </span>
  )
}

export default function DebriefPlan({ plan }: { plan: Prescription[] }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!plan || plan.length === 0) return null

  return (
    <div>
      <h2 style={{ color: 'var(--color-ink)', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        {de ? 'Der Plan' : 'The plan'}
      </h2>
      <ol className="list-none m-0 p-0 flex flex-col gap-3">
        {plan.map((p, i) => {
          const accent = TONE_COLOR[p.tone] ?? 'var(--color-ink-2)'
          return (
            <li
              key={p.priority ?? i}
              className="rounded-[14px] p-4 flex gap-3"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                border: '1px solid var(--color-rule)',
                borderLeft: `3px solid ${accent}`,
              }}
            >
              <span
                className="num-mono shrink-0"
                style={{ fontSize: 13, color: 'var(--color-muted)', width: 18, textAlign: 'right' }}
              >
                {i + 1}
              </span>
              <div className="flex flex-col gap-2 min-w-0">
                <span style={{ color: 'var(--color-ink)', fontSize: 14.5, fontWeight: 600 }}>
                  {p.headline}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    label={de ? 'NÄCHSTES RENNEN' : 'NEXT RACE'}
                    value={p.race_tactic}
                    color="var(--color-good)"
                  />
                  <Chip
                    label={de ? 'TRAINING' : 'TRAINING'}
                    value={p.training_fix}
                    color="var(--color-ink-2)"
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
