import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { formatDistanceToNow } from 'date-fns'
import { Sparkles, ChevronRight, RefreshCw } from 'lucide-react'
import { useCoachBrief, useRefreshBrief } from '../../hooks/useCoachBrief'
import type { CoachBriefResponse } from '../../api/coach'
import ContributorsSheet from './ContributorsSheet'
import PrescribedWorkoutCard from './PrescribedWorkoutCard'
import PostRideReview from './PostRideReview'
import TomorrowCard from './TomorrowCard'
import RegenerationCard from './RegenerationCard'
import { useLanguage } from '../../contexts/LanguageContext'
import { translateCoach } from '../../utils/coachLanguage'
import { formatSigned } from '../../utils/format'

function isRuleBased(model: string): boolean {
  return model === 'rule-based-fallback'
}

// ─── Evidence chip — compact inline ──────────────────────────────────────────

interface EvidenceChipProps {
  children: React.ReactNode
  tone?: 'default' | 'alert'
}

function EvidenceChip({ children, tone = 'default' }: EvidenceChipProps) {
  const fg = tone === 'alert' ? 'var(--color-alert)' : 'var(--color-ink-2)'
  const border = tone === 'alert' ? 'rgba(138, 29, 29, 0.25)' : 'var(--color-rule)'
  return (
    <span
      className="num-mono text-[11px] px-1.5 py-0.5 rounded-sm whitespace-nowrap"
      style={{ color: fg, border: `1px solid ${border}` }}
    >
      {children}
    </span>
  )
}

/**
 * Derive a single inline evidence row: TSB · HRV · CTL · Sleep · Last VO2.
 * Compact on purpose — fold 1 has one hero (the workout card); chips are support.
 */
function buildEvidenceChips(evidence: Record<string, unknown>): React.ReactNode[] {
  const chips: React.ReactNode[] = []
  const pmc = evidence.pmc as Record<string, unknown> | undefined
  const biometrics = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = biometrics?.hrv as Record<string, unknown> | undefined
  const sleep = biometrics?.sleep as Record<string, unknown> | undefined

  const tsb = (pmc?.tsb ?? evidence.tsb) as number | null | undefined
  if (typeof tsb === 'number') {
    const tone = tsb < -20 ? 'alert' : 'default'
    chips.push(
      <EvidenceChip key="tsb" tone={tone}>
        TSB {formatSigned(tsb, 0)}
      </EvidenceChip>,
    )
  }

  const ctl = (pmc?.ctl ?? evidence.ctl) as number | null | undefined
  if (typeof ctl === 'number') {
    chips.push(<EvidenceChip key="ctl">CTL {ctl.toFixed(0)}</EvidenceChip>)
  }

  const hrvDelta = hrv?.delta_pct as number | null | undefined
  if (typeof hrvDelta === 'number') {
    const tone = hrvDelta < -8 ? 'alert' : 'default'
    chips.push(
      <EvidenceChip key="hrv" tone={tone}>
        HRV {formatSigned(hrvDelta, 0)}%
      </EvidenceChip>,
    )
  }

  const sleepDebt = sleep?.total_debt_hours as number | null | undefined
  if (typeof sleepDebt === 'number' && sleepDebt > 0.2) {
    const tone = sleepDebt > 3 ? 'alert' : 'default'
    chips.push(
      <EvidenceChip key="sleep" tone={tone}>
        Sleep debt {sleepDebt.toFixed(1)}h
      </EvidenceChip>,
    )
  }

  const zones = evidence.distribution as Record<string, unknown> | undefined
  const zoneCreep = zones?.grey_zone_flag as boolean | undefined
  if (zoneCreep === true) {
    chips.push(
      <EvidenceChip key="zone" tone="alert">
        Grey-zone creep
      </EvidenceChip>,
    )
  }

  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const phase = athlete?.goal_phase as string | undefined
  if (typeof phase === 'string' && phase !== 'unknown') {
    chips.push(<EvidenceChip key="phase">Phase: {phase}</EvidenceChip>)
  }

  const injury = athlete?.injury_flag as boolean | undefined
  if (injury === true) {
    chips.push(
      <EvidenceChip key="injury" tone="alert">
        Injury flagged
      </EvidenceChip>,
    )
  }

  return chips
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
          Couldn&apos;t load today&apos;s brief
        </span>
        <button
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
          style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
        >
          Retry
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
  const simpleMode = language === 'simple'

  const evidenceChips = useMemo(
    () => buildEvidenceChips(brief.evidence || {}),
    [brief.evidence],
  )

  const generatedAgo = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(brief.generated_at), { addSuffix: true })
    } catch {
      return ''
    }
  }, [brief.generated_at])

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
            Coach brief · today
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
              title="Served from the 6h read-through cache"
            >
              cached
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
              AI offline · rule-based
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

      {/* Evidence chips — single compact row. Hidden in simple mode because
         these chips ARE the jargon (TSB/CTL/HRV numbers). The same signals
         drive the simple-mode rationale, phrased in plain English above. */}
      {!simpleMode && evidenceChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">{evidenceChips}</div>
      )}

      {/* Fold-1 hero — either PostRideReview (athlete trained today) or the
         PrescribedWorkoutCard (prescribed workout for today). Never both. */}
      {postRideReview ? (
        <PostRideReview review={postRideReview} language={language} />
      ) : workout ? (
        <PrescribedWorkoutCard workout={workout} alternates={alternates} />
      ) : (
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

      {/* Step 7 (today-runthrough) — forward-looking + regen. Both render nothing
         when their data is missing, so the visual layout stays identical for
         older briefs that don't ship these blocks. */}
      <TomorrowCard data={brief.tomorrow_plan ?? null} />
      <RegenerationCard bullets={brief.regeneration?.bullets ?? null} />

      {/* Outlook removed per product decision — CoachBrief focuses on TODAY only. */}

      {/* Frameworks + transparency — one line combined */}
      <div
        className="flex items-center justify-between gap-2 flex-wrap pt-2"
        style={{ borderTop: '1px solid var(--color-rule)' }}
      >
        {brief.frameworks_cited.length > 0 && (
          <span
            className="num-mono text-[11px] leading-snug dashboard-break-words"
            style={{ color: 'var(--color-muted)', maxWidth: '52ch' }}
          >
            {simpleMode
              ? translateCoach('brief.frameworksHeading', 'simple')
              : `${translateCoach('brief.frameworksHeading', 'technical')}: ${brief.frameworks_cited.join(' · ')}`}
          </span>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onOpenWhy}
            className="inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: 'var(--color-ink-2)' }}
          >
            <ChevronRight size={12} strokeWidth={2} />
            <span className="underline underline-offset-2 decoration-[var(--color-rule)]">
              Why this?
            </span>
          </button>
          <button
            onClick={onOpenTransparency}
            className="inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: 'var(--color-ink-2)' }}
          >
            <ChevronRight size={12} strokeWidth={2} />
            <span className="underline underline-offset-2 decoration-[var(--color-rule)]">
              What did the AI see?
            </span>
          </button>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1 text-[11px] font-medium disabled:opacity-50"
            style={{ color: 'var(--color-muted)' }}
            aria-label="Regenerate brief"
            title="Force a fresh generation"
          >
            <RefreshCw size={11} strokeWidth={1.8} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="underline underline-offset-2 decoration-[var(--color-rule)]">
              Refresh
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  )
}
