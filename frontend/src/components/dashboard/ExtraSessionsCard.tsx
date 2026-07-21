/**
 * ExtraSessionsCard — "Zusätzliche Einheiten" / "Extra sessions".
 *
 * The app plans ONE bike session a day, but athletes also do OTHER sessions —
 * a second ride the same day, a gym session, a run, padel/tennis, etc. This
 * card surfaces those non-primary sessions over a rolling 7-day window and
 * ACCOUNTS FOR THEIR LOAD: how much TSS they add and what share of the window's
 * total training load that is, so the full training picture — not just the
 * planned bike ride — is visible. HR-bearing sessions now carry an honest
 * hrTSS; genuinely uncomputable load renders duration-only, never a fake number.
 *
 * Mounts on the Today tab right below <ThisWeekCard /> (which sums ALL sports'
 * TSS into the weekly total) — this card breaks out the non-bike contribution
 * of that same load. Pure math lives in ./extraSessions (unit-tested in node).
 * German-first, tuned for 390px. V3 tokens, honest "—" everywhere.
 */
import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { Bike, Dumbbell, Footprints, Activity, Sparkles, Layers, type LucideIcon } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { formatDate } from '../../utils/format'
import { deriveExtraSessions, type ExtraKind } from './extraSessions'

const DASH = '—'
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

const KIND_ICON: Record<ExtraKind, LucideIcon> = {
  ride: Bike,
  gym: Dumbbell,
  run: Footprints,
  other: Activity,
}
const KIND_COLOR: Record<ExtraKind, string> = {
  ride: 'var(--color-accent)',
  gym: 'var(--color-strain)',
  run: 'var(--color-move)',
  other: 'var(--color-stand)',
}

function kindLabel(kind: ExtraKind, de: boolean): string {
  switch (kind) {
    case 'ride': return de ? '2. Ausfahrt' : '2nd ride'
    case 'gym': return de ? 'Kraft' : 'Strength'
    case 'run': return de ? 'Lauf' : 'Run'
    default: return de ? 'Sonstiges' : 'Other'
  }
}

// h:mm or Nmin from seconds — compact ("1:05 h" for ≥60min, "44 min" else).
function fmtDuration(sec: number | null, de: boolean): string {
  if (sec == null || sec <= 0) return DASH
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')} h`
}

export default function ExtraSessionsCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  // 7-day rolling window, matching Recovery's cross-training lens.
  const { data: actData } = useActivitiesRange(useMemo(() => subDays(today, 7), [today]), today)

  const m = useMemo(() => deriveExtraSessions(actData?.activities ?? [], today, 7), [actData, today])

  // One explainable analysis line — added load, its share, and what it means
  // for the training picture (total load + recovery cost). Never bare numbers.
  const analysis = (() => {
    if (m.count === 0) return null
    const loadClause = m.withLoad > 0
      ? (de
          ? `${m.count} Zusatz${m.count === 1 ? 'einheit' : 'einheiten'} bringen +${m.extraTss} TSS${m.sharePct != null ? ` — ${m.sharePct}% deiner Gesamtlast der letzten 7 Tage` : ''}.`
          : `${m.count} extra session${m.count === 1 ? '' : 's'} add +${m.extraTss} TSS${m.sharePct != null ? ` — ${m.sharePct}% of your total load over the last 7 days` : ''}.`)
      : (de
          ? `${m.count} Zusatz${m.count === 1 ? 'einheit' : 'einheiten'} ohne berechenbare Last (nur Dauer).`
          : `${m.count} extra session${m.count === 1 ? '' : 's'} with no computable load (duration only).`)
    const meaning = de
      ? ' Cross-Training zählt zur Gesamtbelastung und zu den Erholungskosten — auch wenn es nicht im Radplan steht.'
      : ' Cross-training counts toward total load and recovery cost — even though it isn’t in the bike plan.'
    const caveat = m.withLoad > 0 && m.withoutLoad > 0
      ? (de ? ` ${m.withoutLoad} weitere nur mit Dauer erfasst.` : ` ${m.withoutLoad} more tracked by duration only.`)
      : ''
    return loadClause + meaning + caveat
  })()

  return (
    <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 16 }}>
      {/* Head */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center rounded-[9px]" style={{ width: 30, height: 30, background: 'var(--color-surface-2)', flexShrink: 0 }}>
            <Layers size={16} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Zusätzliche Einheiten' : 'Extra sessions'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Letzte 7 Tage · neben dem Radplan' : 'Last 7 days · beyond the bike plan'}</span>
          </div>
        </div>
        {m.count > 0 && (
          <div className="flex items-end gap-0.5 shrink-0">
            <span className="num-display" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color: 'var(--color-accent)' }}>{m.count}</span>
          </div>
        )}
      </div>

      {m.count === 0 ? (
        <div className="grid place-items-center rounded-[14px]" style={{ minHeight: 72, background: 'var(--color-surface-2)', padding: '14px 16px' }}>
          <span style={{ fontSize: 12.5, color: 'var(--color-muted)', textAlign: 'center', lineHeight: 1.4 }}>
            {de
              ? 'Keine zusätzlichen Einheiten in den letzten 7 Tagen — nur deine geplanten Radeinheiten.'
              : 'No extra sessions in the last 7 days — just your planned bike rides.'}
          </span>
        </div>
      ) : (
        <>
          {/* Summary stat row — added load, share of window total, session count. */}
          <div className="flex justify-between">
            {[
              { v: m.withLoad > 0 ? `+${m.extraTss}` : DASH, l: de ? 'TSS zusätzlich' : 'Added TSS', c: 'var(--color-strain)' },
              { v: m.sharePct != null && m.withLoad > 0 ? `${m.sharePct}%` : DASH, l: de ? 'der Wochenlast' : 'of week load', c: 'var(--color-ink)' },
              { v: `${m.count}`, l: de ? 'Einheiten' : 'Sessions', c: 'var(--color-ink)' },
            ].map((s) => (
              <div key={s.l} className="flex flex-col gap-0.5">
                <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: s.v === DASH ? 'var(--color-ink-2)' : s.c }}>{s.v}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
              </div>
            ))}
          </div>

          {/* Session list — one row per additional session, honest load. */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            {m.sessions.map((s, i) => {
              const Icon = KIND_ICON[s.kind]
              const color = KIND_COLOR[s.kind]
              const dayLabel = s.startedAt ? formatDate(new Date(s.startedAt), de ? 'EE, d. MMM' : 'EE, MMM d', locale) : DASH
              const showTitle = s.title && s.title.toLowerCase() !== kindLabel(s.kind, de).toLowerCase()
              return (
                <div key={`${s.dayKey}-${i}`} className="flex items-center rounded-[14px]" style={{ gap: 11, padding: '10px 12px', background: 'var(--color-surface-2)' }}>
                  <span className="grid place-items-center rounded-[9px] shrink-0" style={{ width: 32, height: 32, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
                    <Icon size={16} strokeWidth={2.2} style={{ color }} />
                  </span>
                  <div className="flex flex-col min-w-0 flex-1" style={{ gap: 1 }}>
                    <span className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)' }}>
                      {kindLabel(s.kind, de)}{showTitle ? <span style={{ fontWeight: 500, color: 'var(--color-ink-2)' }}> · {s.title}</span> : null}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                      {dayLabel} · {fmtDuration(s.durationSec, de)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end shrink-0" style={{ gap: 1 }}>
                    {s.tss != null ? (
                      <>
                        <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{Math.round(s.tss)}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>TSS</span>
                      </>
                    ) : (
                      <>
                        <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink-2)' }}>{DASH}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'nur Dauer' : 'duration'}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* One explainable analysis line — load, share, meaning. */}
          {analysis && (
            <div className="flex items-start gap-2" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 12 }}>
              <Sparkles size={14} strokeWidth={2.2} style={{ color: 'var(--color-accent)', marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{analysis}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
