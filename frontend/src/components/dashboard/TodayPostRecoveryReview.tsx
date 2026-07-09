import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useTodaySnapshot } from '../../hooks/useTodaySnapshot'
import { useT, useLocale } from '../../contexts/LocaleContext'

/**
 * TodayPostRecoveryReview — the rest-day twin of TodayPostRideReview.
 *
 * When yesterday was a planned recovery / rest day, the question that matters
 * is *did the recovery work* — did HRV climb, did sleep land, did body battery
 * rebuild? That story doesn't show up on the post-ride card (no ride to grade)
 * and gets buried in the brief evidence. This component surfaces a small
 * "recovery landed like X" card at the top of Today, mirroring the ride-recap
 * placement so the morning-after has a coherent shape regardless of what
 * yesterday was.
 *
 * Gates:
 *   - yesterday was prescribed rest/recovery (template id starts with "rest"
 *     or "recovery"), OR
 *   - yesterday_tss is tiny (< 25) and we have no ride review to show
 *
 * Renders nothing if yesterday was a real workout (PostRideReview owns that),
 * if yesterday was a missed quality day (MissedYesterdayChip owns that), or
 * if there's not enough data yet.
 */
export default function TodayPostRecoveryReview() {
  const { data: brief } = useCoachBrief()
  const { data: snapshot } = useTodaySnapshot()
  const t = useT()
  const { locale } = useLocale()
  if (!brief) return null

  // If a ride review exists, the ride card takes precedence — bail.
  if (brief.post_ride_review) return null

  const evidence = brief.evidence as Record<string, unknown>
  const wp = evidence.weekly_progress as Record<string, unknown> | undefined
  const yRec = evidence.yesterday_recommendation as Record<string, unknown> | undefined
  const bio = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = bio?.hrv as Record<string, unknown> | undefined
  const sleep = bio?.sleep as Record<string, unknown> | undefined
  const rhr = bio?.rhr as Record<string, unknown> | undefined

  const yesterdayTss = Number(wp?.yesterday_tss ?? 0)
  const yesterdayTemplate = (yRec?.template_id as string | undefined) ?? ''
  const yesterdayTitle = (yRec?.title as string | undefined) ?? null

  const wasPlannedRest =
    yesterdayTemplate.startsWith('rest') || yesterdayTemplate.startsWith('recovery')

  // Only fire on planned rest days — a quiet zero-TSS day with no prescription
  // is ambiguous (could be a miss). MissedYesterdayChip handles that case.
  if (!wasPlannedRest) return null
  // Belt and suspenders: if somehow there's significant TSS logged on a "rest"
  // day, the athlete trained — let PostRideReview handle it instead.
  if (yesterdayTss > 25) return null

  // Deltas we can show. Each is optional — render only the ones we have.
  const hrvDelta = hrv?.delta_pct as number | null | undefined
  const rhrDelta = rhr?.delta_pct as number | null | undefined
  const sleepLast = sleep?.last_night_score as number | null | undefined
  const avgDebt = sleep?.avg_nightly_debt_h as number | null | undefined
  const bbWake = snapshot?.body_battery?.wake ?? null

  // Quality of recovery — three-state heuristic that maps to the same tone
  // language as the rest of the app:
  //   good: HRV at/above baseline AND (sleep present and decent)
  //   bad:  HRV suppressed > 5% OR sleep last night < 50
  //   mixed: everything else
  let tone: 'good' | 'caution' | 'bad' = 'caution'
  if ((hrvDelta ?? 0) >= -1 && (sleepLast == null || sleepLast >= 65) && (avgDebt ?? 0) < 1.0) {
    tone = 'good'
  } else if ((hrvDelta ?? 0) <= -5 || (sleepLast != null && sleepLast < 50)) {
    tone = 'bad'
  }

  const toneColor: Record<typeof tone, string> = {
    good: 'var(--color-good)',
    caution: 'var(--color-caution)',
    bad: 'var(--color-bad)',
  }
  // Headline still uses a tri-state cue (the eye needs an at-a-glance label),
  // but the *substance* below is AI prose pulled from existing brief fields:
  //   - `why_tired.causes[]` — structured AI explanations of fatigue drivers
  //   - `regeneration.bullets[]` — AI-generated recovery actions
  //   - `brief.rationale` / `verdict` — the model's read on today
  // We DON'T templete a "Recovery — mixed" two-liner anymore.
  const headline: Record<typeof tone, string> =
    locale === 'de'
      ? {
          good: 'Erholung ist geglückt.',
          caution: 'Erholung — gemischt.',
          bad: 'Erholung blieb aus.',
        }
      : {
          good: 'Recovery landed.',
          caution: 'Recovery — mixed.',
          bad: 'Recovery fell short.',
        }

  // AI-driven body. Priority order:
  //   1. brief.rationale — the model's own paragraph for today, which already
  //      references yesterday's rest contextually.
  //   2. fallback: synthesized from why_tired causes + first regen bullet so
  //      we still ship a paragraph when the rationale string isn't present.
  const rationale = (brief.rationale || '').trim()
  const causes = (evidence.why_tired as { causes?: Array<{ label: string; evidence: string }> } | undefined)?.causes ?? []
  const regenBullets = (evidence.regeneration as { bullets?: string[] } | undefined)?.bullets ?? []
  const causesProse = causes
    .slice(0, 2)
    .map((c) => `${c.label} — ${c.evidence}`)
    .join(' ')
  const aiBody = rationale || [causesProse, regenBullets[0]].filter(Boolean).join(' ')

  // A second, optional AI line — the most-actionable regen tip if the
  // rationale didn't already cover next steps.
  const aiAction = !rationale && regenBullets[0]
    ? regenBullets[0]
    : regenBullets.find((b) => /sleep|fuel|protein|stretch|hydrat/i.test(b)) || null

  // Format helpers
  function signed(n: number, digits = 1): string {
    return (n >= 0 ? '+' : '') + n.toFixed(digits)
  }

  const color = toneColor[tone]
  return (
    <div
      className="rounded-[18px] p-5 sm:p-6 flex flex-col gap-3"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 7%, var(--color-paper-2))`,
        border: `1px solid color-mix(in srgb, ${color} 32%, var(--color-rule))`,
      }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="eyebrow num-mono"
          style={{ color, fontSize: 10, letterSpacing: '0.22em', fontWeight: 600 }}
        >
          {t('recovery_yesterday')}
        </span>
        {yesterdayTitle && (
          <span
            className="num-mono"
            style={{ color: 'var(--color-muted)', fontSize: 11 }}
          >
            · {yesterdayTitle}
          </span>
        )}
      </div>

      <h2
        className="leading-[1.1]"
        style={{
          fontFamily: 'var(--font-serif, serif)',
          fontStyle: 'italic',
          fontSize: 'clamp(22px, 3vw, 30px)',
          color: 'var(--color-ink)',
        }}
      >
        {headline[tone]}
      </h2>

      {/* Metric chips — only render the ones we have data for. */}
      <div className="flex items-center gap-2 flex-wrap mt-1">
        {typeof hrvDelta === 'number' && (
          <Chip label={locale === 'de' ? 'HRV vs 28T' : 'HRV vs 28d'} value={`${signed(hrvDelta)}%`} tone={hrvDelta < -3 ? 'caution' : hrvDelta < -8 ? 'bad' : 'good'} />
        )}
        {typeof rhrDelta === 'number' && (
          <Chip
            label={locale === 'de' ? 'RHR vs 28T' : 'RHR vs 28d'}
            value={`${signed(rhrDelta)}%`}
            tone={rhrDelta > 5 ? 'bad' : rhrDelta > 2 ? 'caution' : 'good'}
          />
        )}
        {typeof sleepLast === 'number' && (
          <Chip
            label={locale === 'de' ? 'Schlaf letzte Nacht' : 'Sleep last night'}
            value={String(Math.round(sleepLast))}
            tone={sleepLast >= 75 ? 'good' : sleepLast >= 55 ? 'caution' : 'bad'}
          />
        )}
        {typeof avgDebt === 'number' && avgDebt > 0.2 && (
          <Chip
            label={locale === 'de' ? 'Schlafdefizit' : 'Sleep debt'}
            value={`${avgDebt.toFixed(1)} h`}
            tone={avgDebt > 1.5 ? 'bad' : avgDebt > 0.6 ? 'caution' : 'good'}
          />
        )}
        {typeof bbWake === 'number' && (
          <Chip
            label={locale === 'de' ? 'Body Battery — Aufwachen' : 'Body battery — wake'}
            value={String(bbWake)}
            tone={bbWake >= 80 ? 'good' : bbWake >= 50 ? 'caution' : 'bad'}
          />
        )}
      </div>

      {aiBody && (
        <p
          className="text-[13px] sm:text-[14px] leading-relaxed mt-1"
          style={{ color: 'var(--color-ink-2)', maxWidth: '64ch' }}
        >
          {aiBody}
        </p>
      )}
      {aiAction && aiAction !== aiBody && (
        <p
          className="text-[12px] sm:text-[13px] leading-relaxed"
          style={{ color: 'var(--color-ink-2)', maxWidth: '64ch' }}
        >
          ▸ {aiAction}
        </p>
      )}
    </div>
  )
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'caution' | 'bad'
}) {
  const color =
    tone === 'good' ? 'var(--color-good)' : tone === 'caution' ? 'var(--color-caution)' : 'var(--color-bad)'
  return (
    <span
      className="num-mono text-[11px] px-2 py-1 rounded-md whitespace-nowrap inline-flex items-baseline gap-1.5"
      style={{
        color: 'var(--color-ink)',
        border: `1px solid color-mix(in srgb, ${color} 35%, var(--color-rule))`,
        backgroundColor: `color-mix(in srgb, ${color} 6%, transparent)`,
      }}
    >
      <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.18em' }}>
        {label.toUpperCase()}
      </span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </span>
  )
}
