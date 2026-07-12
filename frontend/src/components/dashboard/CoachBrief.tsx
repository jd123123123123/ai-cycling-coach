import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { formatDistanceToNow } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { Sparkles, ChevronRight, RefreshCw } from 'lucide-react'
import { useCoachBrief, useRefreshBrief } from '../../hooks/useCoachBrief'
import type { CoachBriefResponse, TomorrowPlan, IntensityChip } from '../../api/coach'
import ContributorsSheet from './ContributorsSheet'
import PrescribedWorkoutCard from './PrescribedWorkoutCard'
import TomorrowCard from './TomorrowCard'
import RegenerationCard from './RegenerationCard'
import DashboardSection from './DashboardSection'
import { useLanguage } from '../../contexts/LanguageContext'
import { useT, useLocale } from '../../contexts/LocaleContext'
import { translateCoach } from '../../utils/coachLanguage'

function isRuleBased(model: string): boolean {
  return model === 'rule-based-fallback'
}

// The LLM sometimes omits `tomorrow_plan`, and with refresh-on-demand caching a
// brief that lacks it would hide "Tomorrow" indefinitely. Rebuild it from the
// always-present rule-based projection (localized `outlook_7d` for tomorrow +
// the planned workout's category) so tomorrow's training never disappears.
function deriveTomorrow(brief: CoachBriefResponse): TomorrowPlan | null {
  const outlook = brief.outlook_7d?.find((o) => o.day_offset === 1) ?? null
  const planned = (brief.evidence as Record<string, unknown> | undefined)?.tomorrow_planned_workout as
    | { category?: string; predicted_tss?: number; purpose?: string }
    | undefined
  if (!outlook && !planned) return null
  const catMap: Record<string, IntensityChip> = {
    recovery: 'recovery', rest: 'recovery', endurance: 'endurance',
    tempo: 'tempo', threshold: 'threshold', sweet_spot: 'threshold',
    vo2: 'vo2', vo2max: 'vo2', anaerobic: 'vo2', neuromuscular: 'vo2', race: 'race',
  }
  const chip = catMap[(planned?.category ?? '').toLowerCase()] ?? 'endurance'
  return {
    description: outlook?.note || planned?.purpose || '',
    predicted_tss: outlook?.suggested_tss ?? planned?.predicted_tss ?? 0,
    intensity_chip: chip,
  }
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function BriefSkeleton() {
  return (
    <div
      className="paper-grain rounded-[18px] p-6 sm:p-8"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div
        className="h-4 w-32 rounded animate-pulse"
        style={{ backgroundColor: 'var(--color-rule)' }}
      />
      <div
        className="h-10 w-3/4 mt-4 rounded animate-pulse"
        style={{ backgroundColor: 'var(--color-rule)' }}
      />
      <div
        className="h-20 w-full mt-4 rounded animate-pulse"
        style={{ backgroundColor: 'var(--color-rule)' }}
      />
      <div
        className="h-40 w-full mt-5 rounded-[12px] animate-pulse"
        style={{ backgroundColor: 'var(--color-rule)' }}
      />
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CoachBrief() {
  const { data, isLoading, isError, refetch } = useCoachBrief()
  const refresh = useRefreshBrief()
  const { locale } = useLocale()

  const [whyOpen, setWhyOpen] = useState(false)
  const [transparencyOpen, setTransparencyOpen] = useState(false)

  if (isLoading) return <BriefSkeleton />

  if (isError || !data) {
    return (
      <div
        className="paper-grain rounded-[18px] p-6 sm:p-8 flex items-center justify-between gap-3 flex-wrap"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <span className="eyebrow" style={{ color: 'var(--color-alert)' }}>
          {locale === 'de' ? 'Konnte den heutigen Brief nicht laden' : "Couldn't load today's brief"}
        </span>
        <button
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
          style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
        >
          {locale === 'de' ? 'Erneut versuchen' : 'Retry'}
        </button>
      </div>
    )
  }

  return (
    <>
      <BriefBody
        brief={data}
        isRefreshing={refresh.isPending}
        onRefresh={() => refresh.mutate()}
        onOpenWhy={() => setWhyOpen(true)}
        onOpenTransparency={() => setTransparencyOpen(true)}
      />
      <ContributorsSheet open={whyOpen} onClose={() => setWhyOpen(false)} initialSection="rationale" />
      <ContributorsSheet open={transparencyOpen} onClose={() => setTransparencyOpen(false)} initialSection="tools" />
    </>
  )
}

// ─── Body — the fold-1 hero ──────────────────────────────────────────────────

function BriefBody({
  brief,
  isRefreshing,
  onRefresh,
  onOpenWhy,
  onOpenTransparency,
}: {
  brief: CoachBriefResponse
  isRefreshing: boolean
  onRefresh: () => void
  onOpenWhy: () => void
  onOpenTransparency: () => void
}) {
  const ruleBased = isRuleBased(brief.model_used)
  const { language } = useLanguage()
  const t = useT()
  const { locale } = useLocale()
  const simpleMode = language === 'simple'

  const generatedAgo = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(brief.generated_at), { addSuffix: true, locale: locale === 'de' ? deLocale : undefined })
    } catch {
      return ''
    }
  }, [brief.generated_at, locale])

  // Guard: if prescribed_workout is missing (legacy row), render a degraded
  // message. New briefs always have it.
  const workout = brief.prescribed_workout
  const alternates = brief.alternates ?? []
  // Phase 5.3 — if the athlete trained today, the backend attaches a full
  // post_ride_review. Presence of the review hides the PrescribedWorkoutCard
  // and renders the review in its place — the prescribed_workout is rest_day
  // anyway in that state, so showing it would be redundant + confusing.
  const postRideReview = brief.post_ride_review ?? null

  return (
    <motion.div
      className="flex flex-col gap-4 min-w-0"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Eyebrow row — coach badge + meta */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} strokeWidth={1.8} style={{ color: 'var(--color-muted)' }} />
          <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
            {t('coach_brief_today')}
          </span>
          {generatedAgo && (
            <span className="eyebrow num-mono opacity-60">{generatedAgo}</span>
          )}
          {brief.from_cache && (
            <span
              className="eyebrow num-mono px-1.5 py-0.5 rounded-sm"
              style={{
                color: 'var(--color-muted)',
                backgroundColor: 'rgba(20,24,17,0.04)',
                border: '1px solid var(--color-rule)',
              }}
              title={locale === 'de' ? 'Aus dem 6h-Read-through-Cache geladen' : 'Served from the 6h read-through cache'}
            >
              {t('cached_chip')}
            </span>
          )}
          {ruleBased && (
            // caution-state amber — meaning-bearing, do not remove
            // "AI offline" is a degraded-fallback indicator, not decorative flair.
            <span
              className="eyebrow num-mono px-1.5 py-0.5 rounded-sm"
              style={{
                color: 'var(--color-amber)',
                backgroundColor: 'rgba(176, 74, 12, 0.08)',
                border: '1px solid rgba(176, 74, 12, 0.25)',
              }}
              title="Set ANTHROPIC_API_KEY in backend/.env to enable Claude coaching"
            >
              {t('ai_offline_chip')}
            </span>
          )}
        </div>
      </div>

      {/* Verdict moved to TodayHero (Phase 2 rebuild). CoachBrief now opens
         with the rationale + the workout card; the headline lives on the
         hero card above so the page has exactly one "today's call" surface. */}

      {/* Rationale — capped at 2 lines visually via max-width + line-clamp */}
      <p
        className="text-[14px] sm:text-[15px] leading-relaxed dashboard-break-words"
        style={{
          color: 'var(--color-ink-2)',
          maxWidth: '62ch',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {brief.rationale}
      </p>

      {/* Evidence chips removed — TSB/CTL/HRV/Sleep are already surfaced as the
         "why" chips on TodayHero above (the verdict card owns the recovery
         evidence). The rationale prose carries the same signals in words, so a
         second chip row here was pure duplication. */}

      {/* Fold-1 hero — the prescribed workout for today. The post-ride review
         card is owned by TodayPostRideReview at the top of the tab, so we do
         NOT render it again here (it used to show twice when the athlete had
         already trained today). When a review is showing above and there's no
         workout to prescribe, render nothing rather than the legacy fallback. */}
      {workout ? (
        <PrescribedWorkoutCard workout={workout} alternates={alternates} />
      ) : postRideReview ? null : (
        <div
          className="rounded-[12px] p-4"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: '1px dashed var(--color-rule)',
          }}
        >
          <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
            No prescribed workout — legacy brief shape
          </span>
        </div>
      )}

      {/* Tomorrow + recovery — both are forward-looking secondary content.
         Wrap them in a collapsed disclosure so the brief stops at the
         workout card by default. Tapping the section expands both
         (TomorrowCard / RegenerationCard each render nothing on missing
         data, so the section is auto-empty for legacy brief shapes). */}
      {(() => {
        // Prefer the LLM plan; fall back to the rule-based projection so
        // tomorrow's training is always shown.
        const tomorrowData = brief.tomorrow_plan ?? deriveTomorrow(brief)
        const hasRegen = (brief.regeneration?.bullets ?? []).length > 0
        if (!tomorrowData && !hasRegen) return null
        return (
          <DashboardSection
            id="brief-tomorrow-recovery"
            title={t('tomorrow_recovery_section')}
            defaultExpanded={false}
          >
            <div className="flex flex-col gap-4">
              <TomorrowCard data={tomorrowData} />
              <RegenerationCard bullets={brief.regeneration?.bullets ?? null} />
            </div>
          </DashboardSection>
        )
      })()}

      {/* Outlook removed per product decision — CoachBrief focuses on TODAY only. */}

      {/* Footer — one tight row. Frameworks now collapse into a single
         "Sources" link instead of a comma-laden inline list (the names were
         eating visual budget without informing the day's decision). Why /
         AI-saw / Refresh stay; the click targets open the same sheets. */}
      <div
        className="flex items-center justify-end gap-3 flex-wrap pt-2"
        style={{ borderTop: '1px solid var(--color-rule)' }}
      >
        {brief.frameworks_cited.length > 0 && (
          <button
            type="button"
            onClick={onOpenTransparency}
            className="inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: 'var(--color-muted)' }}
            title={
              simpleMode
                ? translateCoach('brief.frameworksHeading', 'simple', locale)
                : `${translateCoach('brief.frameworksHeading', 'technical', locale)}: ${brief.frameworks_cited.join(' · ')}`
            }
          >
            <ChevronRight size={11} strokeWidth={2} />
            <span className="underline underline-offset-2 decoration-[var(--color-rule)]">
              {brief.frameworks_cited.length} {t('sources_link')}
            </span>
          </button>
        )}
        <button
          onClick={onOpenWhy}
          className="inline-flex items-center gap-1 text-[11px] font-medium"
          style={{ color: 'var(--color-ink-2)' }}
        >
          <ChevronRight size={11} strokeWidth={2} />
          <span className="underline underline-offset-2 decoration-[var(--color-rule)]">
            {t('why_this')}
          </span>
        </button>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1 text-[11px] font-medium disabled:opacity-50"
          style={{ color: 'var(--color-muted)' }}
          aria-label={locale === 'de' ? 'Neu erzeugen' : 'Regenerate brief'}
          title={locale === 'de' ? 'Neue Generierung erzwingen' : 'Force a fresh generation'}
        >
          <RefreshCw size={11} strokeWidth={1.8} className={isRefreshing ? 'animate-spin' : ''} />
          <span className="underline underline-offset-2 decoration-[var(--color-rule)]">
            {t('refresh')}
          </span>
        </button>
      </div>
    </motion.div>
  )
}
