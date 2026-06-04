import { useState } from 'react'
import { usePeriodReport } from '../../../hooks/usePeriodReport'
import WindowToggle from '../../report/WindowToggle'
import GradeHero from '../../report/GradeHero'
import BodySystemRadar from '../../report/BodySystemRadar'
import DeltaCard from '../../report/DeltaCard'
import MilestoneStrip from '../../report/MilestoneStrip'

/** Report tab — periodized verdict: pick a window, see grade + radar +
 * improvements/weaknesses + milestones. */
export default function ReportTab() {
  const [days, setDays] = useState(7)
  const { data: report, isLoading, isError } = usePeriodReport(days)

  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      <WindowToggle value={days} onChange={setDays} />

      {isLoading && (
        <div className="rounded-[18px] h-40 animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      )}
      {isError && (
        <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
          Couldn't load your report. Try again in a moment.
        </p>
      )}

      {report && (
        <>
          <GradeHero report={report} />
          <BodySystemRadar axes={report.radar} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <span className="eyebrow num-mono" style={{ color: 'var(--color-good)', fontSize: 10, letterSpacing: '0.22em' }}>
                IMPROVEMENTS
              </span>
              {report.improvements.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {report.has_baseline ? 'Nothing moved enough to call a win this window.' : 'No previous window to compare against yet.'}
                </p>
              ) : (
                report.improvements.map((d) => <DeltaCard key={d.key} item={d} />)
              )}
            </div>
            <div className="flex flex-col gap-3">
              <span className="eyebrow num-mono" style={{ color: 'var(--color-caution)', fontSize: 10, letterSpacing: '0.22em' }}>
                WATCH-OUTS
              </span>
              {report.weaknesses.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {report.has_baseline ? 'No significant regressions — clean window.' : 'No previous window to compare against yet.'}
                </p>
              ) : (
                report.weaknesses.map((d) => <DeltaCard key={d.key} item={d} />)
              )}
            </div>
          </div>

          <MilestoneStrip milestones={report.milestones} />
        </>
      )}
    </div>
  )
}
