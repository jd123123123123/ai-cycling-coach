import { useState } from 'react'
import { useLocale } from '../../../contexts/LocaleContext'
import { usePeriodReport } from '../../../hooks/usePeriodReport'
import WindowToggle from '../../report/WindowToggle'
import GradeHero from '../../report/GradeHero'
import BodySystemRadar from '../../report/BodySystemRadar'
import DeltaCard from '../../report/DeltaCard'
import MilestoneStrip from '../../report/MilestoneStrip'
import WhyThisGrade from '../../report/WhyThisGrade'
import CausesPanel from '../../report/CausesPanel'
import NextStepCard from '../../report/NextStepCard'

/** Report tab — periodized verdict: pick a window, see grade + radar +
 * improvements/weaknesses + milestones. */
export default function ReportTab() {
  const { locale } = useLocale()
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
          {locale === 'de' ? 'Bericht konnte nicht geladen werden. Versuche es gleich erneut.' : "Couldn't load your report. Try again in a moment."}
        </p>
      )}

      {report && (
        <>
          <GradeHero report={report} />
          <BodySystemRadar axes={report.radar} />
          <WhyThisGrade axes={report.radar} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <span className="eyebrow num-mono" style={{ color: 'var(--color-good)', fontSize: 10, letterSpacing: '0.22em' }}>
                {locale === 'de' ? 'VERBESSERUNGEN' : 'IMPROVEMENTS'}
              </span>
              {report.improvements.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {report.has_baseline
                    ? (locale === 'de' ? 'In diesem Zeitraum hat sich nichts genug bewegt für einen Erfolg.' : 'Nothing moved enough to call a win this window.')
                    : (locale === 'de' ? 'Noch kein vorheriger Zeitraum zum Vergleich.' : 'No previous window to compare against yet.')}
                </p>
              ) : (
                report.improvements.map((d) => <DeltaCard key={d.key} item={d} />)
              )}
            </div>
            <div className="flex flex-col gap-3">
              <span className="eyebrow num-mono" style={{ color: 'var(--color-caution)', fontSize: 10, letterSpacing: '0.22em' }}>
                {locale === 'de' ? 'ACHTUNG' : 'WATCH-OUTS'}
              </span>
              {report.weaknesses.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {report.has_baseline
                    ? (locale === 'de' ? 'Keine nennenswerten Rückschritte — sauberer Zeitraum.' : 'No significant regressions — clean window.')
                    : (locale === 'de' ? 'Noch kein vorheriger Zeitraum zum Vergleich.' : 'No previous window to compare against yet.')}
                </p>
              ) : (
                report.weaknesses.map((d) => <DeltaCard key={d.key} item={d} />)
              )}
            </div>
          </div>

          <CausesPanel causes={report.causes} />
          <MilestoneStrip milestones={report.milestones} />
          {report.next_step && <NextStepCard step={report.next_step} />}
        </>
      )}
    </div>
  )
}
