import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLocale } from '../../../contexts/LocaleContext'
import { usePeriodReport } from '../../../hooks/usePeriodReport'
import GradeHero from '../../report/GradeHero'
import BodySystems from '../../report/BodySystems'
import ProgressLedger from '../../report/ProgressLedger'
import CausesPanel from '../../report/CausesPanel'
import NextStepCard from '../../report/NextStepCard'
import IntensityMix from '../../report/IntensityMix'
import LoadDynamics from '../../report/LoadDynamics'
import TrajectoryCard from '../../report/TrajectoryCard'
import PrescriptionList from '../../report/PrescriptionList'

/**
 * A collapsible "act" — the report reads as an executive brief in three beats,
 * but only the verdict (Act 1) is open above the fold. Act 2/3 collapse so the
 * tab opens short and the user expands the diagnosis or the plan on demand.
 * Header mirrors the app's PillarSection editorial style (numbered badge, serif
 * title, italic guiding question) with a chevron + persisted expand state.
 */
function ActSection({
  index, title, question, defaultExpanded = false, storageId, children,
}: {
  index: string
  title: string
  question: string
  defaultExpanded?: boolean
  storageId: string
  children: ReactNode
}) {
  const storageKey = `report-act:v1:${storageId}`
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultExpanded
    try {
      const raw = window.localStorage.getItem(storageKey)
      return raw === null ? defaultExpanded : raw === 'true'
    } catch {
      return defaultExpanded
    }
  })
  const toggle = () => {
    setExpanded((e) => {
      const next = !e
      try { window.localStorage.setItem(storageKey, String(next)) } catch { /* soft fail */ }
      return next
    })
  }

  return (
    <section className="flex flex-col min-w-0" style={{ scrollMarginTop: 16 }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`report-act-${storageId}`}
        className="w-full text-left flex items-baseline gap-3 pb-1.5 min-h-[44px]"
        style={{ borderBottom: '1px solid var(--color-rule)' }}
      >
        <span
          className="num-mono shrink-0 grid place-items-center rounded-full self-center"
          style={{
            width: 22, height: 22, fontSize: 11, fontWeight: 600,
            color: 'var(--color-forest-2)',
            border: '1px solid color-mix(in srgb, var(--color-forest-2) 40%, transparent)',
          }}
        >{index}</span>
        <h2 style={{
          color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 20,
          fontWeight: 500, letterSpacing: '-0.01em',
        }}>{title}</h2>
        <span
          className="ml-auto text-right hidden sm:block self-center"
          style={{ color: 'var(--color-ink-2)', fontSize: 13, fontStyle: 'italic', maxWidth: '46%' }}
        >{question}</span>
        <ChevronDown
          size={18}
          strokeWidth={1.8}
          className="shrink-0 self-center ml-2 sm:ml-3"
          style={{
            color: 'var(--color-ink-2)',
            transform: expanded ? 'rotate(-180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
          }}
        />
      </button>
      <p className="sm:hidden mt-1" style={{ color: 'var(--color-ink-2)', fontSize: 13, fontStyle: 'italic' }}>{question}</p>

      <div
        id={`report-act-${storageId}`}
        role="region"
        aria-hidden={!expanded}
        className="overflow-hidden"
        style={{
          maxHeight: expanded ? '6000px' : '0px',
          transition: 'max-height 400ms ease',
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="flex flex-col gap-4 sm:gap-5 pt-4">{children}</div>
      </div>
    </section>
  )
}

/** Report tab — periodized verdict read as three acts:
 * Act 1 · Verdict (grade hero, always open above the fold) →
 * Act 2 · Diagnosis (body systems + progress + causes + intensity + load) →
 * Act 3 · Prescription (trajectory + next actions). Acts 2 & 3 collapse. */
export default function ReportTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [days, setDays] = useState(7)
  const { data: report, isLoading, isError } = usePeriodReport(days)

  return (
    <div className="flex flex-col gap-8 sm:gap-9 min-w-0">
      {isLoading && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[20px] h-48 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
          <div className="rounded-[18px] h-72 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
        </div>
      )}
      {isError && (
        <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
          {de ? 'Bericht konnte nicht geladen werden. Versuche es gleich erneut.' : "Couldn't load your report. Try again in a moment."}
        </p>
      )}

      {report && (
        <>
          {/* ── Act 1 · Verdict (above the fold — the grade + one plain sentence) ── */}
          <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both' }}>
            <GradeHero report={report} days={days} onDaysChange={setDays} />
          </section>

          {/* ── Act 2 · Diagnosis (collapsed by default) ──────────────────────── */}
          <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) 80ms both' }}>
            <ActSection
              index="2"
              storageId="diagnosis"
              defaultExpanded={false}
              title={de ? 'Diagnose' : 'Diagnosis'}
              question={de ? 'Was treibt diese Note — und was bremst dich?' : 'What drives this grade — and what holds you back?'}
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
            </ActSection>
          </section>

          {/* ── Act 3 · Prescription (collapsed by default) ───────────────────── */}
          {/* Streaks/achievements live on Social now — Konstanz stays only as an
              analytic score in Progress/Body Systems, no milestone strip here. */}
          {(report.trajectory || report.prescriptions.length > 0 || report.next_step) && (
            <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) 160ms both' }}>
              <ActSection
                index="3"
                storageId="prescription"
                defaultExpanded={false}
                title={de ? 'Verordnung' : 'Prescription'}
                question={de ? 'Was tun, damit die nächste Periode besser ausfällt?' : 'What to do so the next period grades higher?'}
              >
                {report.trajectory && <TrajectoryCard traj={report.trajectory} />}
                {report.prescriptions.length > 0
                  ? <PrescriptionList prescriptions={report.prescriptions} />
                  : report.next_step && <NextStepCard step={report.next_step} />}
              </ActSection>
            </section>
          )}
        </>
      )}
    </div>
  )
}
