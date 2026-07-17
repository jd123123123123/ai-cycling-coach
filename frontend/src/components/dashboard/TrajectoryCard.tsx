import { CalendarOff } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { usePeriodReport } from '../../hooks/usePeriodReport'

// Trajectory — where the current plan lands the athlete over the next block:
// peak-form ETA, the fitness (CTL) projection, and required vs. actual weekly
// TSS. Falls back to a graceful "no event set" state when no goal is on the
// calendar. Fed by the period report's trajectory block.

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--color-muted)' }}>{label}</span>
      <span className="num-display" style={{ fontSize: 20, color: color ?? 'var(--color-ink)' }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{sub}</span>}
    </div>
  )
}

export default function TrajectoryCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = usePeriodReport(90)
  const t = data?.trajectory

  const shell = (children: React.ReactNode) => (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Verlauf · nächste 7 Tage' : 'Trajectory · next 7 days'}</span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Projektion zum Ziel-Event' : 'Projection to your target event'}</span>
      </div>
      {children}
    </div>
  )

  if (!t) return null

  // No goal on the calendar → graceful empty state.
  const hasGoal = t.days_to_goal != null || (t.ctl_target != null && t.ctl_target > 0)
  if (!hasGoal) {
    return shell(
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CalendarOff size={28} strokeWidth={1.8} style={{ color: 'var(--color-muted)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Kein Event gesetzt' : 'No event set'}</span>
        <span style={{ fontSize: 12, color: 'var(--color-muted)', maxWidth: 240 }}>{de ? 'Lege ein Ziel-Event fest, um deine Formprojektion zu sehen.' : 'Set a target event to see your form projection.'}</span>
      </div>
    )
  }

  const eta = t.days_to_goal != null ? `${t.days_to_goal}` : t.taper_window
  const etaSub = t.days_to_goal != null ? (de ? 'Tage' : 'days') : (de ? 'Taper-Fenster' : 'taper window')
  const tssColor = t.weekly_tss_actual >= t.weekly_tss_required ? 'var(--color-recovery)' : 'var(--color-amber)'

  return shell(
    <>
      <div className="flex justify-between">
        <Stat label={de ? 'Peak-Form' : 'Peak-form ETA'} value={eta} sub={etaSub} color="var(--color-strain)" />
        <Stat
          label={de ? 'Fitness-Projektion' : 'Fitness projection'}
          value={`${Math.round(t.ctl_now)} → ${Math.round(t.ctl_projected_at_goal)}`}
          sub={de ? 'CTL' : 'CTL'}
        />
        <Stat
          label={de ? 'Wöchentl. TSS' : 'Weekly TSS'}
          value={`${Math.round(t.weekly_tss_actual)} / ${Math.round(t.weekly_tss_required)}`}
          sub={de ? 'ist / soll' : 'actual / required'}
          color={tssColor}
        />
      </div>
      {t.on_track && (
        <>
          <div style={{ height: 1, background: 'var(--color-rule)' }} />
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{t.on_track}</span>
        </>
      )}
    </>
  )
}
