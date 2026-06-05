import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { usePMC } from '../../hooks/usePMC'
import { useLocale } from '../../contexts/LocaleContext'

/**
 * SkipTodayDialog — a "show me the implications" modal for marking today
 * skipped. No backend write (yet); pure forecast on top of the existing
 * PMC math so the athlete sees what happens before they commit.
 *
 * Two numbers do the heavy lifting:
 *   ATL_tomorrow = ATL_today + (today_tss − ATL_today) / 7
 *   CTL_tomorrow = CTL_today + (today_tss − CTL_today) / 42
 *
 * We project both with today's planned TSS and with zero, show the deltas,
 * then sketch the downstream beats: tomorrow's projection stays whatever
 * the picker chose (the picker is stateless), the week falls behind by
 * one session, and the race-day trajectory is essentially unchanged for
 * a single skipped day (the CTL math is unforgiving but slow).
 *
 * The user gets transparency, not a guilt trip.
 */

interface SkipTodayDialogProps {
  open: boolean
  onClose: () => void
}

function fmtSigned(n: number, digits = 1): string {
  return (n >= 0 ? '+' : '') + n.toFixed(digits)
}

export default function SkipTodayDialog({ open, onClose }: SkipTodayDialogProps) {
  const { locale } = useLocale()
  const { data: brief } = useCoachBrief()
  const { data: pmc } = usePMC(14)
  const [acknowledged, setAcknowledged] = useState(false)

  // Reset ack when dialog closes/reopens
  useEffect(() => {
    if (!open) setAcknowledged(false)
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pw = brief?.prescribed_workout
  const todayTss = Math.round(pw?.predicted_tss ?? 0)
  const todayTitle = pw?.title ?? (locale === 'de' ? 'Heutige Einheit' : "Today's session")
  const todayMinutes = pw?.duration_minutes ?? null

  const entries = pmc?.entries ?? []
  const latest = entries.length > 0 ? entries[entries.length - 1] : null

  // Project two scenarios for tomorrow morning's PMC.
  function project(tssToday: number) {
    if (!latest) return null
    const atlTomorrow = latest.atl + (tssToday - latest.atl) / 7
    const ctlTomorrow = latest.ctl + (tssToday - latest.ctl) / 42
    return {
      ctl: ctlTomorrow,
      atl: atlTomorrow,
      tsb: ctlTomorrow - atlTomorrow,
    }
  }
  const withWorkout = project(todayTss)
  const skipping = project(0)

  const tsbDelta =
    withWorkout && skipping ? skipping.tsb - withWorkout.tsb : null
  const ctlDelta =
    withWorkout && skipping ? skipping.ctl - withWorkout.ctl : null

  // Race-day trajectory note. Single skipped day moves CTL ~−0.1/day for
  // 42 days, which on a typical 50-CTL target ≈ <1 CTL point at the race
  // — true to the math, reassuring to the athlete.
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const daysToGoal = athlete?.days_to_goal as number | null | undefined
  const goalName = (athlete?.goal_target as string | undefined) ?? null
  // CTL impact at race day from one skipped day: dCTL × decay factor
  // ≈ (skipping.ctl − withWorkout.ctl) × (1 − 1/42)^days_remaining.
  let raceCtlImpact: number | null = null
  if (ctlDelta != null && typeof daysToGoal === 'number' && daysToGoal > 0) {
    raceCtlImpact = ctlDelta * Math.pow(1 - 1 / 42, daysToGoal)
  }

  // Weekly TSS comparison
  const wp = evidence.weekly_progress as Record<string, unknown> | undefined
  const tssWeekActual = Math.round((wp?.total_tss_this_week as number | undefined) ?? 0)
  const tssWeekWithToday = tssWeekActual + todayTss

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={locale === 'de' ? 'Heute aussetzen — Auswirkungen' : 'Skip today — implications'}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: 'radial-gradient(70% 60% at 50% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0.35))',
        animation: 'fade-in 240ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-[18px] max-w-md w-full flex flex-col gap-4 p-5 sm:p-6"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
          boxShadow: '0 16px 48px -16px rgba(0,0,0,0.55)',
          animation: 'score-enter 320ms cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span
              className="eyebrow num-mono"
              style={{
                color: 'var(--color-caution)',
                fontSize: 10,
                letterSpacing: '0.22em',
                fontWeight: 600,
              }}
            >
              {locale === 'de' ? 'WENN DU HEUTE AUSSETZT' : 'IF YOU SKIP TODAY'}
            </span>
            <h2
              className="leading-tight mt-1"
              style={{
                fontFamily: 'var(--font-serif, serif)',
                fontStyle: 'italic',
                fontSize: 22,
                color: 'var(--color-ink)',
              }}
            >
              {locale === 'de' ? 'Das ändert sich.' : "Here's what changes."}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md"
            style={{ color: 'var(--color-muted)' }}
            aria-label={locale === 'de' ? 'Schließen' : 'Close'}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Today line */}
        <div
          className="rounded-[10px] px-3 py-2 num-mono flex items-baseline gap-2 flex-wrap"
          style={{
            backgroundColor: 'var(--color-paper)',
            border: '1px solid var(--color-rule)',
            fontSize: 12,
          }}
        >
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.22em' }}>
            {locale === 'de' ? 'HEUTE' : 'TODAY'}
          </span>
          <span style={{ color: 'var(--color-ink)' }}>{todayTitle}</span>
          <span style={{ color: 'var(--color-muted)' }}>
            {todayMinutes ? `· ${todayMinutes} min ` : ''}
            · {todayTss} TSS
          </span>
        </div>

        {/* The math: tomorrow morning PMC delta */}
        {withWorkout && skipping && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div
              className="rounded-[10px] py-3"
              style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}
            >
              <span className="eyebrow block" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.2em' }}>
                FORM · TSB
              </span>
              <span
                className="num-mono block mt-1"
                style={{ color: 'var(--color-good)', fontSize: 18, fontWeight: 500 }}
              >
                {fmtSigned(tsbDelta ?? 0, 1)}
              </span>
              <span className="num-mono block" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
                {locale === 'de' ? 'morgen' : 'tomorrow'}
              </span>
            </div>
            <div
              className="rounded-[10px] py-3"
              style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}
            >
              <span className="eyebrow block" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.2em' }}>
                FATIGUE · ATL
              </span>
              <span
                className="num-mono block mt-1"
                style={{ color: 'var(--color-good)', fontSize: 18, fontWeight: 500 }}
              >
                {fmtSigned(skipping.atl - withWorkout.atl, 1)}
              </span>
              <span className="num-mono block" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
                {locale === 'de' ? 'morgen' : 'tomorrow'}
              </span>
            </div>
            <div
              className="rounded-[10px] py-3"
              style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}
            >
              <span className="eyebrow block" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.2em' }}>
                FITNESS · CTL
              </span>
              <span
                className="num-mono block mt-1"
                style={{ color: (ctlDelta ?? 0) < 0 ? 'var(--color-caution)' : 'var(--color-ink)', fontSize: 18, fontWeight: 500 }}
              >
                {fmtSigned(ctlDelta ?? 0, 2)}
              </span>
              <span className="num-mono block" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
                {locale === 'de' ? 'morgen' : 'tomorrow'}
              </span>
            </div>
          </div>
        )}

        {/* Implications prose */}
        <div className="flex flex-col gap-2">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            ▸ <span style={{ color: 'var(--color-ink)' }}>{locale === 'de' ? 'Diese Woche:' : 'This week:'}</span>{' '}
            {locale === 'de'
              ? `${tssWeekActual} von ${tssWeekWithToday} geplanten TSS landen. Die fehlende Einheit kann auf einen späteren Slot rutschen oder ausfallen, wenn du die Erholung brauchst.`
              : `${tssWeekActual} of ${tssWeekWithToday} planned TSS lands. The missing session can slide to a later slot, or stay missed if you need the recovery.`}
          </p>
          {typeof daysToGoal === 'number' && daysToGoal > 0 && raceCtlImpact != null && goalName && (
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
              ▸ <span style={{ color: 'var(--color-ink)' }}>{locale === 'de' ? `Wettkampftag (${daysToGoal} T bis ${goalName}):` : `Race day (${daysToGoal} d to ${goalName}):`}</span>{' '}
              {locale === 'de' ? 'die Fitness am Event sinkt um' : 'fitness at the event drops by'}{' '}
              <span className="num-mono" style={{ color: 'var(--color-ink)' }}>
                {Math.abs(raceCtlImpact).toFixed(1)} CTL
              </span>
              {Math.abs(raceCtlImpact) < 0.6
                ? (locale === 'de'
                    ? ' — kaum mehr als ein Rundungsfehler im Verlauf.'
                    : ' — barely a rounding error against the trajectory.')
                : Math.abs(raceCtlImpact) < 1.5
                  ? (locale === 'de'
                      ? ' — klein, aber real; ein etwas größeres Wochenende lohnt sich, wenn möglich.'
                      : " — small but real; worth a slightly bigger weekend if you can.")
                  : (locale === 'de'
                      ? ' — spürbar; verschiebe die Einheit lieber, statt sie zu streichen.'
                      : ' — meaningful; consider moving the session rather than dropping it.')}
            </p>
          )}
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            ▸ <span style={{ color: 'var(--color-ink)' }}>{locale === 'de' ? 'Morgen:' : 'Tomorrow:'}</span>{' '}
            {locale === 'de'
              ? 'der Picker rechnet jeden Morgen neu aus dem aktuellen Zustand, sodass sich die Empfehlung für morgen automatisch an die geringere Ermüdung anpasst.'
              : "the picker re-projects from current state each morning, so tomorrow's call adjusts automatically to the lower fatigue."}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[13px] font-medium"
            style={{ color: 'var(--color-ink-2)' }}
          >
            {locale === 'de' ? 'Vergiss es, ich mache es' : "Never mind, I'm doing it"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAcknowledged(true)
              // Best-effort local-only marker so the dashboard knows the
              // user chose to skip. Backend-write integration ships when
              // the planned_workouts modify flow lands.
              try {
                localStorage.setItem(
                  'skip_today_v0',
                  JSON.stringify({
                    date: new Date().toISOString().slice(0, 10),
                    template_id: pw?.template_id ?? null,
                  }),
                )
              } catch {
                /* ignore */
              }
              setTimeout(onClose, 1200)
            }}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
            style={{
              backgroundColor: acknowledged
                ? 'var(--color-good)'
                : 'var(--color-caution)',
              color: 'var(--color-paper)',
            }}
            disabled={acknowledged}
          >
            {acknowledged
              ? (locale === 'de' ? 'Verstanden — Ruhetag' : 'Got it — easy day')
              : (locale === 'de' ? 'Heute aussetzen' : 'Skip today')}
          </button>
        </div>
      </div>
    </div>
  )
}
