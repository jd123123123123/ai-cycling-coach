/**
 * SessionReviewCard — post-ride review shown when the athlete has already
 * trained: recommendation (target) vs. what they actually did, plus grade,
 * multi-activity wrap-up, and coach feedback. Extracted from TodayTab so the
 * same card can render on the Train (Plan) tab for a day the athlete trained.
 * Behaviour + markup are identical to the original inline TodayTab version.
 */
import { Activity, Target, TrendingUp, Trophy, ChevronRight, ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PostRideReview, CompliancePair, RideGrade } from '../../api/coach'

// ── Session Review helpers ──────────────────────────────────────────────────
function gradeMeta(grade: RideGrade | null, de: boolean): { color: string; label: string } {
  switch (grade) {
    case 'perfect': return { color: 'var(--color-recovery)', label: de ? 'Perfekt' : 'Perfect' }
    case 'strong': return { color: 'var(--color-recovery)', label: de ? 'Stark' : 'Strong' }
    case 'okay': return { color: 'var(--color-amber)', label: de ? 'Solide' : 'Okay' }
    case 'overcooked': return { color: 'var(--color-move)', label: de ? 'Überzogen' : 'Overcooked' }
    case 'undercooked': return { color: 'var(--color-amber)', label: de ? 'Zu locker' : 'Undercooked' }
    default: return { color: 'var(--color-muted)', label: '—' }
  }
}
const bandColor = (band: CompliancePair['band']) =>
  band === 'match' ? 'var(--color-recovery)' : band === 'over' ? 'var(--color-move)' : 'var(--color-amber)'

function CompRow({ label, pair, fmt }: { label: string; pair: CompliancePair; fmt: (v: number) => string }) {
  const col = bandColor(pair.band)
  const sign = pair.delta_pct >= 0 ? '+' : ''
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="num-mono" style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>{fmt(pair.target)}</span>
        <ChevronRight size={13} style={{ color: 'var(--color-muted)' }} />
        <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{fmt(pair.actual)}</span>
        <span className="inline-flex items-center rounded-full" style={{ padding: '2px 8px', background: `color-mix(in srgb, ${col} 15%, transparent)`, color: col, fontSize: 11, fontWeight: 700 }}>{sign}{Math.round(pair.delta_pct)}%</span>
      </div>
    </div>
  )
}

export default function SessionReviewCard({ review, de }: { review: PostRideReview; de: boolean }) {
  const gm = gradeMeta(review.grade, de)
  const multi = review.grade == null && (review.activities?.length ?? 0) >= 2
  const fmtMin = (v: number) => `${Math.round(v)} min`
  const fmtTss = (v: number) => `${Math.round(v)}`
  const fmtIf = (v: number) => v.toFixed(2)

  const insights: { icon: typeof Activity; color: string; label: string; text: string }[] = []
  if (review.physiological_read) insights.push({ icon: Activity, color: 'var(--color-recovery)', label: de ? 'Körper' : 'Body', text: review.physiological_read })
  if (review.goal_trajectory) insights.push({ icon: Target, color: 'var(--color-strain)', label: de ? 'Zielverlauf' : 'Goal', text: review.goal_trajectory })
  if (review.next_session_nudge) insights.push({ icon: TrendingUp, color: 'var(--color-accent)', label: de ? 'Nächste Einheit' : 'Next up', text: review.next_session_nudge })

  const totals = multi ? review.totals : undefined

  return (
    <div
      className="rounded-[24px] p-5 flex flex-col gap-[18px]"
      style={{ background: `linear-gradient(125deg, color-mix(in srgb, ${gm.color} 14%, var(--color-paper-2)) 0%, var(--color-paper-2) 72%)`, border: `1px solid color-mix(in srgb, ${gm.color} 55%, var(--color-rule))` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Trophy size={16} strokeWidth={2.4} style={{ color: gm.color }} />
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: gm.color }}>{de ? 'Einheit im Rückblick' : 'Session Review'}</span>
        </div>
        {review.grade && (
          <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '4px 12px', background: `color-mix(in srgb, ${gm.color} 18%, transparent)` }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: gm.color }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: gm.color }}>{gm.label}</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)', lineHeight: 1.2 }}>{review.headline}</h2>
        {review.target_template_title && (
          <p style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{de ? 'Vorgabe' : 'Prescribed'}: {review.target_template_title}</p>
        )}
      </div>

      {/* Recommendation vs. actual */}
      <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
        <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>{de ? 'Vorgabe → Ist' : 'Target → actual'}</span>
        <CompRow label={de ? 'Dauer' : 'Duration'} pair={review.duration} fmt={fmtMin} />
        <CompRow label="TSS" pair={review.tss} fmt={fmtTss} />
        {review.intensity_factor && <CompRow label={de ? 'Intensität (IF)' : 'Intensity (IF)'} pair={review.intensity_factor} fmt={fmtIf} />}
      </div>

      {/* Multi-activity wrap-up — totals + per-ride compliance chips */}
      {multi && (
        <div className="flex flex-col gap-2.5">
          {totals && (
            <div className="flex gap-5">
              {([
                { l: de ? 'EINHEITEN' : 'SESSIONS', v: `${totals.count}` },
                { l: 'TSS', v: `${Math.round(totals.tss)}` },
                { l: de ? 'DAUER' : 'DURATION', v: `${Math.round(totals.duration_minutes)} min` },
                { l: de ? 'DISTANZ' : 'DISTANCE', v: totals.distance_km ? `${totals.distance_km.toFixed(1)} km` : '—' },
              ]).map((s, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{s.l}</span>
                  <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{s.v}</span>
                </div>
              ))}
            </div>
          )}
          {(review.activities ?? []).map((a, i) => {
            const am = gradeMeta(a.compliance_grade ?? null, de)
            return (
              <div key={i} className="flex items-center justify-between gap-2 rounded-xl" style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
                <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{a.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {a.tss != null && <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>{Math.round(a.tss)} TSS</span>}
                  {a.compliance_grade && (
                    <span className="rounded-full" style={{ padding: '2px 8px', background: `color-mix(in srgb, ${am.color} 15%, transparent)`, color: am.color, fontSize: 11, fontWeight: 700 }}>{am.label}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Coach feedback */}
      {insights.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {insights.map((it, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="shrink-0 grid place-items-center rounded-full mt-0.5" style={{ width: 22, height: 22, background: `color-mix(in srgb, ${it.color} 15%, transparent)` }}>
                <it.icon size={13} style={{ color: it.color }} />
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>{it.label}</span>
                <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{it.text}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Open today's full workout detail (blocks, targets, structure). */}
      <Link to="/workout/today" className="inline-flex items-center justify-center gap-2 rounded-full" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', padding: '11px 16px', fontSize: 13.5, fontWeight: 700 }}>
        <ListChecks size={16} style={{ color: gm.color }} />
        {de ? 'Workout-Details ansehen' : 'View workout details'}
        <ChevronRight size={15} style={{ color: 'var(--color-muted)' }} />
      </Link>
    </div>
  )
}
