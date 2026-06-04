import type { PeriodReport } from '../../api/report'

function gradeColor(letter: string | null): string {
  if (!letter) return 'var(--color-muted)'
  const c = letter[0]
  if (c === 'A') return 'var(--color-good)'
  if (c === 'B') return 'var(--color-ink)'
  if (c === 'C') return 'var(--color-caution)'
  return 'var(--color-bad)'
}

/** Big letter grade + composite score + AI verdict, framed "vs previous N days". */
export default function GradeHero({ report }: { report: PeriodReport }) {
  const color = gradeColor(report.grade_letter)
  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
          PERIOD REPORT · {report.days} DAYS
        </span>
        {report.has_baseline ? (
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
            vs previous {report.days} days
          </span>
        ) : (
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
            no baseline yet
          </span>
        )}
      </div>

      <div className="flex items-end gap-5">
        <div className="flex flex-col items-center">
          <span className="leading-none" style={{ color, fontSize: 64, fontWeight: 600 }}>
            {report.grade_letter ?? '—'}
          </span>
          {report.grade_score != null && (
            <span className="num-mono mt-1" style={{ color: 'var(--color-muted)', fontSize: 12 }}>
              {Math.round(report.grade_score)}/100
            </span>
          )}
        </div>
        <p
          className="text-[14px] sm:text-[15px] leading-relaxed pb-1"
          style={{ color: 'var(--color-ink)', maxWidth: '52ch' }}
        >
          {report.ai_verdict}
        </p>
      </div>
    </div>
  )
}
