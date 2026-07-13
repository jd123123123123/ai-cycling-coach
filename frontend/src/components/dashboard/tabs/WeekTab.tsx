/**
 * WeekTab — Phase 7.05 "One-Screen Truth" edition.
 *
 * Above the fold: one-sentence weekly intent + 7 minimal day pills + 1 collapsed analytics disclosure.
 *
 * Hard rule (verified in Plan 05): pre-disclosure element count ≤ 8 (1 preface + 7 day pills).
 *
 * What was retired here (vs the prior 232-line tab):
 * - BentoGrid hoisted to above-fold (now lives inside DashboardSection disclosure, collapsed by default)
 * - Day cards' inline IntervalRibbon + TSS + rationale (now behind SideSheet tap)
 * - Multi-paragraph WeekPreface (collapsed to one-sentence intent + mesocycle eyebrow)
 */
import { Link } from 'react-router-dom'
import { parseISO } from 'date-fns'
import ComplianceStrip from '../ComplianceStrip'
import RampRate from '../RampRate'
import WeekVsLast from '../WeekVsLast'
import DayPlanCard from '../DayPlanCard'
import TrainingCalendar from '../TrainingCalendar'
import PillarSection from '../PillarSection'
import { useLocale } from '../../../contexts/LocaleContext'
import { useCurrentWeek } from '../../../hooks/useCurrentWeek'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useLanguage } from '../../../hooks/useLanguage'
import type { ActivityRead } from '../../../api/dashboard'

// ─── Skeleton — minimal to match new pill shape ────────────────────────────────

function WeekPlanSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Preface skeleton — single line */}
      <div
        className="rounded-xl px-5 py-4 border"
        style={{ backgroundColor: 'var(--color-paper-2)', borderColor: 'var(--color-rule)' }}
      >
        <div className="h-2.5 w-24 rounded animate-pulse mb-2" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="h-3.5 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>

      {/* 7 mini pill skeletons */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              borderColor: 'var(--color-rule)',
              minHeight: 72,
            }}
          >
            <div className="h-full flex flex-col items-center justify-center gap-1.5 p-2">
              <div className="h-2 w-3 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
              <div className="h-2 w-5 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Error / CTA states ────────────────────────────────────────────────────────

function ProfileSetupCTA({ language }: { language: 'simple' | 'technical' }) {
  const { locale } = useLocale()
  const headline = locale === 'de'
    ? (language === 'simple'
        ? 'Wir brauchen deine FTP, um deine Woche zu planen'
        : 'FTP erforderlich, um einen Trainingsplan zu erstellen')
    : (language === 'simple'
        ? 'We need your FTP to plan your week'
        : 'FTP required to generate a training plan')

  return (
    <div
      className="rounded-xl p-8 border text-center"
      style={{ backgroundColor: 'var(--color-paper-2)', borderColor: 'var(--color-rule)' }}
    >
      <p className="eyebrow mb-3" style={{ color: 'var(--color-muted)' }}>{locale === 'de' ? 'Zuerst einrichten' : 'Set up first'}</p>
      <h3 className="text-[18px] font-medium mb-4" style={{ color: 'var(--color-ink)' }}>{headline}</h3>
      <Link
        to="/profile-setup"
        className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[13px] font-medium min-h-[40px]"
        style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
      >
        {locale === 'de' ? 'Profil abschließen' : 'Finish profile'}
      </Link>
    </div>
  )
}

function WeekErrorBanner({ onRetry }: { onRetry: () => void }) {
  const { locale } = useLocale()
  return (
    <div
      className="rounded-xl p-5 border flex items-center justify-between gap-3 flex-wrap"
      style={{ backgroundColor: 'var(--color-paper-2)', borderColor: 'var(--color-rule)' }}
    >
      <span className="eyebrow" style={{ color: 'var(--color-alert)' }}>{locale === 'de' ? 'Diese Woche konnte nicht geladen werden' : 'Couldn’t load this week'}</span>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
        style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
      >
        {locale === 'de' ? 'Erneut versuchen' : 'Retry'}
      </button>
    </div>
  )
}

// ─── Primary week plan ────────────────────────────────────────────────────────

function WeekPlanPrimary() {
  const { data, isLoading, isError, error, refetch } = useCurrentWeek()
  const { language } = useLanguage()

  // Single useActivitiesRange call for the whole week — passed down to each card
  const weekStart = data?.week_start ? parseISO(data.week_start) : new Date()
  const weekEnd = data?.week_end ? parseISO(data.week_end) : new Date()
  const { data: activitiesData } = useActivitiesRange(weekStart, weekEnd)

  if (isLoading) return <WeekPlanSkeleton />

  if (isError) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 409) return <ProfileSetupCTA language={language} />
    return <WeekErrorBanner onRetry={() => void refetch()} />
  }

  if (!data) return <WeekPlanSkeleton />

  if (data.days.length !== 7) {
    console.warn(`[WeekTab] Expected 7 days from server, got ${data.days.length}. Rendering available days.`)
  }

  // Match each day to its activity by date
  const activities = activitiesData?.activities ?? []
  function activityForDay(dateStr: string): ActivityRead | null {
    return activities.find(a => (a.date ?? a.started_at?.slice(0, 10)) === dateStr) ?? null
  }

  // Detect a uniform placeholder duration: if every workout day carries the
  // identical target, the "1.5h × 7" strip is a stub, not a real prescription.
  // In that case hide the duration and show weekday + intensity dot only.
  const workoutTargets = data.days
    .filter((d) => d.category !== 'rest')
    .map((d) => d.duration_seconds_target ?? 0)
    .filter((v) => v > 0)
  const durationsAreStub = new Set(workoutTargets).size <= 1

  return (
    <div className="flex flex-col gap-3">
      {/* 7-day pill row — TrainHero above owns the week framing now,
         so the pills are the visual core here. */}
      <div className="grid grid-cols-7 gap-1.5">
        {data.days.map((day) => (
          <DayPlanCard
            key={day.date}
            day={day}
            language={language}
            activity={activityForDay(day.date)}
            hideDuration={durationsAreStub}
          />
        ))}
      </div>
    </div>
  )
}

// ─── WeekTab — MECE pillars, plan-first ───────────────────────────────────────
//
// Reordered so the *actual plan* leads: this week's sessions, then the full
// calendar (expanded, above the fold). The week-over-week analytics — which
// overlap the Analyze tab's job — are demoted into a single compact band at the
// bottom rather than two large hero cards competing with the plan.

export default function WeekTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  return (
    <div className="flex flex-col gap-9 sm:gap-11">
      <PillarSection index="1" title={de ? 'Diese Woche' : 'This week'}
        question={de ? 'Was steht diese Woche an?' : "What's on this week?"}>
        <WeekPlanPrimary />
      </PillarSection>

      <PillarSection index="2" title={de ? 'Gesamtplan' : 'Full plan'}
        question={de ? 'Wie sieht mein kompletter Plan aus?' : 'What does my whole plan look like?'}>
        <div className="min-w-0">
          <TrainingCalendar />
        </div>
      </PillarSection>

      <PillarSection index="3" title={de ? 'Umsetzung & Vergleich' : 'Execution & trend'}
        question={de ? 'Halte ich mich an den Plan — und sicher unterwegs?' : 'Am I on plan — and ramping safely?'}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex-1 min-w-0"><ComplianceStrip /></div>
          <div className="flex-1 min-w-0"><WeekVsLast /></div>
          <div className="flex-1 min-w-0"><RampRate /></div>
        </div>
      </PillarSection>
    </div>
  )
}
