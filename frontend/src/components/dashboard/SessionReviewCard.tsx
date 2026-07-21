/**
 * SessionReviewCard — post-ride review shown when the athlete has already
 * trained: recommendation (target) vs. what they actually did, plus grade,
 * multi-activity wrap-up, and coach feedback.
 *
 * Sport-honest (audit P0-2): the review payload carries ungraded entries when
 * the sport gate refused to compare (e.g. a strength session on a bike-plan
 * day). Those render as a neutral "logged" card — facts only, no grade pill,
 * no percent chips, no nudge — plus a cross-sport credit line when the week's
 * plan includes that sport family. Graded shortfalls keep their numbers but
 * in NEUTRAL tone: below-target deltas wear slate/muted, never red.
 */
import { useMemo } from 'react'
import { Activity, Target, TrendingUp, Trophy, ChevronRight, ListChecks, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { startOfWeek, addDays } from 'date-fns'
import type { PostRideReview, CompliancePair, RideGrade } from '../../api/coach'
import { usePlannedWorkouts } from '../../hooks/usePlannedWorkouts'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { localDayKey } from '../../utils/loadMetrics'
import { tFor, type Locale } from '../../i18n/strings'

// ── Sport families (mirror of backend services/sport.py semantics) ──────────
type SportFamily = 'cycling' | 'running' | 'strength' | 'other'

function familyOf(sport: string | null | undefined): SportFamily {
  const v = (sport ?? '').toLowerCase()
  if (/(cycl|bike|ride|mtb|gravel|virtual)/.test(v)) return 'cycling'
  if (/(run|lauf|treadmill|track)/.test(v)) return 'running'
  if (/(gym|strength|kraft|weight|lift|functional)/.test(v)) return 'strength'
  return 'other'
}

const FAMILY_LABEL: Record<SportFamily, { en: string; de: string; unitEn: string; unitDe: string }> = {
  cycling: { en: 'ride', de: 'Radfahren', unitEn: 'ride', unitDe: 'Rad' },
  running: { en: 'run', de: 'Laufen', unitEn: 'run', unitDe: 'Lauf' },
  strength: { en: 'strength', de: 'Krafttraining', unitEn: 'strength', unitDe: 'Kraft' },
  other: { en: 'session', de: 'Einheit', unitEn: 'session', unitDe: 'Einheit' },
}

// ── Session Review helpers ──────────────────────────────────────────────────
function gradeMeta(grade: RideGrade | null, de: boolean): { color: string; label: string } {
  switch (grade) {
    case 'perfect': return { color: 'var(--color-recovery)', label: de ? 'Perfekt' : 'Perfect' }
    case 'strong': return { color: 'var(--color-recovery)', label: de ? 'Stark' : 'Strong' }
    case 'okay': return { color: 'var(--color-amber)', label: de ? 'Solide' : 'Okay' }
    case 'overcooked': return { color: 'var(--color-amber)', label: de ? 'Überzogen' : 'Overcooked' }
    case 'undercooked': return { color: 'var(--color-amber)', label: de ? 'Zu locker' : 'Undercooked' }
    default: return { color: 'var(--color-muted)', label: '—' }
  }
}

// No-guilt palette (audit): below-target is EXPLAINED, never shamed — under
// wears slate/muted; over is amber (caution-with-action); match is forest.
const bandColor = (band: CompliancePair['band']) =>
  band === 'match' ? 'var(--color-recovery)' : band === 'over' ? 'var(--color-amber)' : 'var(--color-muted)'

// ── Alignment (adherence) ────────────────────────────────────────────────────
// Transparent, no hidden weighting: per-metric adherence = clamp(100 − |Δ%|, 0,
// 100), then averaged across the prescribed dimensions actually scored
// (duration, TSS, and IF when present). Each dimension counts equally.
// Direction is the overall band: all-match → on plan; else the sign of the mean
// Δ decides over (amber) vs. under (slate) — never red for under.
export type AlignDir = 'match' | 'over' | 'under'
export function computeAlignment(pairs: (CompliancePair | null | undefined)[]): { pct: number; dir: AlignDir } | null {
  const scored = pairs.filter(
    (p): p is CompliancePair => !!p && Number.isFinite(p.target) && p.target > 0 && Number.isFinite(p.actual),
  )
  if (scored.length === 0) return null
  const pct = Math.round(
    scored.reduce((s, p) => s + Math.max(0, Math.min(100, 100 - Math.abs(p.delta_pct))), 0) / scored.length,
  )
  const allMatch = scored.every((p) => p.band === 'match')
  const avgDelta = scored.reduce((s, p) => s + p.delta_pct, 0) / scored.length
  const dir: AlignDir = allMatch ? 'match' : avgDelta >= 0 ? 'over' : 'under'
  return { pct, dir }
}

export function alignLabel(dir: AlignDir, de: boolean): string {
  return dir === 'match'
    ? (de ? 'genau nach Plan' : 'right on plan')
    : dir === 'over'
      ? (de ? 'etwas drüber' : 'a touch over')
      : (de ? 'etwas darunter' : 'a touch under')
}

// Human one-liner for "how it changed" — spells out the deltas against the
// prescription across the SAME dimensions the alignment chip scores (duration,
// TSS, and intensity/IF when present), so the sentence and the chip never
// disagree. Comparatives ("20 Min länger … als empfohlen") are grouped;
// spot-on dimensions are named separately, so it reads like a sentence.
export function changeLine(review: PostRideReview, de: boolean): string {
  const d = review.duration
  const t = review.tss
  const ifp = review.intensity_factor
  const dMin = Math.round(d.actual - d.target)
  const tD = Math.round(t.actual - t.target)
  const dSpot = d.band === 'match' || dMin === 0
  const tSpot = t.band === 'match' || tD === 0
  const ifPresent = !!ifp && Number.isFinite(ifp.target) && ifp.target > 0
  const ifSpot = !ifPresent || ifp!.band === 'match'

  if (dSpot && tSpot && ifSpot) {
    return de
      ? 'Genau nach Plan — punktgenau getroffen.'
      : 'Right on plan — spot on all round.'
  }

  const comp: string[] = []
  if (!dSpot) {
    comp.push(
      dMin > 0
        ? (de ? `${dMin} Min länger` : `${dMin} min longer`)
        : (de ? `${-dMin} Min kürzer` : `${-dMin} min shorter`),
    )
  }
  if (!tSpot) {
    comp.push(
      tD > 0
        ? (de ? `${tD} TSS mehr` : `${tD} TSS more`)
        : (de ? `${-tD} TSS weniger` : `${-tD} TSS less`),
    )
  }
  if (!ifSpot) {
    comp.push(
      ifp!.band === 'over'
        ? (de ? 'die Intensität etwas höher' : 'intensity a touch higher')
        : (de ? 'die Intensität etwas niedriger' : 'intensity a touch lower'),
    )
  }
  const spot: string[] = []
  if (dSpot) spot.push(de ? 'Dauer' : 'duration')
  if (tSpot) spot.push('TSS')
  if (ifPresent && ifSpot) spot.push(de ? 'Intensität' : 'intensity')

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  let out = ''
  if (comp.length) {
    out = cap(comp.join(de ? ' und ' : ' and ')) + (de ? ' als empfohlen' : ' than prescribed')
  }
  if (spot.length) {
    const spotPhrase = de
      ? `${spot.join(' und ')} punktgenau`
      : `${spot.join(' and ')} spot on`
    out = out ? `${out}, ${spotPhrase}` : cap(spotPhrase)
  }
  return `${out}.`
}

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
        <span className="inline-flex items-center rounded-full" style={{ padding: '2px 8px', background: pair.band === 'under' ? 'var(--color-surface-2)' : `color-mix(in srgb, ${col} 15%, transparent)`, color: col, fontSize: 11, fontWeight: 700 }}>{sign}{Math.round(pair.delta_pct)}%</span>
      </div>
    </div>
  )
}

// The prescribed session, promoted to a legible block near the top. Shows the
// coach's target numbers (the `.target` side of each compliance pair). Renders
// in graded mode AND — as honest context, no verdict — in logged mode when a
// session was actually recommended that day (`logged` toggles the label only).
function RecommendedBlock({ review, de, logged }: { review: PostRideReview; de: boolean; logged: boolean }) {
  const tiles: { l: string; v: string }[] = []
  if (Number.isFinite(review.duration?.target) && review.duration.target > 0)
    tiles.push({ l: de ? 'DAUER' : 'DURATION', v: `${Math.round(review.duration.target)} min` })
  if (Number.isFinite(review.tss?.target) && review.tss.target > 0)
    tiles.push({ l: 'TSS', v: `${Math.round(review.tss.target)}` })
  if (review.intensity_factor && Number.isFinite(review.intensity_factor.target) && review.intensity_factor.target > 0)
    tiles.push({ l: de ? 'INTENSITÄT (IF)' : 'INTENSITY (IF)', v: review.intensity_factor.target.toFixed(2) })

  return (
    <div
      className="rounded-2xl p-3.5 flex flex-col gap-2.5"
      style={{ background: 'color-mix(in srgb, var(--color-recovery) 9%, var(--color-paper))', border: '1px solid color-mix(in srgb, var(--color-recovery) 30%, var(--color-rule))' }}
    >
      <div className="flex items-center gap-1.5">
        <Target size={13} strokeWidth={2.4} style={{ color: 'var(--color-recovery)' }} />
        <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-recovery)' }}>
          {logged ? (de ? 'Empfohlen war' : 'Recommended was') : (de ? 'Empfohlen' : 'Recommended')}
        </span>
      </div>
      {review.target_template_title && (
        <span className="num-display" style={{ fontSize: 15.5, color: 'var(--color-ink)', lineHeight: 1.25 }}>{review.target_template_title}</span>
      )}
      {tiles.length > 0 && (
        <div className="flex gap-5 flex-wrap">
          {tiles.map((s, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{s.l}</span>
              <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{s.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SessionReviewCard({ review, de }: { review: PostRideReview; de: boolean }) {
  const locale: Locale = de ? 'de' : 'en'
  const activities = review.activities ?? []
  // Sport-honest mode split: a review with no grade anywhere (top-level AND
  // per-activity) is a sport-gated "logged" day — facts only, no verdicts.
  const anyGrade = review.grade != null || activities.some((a) => a.compliance_grade != null)
  const loggedOnly = !anyGrade
  // Never render a grade (or target→actual pairs) when compliance inputs are
  // missing — a zeroed pair means the gate refused, not "0% delivered".
  const hasComplianceInputs =
    Number.isFinite(review.duration?.target) && Number.isFinite(review.tss?.target)
    && (review.duration.target > 0 || review.tss.target > 0)

  // A session was actually prescribed that day → we can surface "Empfohlen".
  // Same signal as compliance inputs plus a real template title to name it.
  const hadRecommended = hasComplianceInputs && !!review.target_template_title
  // Alignment read (adherence) — computed from the SAME target/actual pairs the
  // rows show, so the chip and the numbers can never disagree.
  const alignment = useMemo(
    () => (hasComplianceInputs ? computeAlignment([review.duration, review.tss, review.intensity_factor]) : null),
    [hasComplianceInputs, review.duration, review.tss, review.intensity_factor],
  )

  const gm = loggedOnly ? gradeMeta(null, de) : gradeMeta(review.grade, de)
  const multi = review.grade == null && activities.length >= 2
  const fmtMin = (v: number) => `${Math.round(v)} min`
  const fmtTss = (v: number) => `${Math.round(v)}`
  const fmtIf = (v: number) => v.toFixed(2)

  // ── Cross-sport credit (logged mode) — real week data, honest counts ──────
  const today = useMemo(() => new Date(), [])
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const { data: plannedWeek } = usePlannedWorkouts(weekStart, weekEnd)
  const { data: weekActs } = useActivitiesRange(weekStart, today)

  const primary = activities[0] ?? null
  const primaryFam = familyOf(primary?.sport)
  const famLabel = FAMILY_LABEL[primaryFam]
  const todayKey = localDayKey(today)
  // Avg HR — from today's real activity of the same family (only when the
  // match is unambiguous; otherwise show nothing rather than a guess).
  const todaysFamActs = (weekActs?.activities ?? []).filter(
    (a) => localDayKey(a.started_at ?? a.date ?? '') === todayKey && familyOf(a.sport) === primaryFam,
  )
  const avgHr = todaysFamActs.length === 1 ? todaysFamActs[0].average_hr : null
  // The ride to "view": once you've trained, the coach drops today's
  // prescription, so /workout/today no longer holds this session and would show
  // a rest/"no workout" state. Link straight to the ride you actually did.
  const todaysRide = (weekActs?.activities ?? []).find(
    (a) => familyOf(a.sport) === 'cycling' && localDayKey(a.started_at ?? a.date ?? '') === todayKey,
  ) ?? null
  const reviewDest = todaysRide ? `/activities/${todaysRide.id}/ride` : '/workout/today'
  // Count clause: planned sessions of this family this week vs. done so far.
  const plannedFamCount = (plannedWeek?.planned_workouts ?? []).filter(
    (p) => familyOf(p.sport) === primaryFam,
  ).length
  const doneFamCount = Math.max(
    1, // this logged session exists even if the range query is still stale
    (weekActs?.activities ?? []).filter(
      (a) => familyOf(a.sport) === primaryFam && (a.duration_seconds ?? 0) >= 10 * 60,
    ).length,
  )
  const creditLine: string | null = (() => {
    if (!loggedOnly || primary == null) return null
    const mins = primary.duration_minutes != null ? Math.round(primary.duration_minutes) : null
    const what = mins != null
      ? (de ? `${mins} Min ${famLabel.de}` : `${mins} min ${famLabel.en}`)
      : (de ? famLabel.de : famLabel.en)
    if (plannedFamCount > 0) {
      const done = Math.min(doneFamCount, plannedFamCount)
      return de
        ? `Heute: ${what} — ${done} von ${plannedFamCount} ${famLabel.unitDe}-Einheiten geschafft.`
        : `Today: ${what} — ${done} of ${plannedFamCount} ${famLabel.unitEn} sessions done.`
    }
    // No planned sessions of this family this week → omit the count clause.
    return de ? `Heute: ${what} erfasst.` : `Today: ${what} logged.`
  })()

  const insights: { icon: typeof Activity; color: string; label: string; text: string }[] = []
  if (!loggedOnly) {
    if (review.physiological_read) insights.push({ icon: Activity, color: 'var(--color-recovery)', label: de ? 'Körper' : 'Body', text: review.physiological_read })
    if (review.goal_trajectory) insights.push({ icon: Target, color: 'var(--color-strain)', label: de ? 'Zielverlauf' : 'Goal', text: review.goal_trajectory })
    if (review.next_session_nudge) insights.push({ icon: TrendingUp, color: 'var(--color-accent)', label: de ? 'Nächste Einheit' : 'Next up', text: review.next_session_nudge })
  }

  const totals = multi ? review.totals : undefined
  const HeaderIcon = loggedOnly ? ClipboardList : Trophy

  return (
    <div
      className="rounded-[24px] p-5 flex flex-col gap-[18px]"
      style={{ background: `linear-gradient(125deg, color-mix(in srgb, ${gm.color} 14%, var(--color-paper-2)) 0%, var(--color-paper-2) 72%)`, border: `1px solid color-mix(in srgb, ${gm.color} 55%, var(--color-rule))` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <HeaderIcon size={16} strokeWidth={2.4} style={{ color: loggedOnly ? 'var(--color-ink-2)' : gm.color }} />
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: loggedOnly ? 'var(--color-ink-2)' : gm.color }}>
            {loggedOnly ? tFor(locale, 'review_logged_eyebrow') : (de ? 'Einheit im Rückblick' : 'Session Review')}
          </span>
        </div>
        {review.grade && hasComplianceInputs && (
          <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '4px 12px', background: `color-mix(in srgb, ${gm.color} 18%, transparent)` }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: gm.color }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: gm.color }}>{gm.label}</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)', lineHeight: 1.2 }}>{review.headline}</h2>
      </div>

      {/* Recommended session — promoted from a caption to a legible block. In
          logged mode it stays honest context ("Empfohlen war …"), no verdict. */}
      {hadRecommended && <RecommendedBlock review={review} de={de} logged={loggedOnly} />}

      {/* ── Logged mode: facts only — sport, duration, avg HR (when known) ── */}
      {loggedOnly && primary && (
        <div className="rounded-2xl p-3.5 flex flex-col gap-3" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
          <div className="flex gap-5 flex-wrap">
            {([
              { l: tFor(locale, 'review_sport_label').toUpperCase(), v: de ? famLabel.de : famLabel.en.charAt(0).toUpperCase() + famLabel.en.slice(1) },
              { l: de ? 'DAUER' : 'DURATION', v: primary.duration_minutes != null ? `${Math.round(primary.duration_minutes)} min` : '—' },
              { l: tFor(locale, 'review_avg_hr_label').toUpperCase(), v: avgHr != null ? `${Math.round(avgHr)} bpm` : '—' },
              ...(primary.tss != null && primary.tss > 0 ? [{ l: 'TSS', v: `${Math.round(primary.tss)}` }] : []),
            ]).map((s, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{s.l}</span>
                <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{s.v}</span>
              </div>
            ))}
          </div>
          {/* Additional logged sessions (rare all-ungraded multi day) — neutral rows */}
          {activities.length >= 2 && activities.slice(1).map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-xl" style={{ padding: '8px 12px', background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
              <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{a.title || (de ? FAMILY_LABEL[familyOf(a.sport)].de : FAMILY_LABEL[familyOf(a.sport)].en)}</span>
              <span className="num-mono shrink-0" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {a.duration_minutes != null ? `${Math.round(a.duration_minutes)} min` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Cross-sport credit + honest "not graded" framing — never a verdict */}
      {loggedOnly && (
        <div className="flex flex-col gap-1">
          {creditLine && <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.4 }}>{creditLine}</p>}
          <p style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
            {review.physiological_read || tFor(locale, 'review_not_graded')}
          </p>
        </div>
      )}

      {/* Recommendation vs. actual — only when compliance was actually scored */}
      {!loggedOnly && hasComplianceInputs && (
        <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>{de ? 'Vorgabe → Ist' : 'Target → actual'}</span>
            {alignment && (
              <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '3px 9px', background: `color-mix(in srgb, ${bandColor(alignment.dir)} 15%, transparent)` }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: bandColor(alignment.dir) }} />
                <span className="num-mono" style={{ fontSize: 11, fontWeight: 700, color: bandColor(alignment.dir) }}>{alignment.pct}%</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: bandColor(alignment.dir) }}>{alignLabel(alignment.dir, de)}</span>
              </span>
            )}
          </div>
          <CompRow label={de ? 'Dauer' : 'Duration'} pair={review.duration} fmt={fmtMin} />
          <CompRow label="TSS" pair={review.tss} fmt={fmtTss} />
          {review.intensity_factor && <CompRow label={de ? 'Intensität (IF)' : 'Intensity (IF)'} pair={review.intensity_factor} fmt={fmtIf} />}
          {/* How it changed — human one-liner, not just numbers. */}
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)', lineHeight: 1.4, marginTop: 2, paddingTop: 10, borderTop: '1px solid var(--color-rule)' }}>
            {changeLine(review, de)}
          </p>
        </div>
      )}

      {/* Multi-activity wrap-up — totals + per-ride compliance chips.
          Ungraded rows (sport gate) show facts only, never a chip. */}
      {!loggedOnly && multi && (
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
          {activities.map((a, i) => {
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

      {/* View the ride you did (once trained the prescription is gone), else
          fall back to the planned workout detail. */}
      {!loggedOnly && (
        <Link to={reviewDest} className="inline-flex items-center justify-center gap-2 rounded-full" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', padding: '11px 16px', fontSize: 13.5, fontWeight: 700 }}>
          <ListChecks size={16} style={{ color: gm.color }} />
          {todaysRide ? (de ? 'Fahrt ansehen' : 'View your ride') : (de ? 'Workout-Details ansehen' : 'View workout details')}
          <ChevronRight size={15} style={{ color: 'var(--color-muted)' }} />
        </Link>
      )}
    </div>
  )
}
