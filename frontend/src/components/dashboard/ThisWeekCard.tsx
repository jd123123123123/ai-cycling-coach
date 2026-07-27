/**
 * ThisWeekCard — the "Diese Woche" / "This Week" card from V3 · Load & Form
 * (pen BIXRn), self-contained so it can mount unchanged on both /load-form and
 * the Today tab (pen OwSbv). Weekly compliance % + TSS/sessions/left + 7 Mon→Sun
 * day-dots, all from the SAME real hooks LoadFormView reads (activities +
 * current-week plan). Where the plan can't supply a figure the card renders an
 * honest "—" / empty state rather than fabricate. German-first, tuned for 390px.
 *
 * The pure math lives in ./thisWeek (deriveThisWeek) so both surfaces show
 * identical numbers and the logic is unit-tested in the node vitest env.
 */
import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { Check, Zap, Bed } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { deriveThisWeek } from './thisWeek'
import { glassCardStyle, GLASS_CARD_MARKER } from './glassCard'

const DASH = '—'

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[24px] p-5"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, ...glassCardStyle }}
      {...GLASS_CARD_MARKER}
    >
      {children}
    </div>
  )
}

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{title}</span>
        {sub && <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{sub}</span>}
      </div>
      {right}
    </div>
  )
}

export default function ThisWeekCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  // 14 days back fully covers the current ISO week at any weekday, so the
  // filtered week numbers match /load-form regardless of its wider window.
  const { data: actData } = useActivitiesRange(useMemo(() => subDays(today, 14), [today]), today)
  const { data: weekPlan } = useCurrentWeek()

  const w = useMemo(() => deriveThisWeek(actData?.activities ?? [], weekPlan, today), [actData, weekPlan, today])

  const complianceColor = w.complianceOnPace ? 'var(--color-recovery)' : 'var(--color-muted)'
  const weekdayLetters = de ? ['M', 'D', 'M', 'D', 'F', 'S', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  // A bare "0 von 5 Einheiten erledigt · 0 %" is the whole card on a Monday,
  // and it reads as a reprimand for a week that has barely started — worse, on
  // a Monday the plan scheduled as rest it reprimands the athlete for
  // complying. The subtitle now states the athlete's position against what was
  // actually asked of them so far, which on that Monday is "exactly on plan".
  const paceLine: string | null = (() => {
    if (w.plannedToDateTss == null) return null
    if (w.plannedToDateTss === 0) {
      return w.tss > 0
        ? (de ? `${w.tss} TSS im Plus — der Plan verlangte bisher nichts` : `${w.tss} TSS ahead — the plan asked for nothing yet`)
        : (de ? 'Genau im Plan — bis heute war nichts angesetzt' : 'Exactly on plan — nothing was scheduled yet')
    }
    if (w.complianceOnPace) {
      return de
        ? `Genau im Plan — ${w.tss} von ${w.plannedToDateTss} TSS bis heute`
        : `On plan — ${w.tss} of ${w.plannedToDateTss} TSS due so far`
    }
    const gap = w.plannedToDateTss - w.tss
    return de
      ? `Noch ${gap} TSS offen aus dem, was bis heute anstand`
      : `${gap} TSS still open from what was due by today`
  })()

  return (
    <Card>
      <CardHead
        title={de ? 'Diese Woche' : 'This Week'}
        sub={paceLine
          ?? (w.plannedSessions != null
            ? (de ? `${w.sessions} von ${w.plannedSessions} Einheiten erledigt` : `${w.sessions} of ${w.plannedSessions} sessions done`)
            : (de ? `${w.sessions} Einheiten erledigt` : `${w.sessions} sessions done`))}
        right={w.compliancePct != null ? (
          <div className="flex items-end gap-0.5">
            <span className="num-display" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color: complianceColor }}>{w.compliancePct}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: complianceColor, paddingBottom: 4 }}>%</span>
          </div>
        ) : undefined}
      />
      {w.compliancePct != null ? (
        <div style={{ height: 10, borderRadius: 5, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, w.compliancePct))}%`, height: '100%', borderRadius: 5, background: w.complianceOnPace ? 'var(--color-recovery)' : 'color-mix(in srgb, var(--color-muted) 55%, transparent)' }} />
        </div>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Noch keine Plandaten diese Woche' : 'No plan data yet this week'}</span>
      )}
      <div className="flex justify-between">
        {[
          { v: w.plannedWeekTss != null ? `${w.tss} / ${Math.round(w.plannedWeekTss)}` : `${w.tss}`, l: de ? 'TSS erledigt' : 'TSS done' },
          { v: w.plannedSessions != null ? `${w.sessions} / ${w.plannedSessions}` : `${w.sessions}`, l: de ? 'Einheiten' : 'Sessions' },
          { v: w.tssLeft != null ? `${w.tssLeft}` : DASH, l: de ? 'TSS übrig' : 'TSS left' },
        ].map((s) => (
          <div key={s.l} className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{s.v}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        {w.dayHas.map((has, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 30, height: 30,
                background: has ? 'var(--color-recovery)' : i === w.todayIdx ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
                border: i === w.todayIdx ? '2px solid var(--color-accent)' : '1px solid var(--color-rule)',
                color: has ? '#fff' : i === w.todayIdx ? 'var(--color-accent)' : 'var(--color-muted)',
              }}
            >
              {has ? <Check size={15} /> : i === w.todayIdx ? <Zap size={14} /> : <Bed size={13} />}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: i === w.todayIdx ? 'var(--color-accent)' : 'var(--color-muted)' }}>{weekdayLetters[i]}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
