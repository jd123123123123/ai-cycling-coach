import { useState } from 'react'
import { useLocale } from '../../../contexts/LocaleContext'
import { usePeriodReport } from '../../../hooks/usePeriodReport'
import GradeHero from '../../report/GradeHero'
import BodySystems from '../../report/BodySystems'
import ProgressLedger from '../../report/ProgressLedger'
import MilestoneStrip from '../../report/MilestoneStrip'
import CausesPanel from '../../report/CausesPanel'
import NextStepCard from '../../report/NextStepCard'
import IntensityMix from '../../report/IntensityMix'
import LoadDynamics from '../../report/LoadDynamics'
import TrajectoryCard from '../../report/TrajectoryCard'
import PrescriptionList from '../../report/PrescriptionList'

/** Report tab — periodized verdict read as three acts:
 * Verdict (grade hero) → Diagnosis (body systems + deltas + causes) →
 * Prescription (milestones + next step). */
export default function ReportTab() {
  const { locale } = useLocale()
  const [days, setDays] = useState(7)
  const { data: report, isLoading, isError } = usePeriodReport(days)

  return (
    <div className="flex flex-col gap-8 sm:gap-10 min-w-0">
      {isLoading && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[20px] h-48 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
          <div className="rounded-[18px] h-72 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
        </div>
      )}
      {isError && (
        <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
          {locale === 'de' ? 'Bericht konnte nicht geladen werden. Versuche es gleich erneut.' : "Couldn't load your report. Try again in a moment."}
        </p>
      )}

      {report && (
        <>
          {/* ── Act 1 · Verdict ─────────────────────────────────────── */}
          <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both' }}>
            <GradeHero report={report} days={days} onDaysChange={setDays} />
          </section>

          {/* ── Act 2 · Diagnosis ───────────────────────────────────── */}
          <section
            className="flex flex-col gap-4 sm:gap-5"
            style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) 80ms both' }}
          >
            <BodySystems axes={report.radar} />

            <ProgressLedger
              improvements={report.improvements}
              hasBaseline={report.has_baseline}
            />

            <CausesPanel causes={report.causes} />

            {(report.intensity || report.load_dynamics) && (
              <div className="grid gap-4 md:grid-cols-2">
                {report.intensity && <IntensityMix mix={report.intensity} />}
                {report.load_dynamics && <LoadDynamics load={report.load_dynamics} />}
              </div>
            )}
          </section>

          {/* ── Act 3 · Prescription ────────────────────────────────── */}
          {(report.milestones.length > 0 || report.trajectory || report.prescriptions.length > 0 || report.next_step) && (
            <section
              className="flex flex-col gap-4"
              style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) 160ms both' }}
            >
              <MilestoneStrip milestones={report.milestones} />
              {report.trajectory && <TrajectoryCard traj={report.trajectory} />}
              {report.prescriptions.length > 0
                ? <PrescriptionList prescriptions={report.prescriptions} />
                : report.next_step && <NextStepCard step={report.next_step} />}
            </section>
          )}
        </>
      )}
    </div>
  )
}
