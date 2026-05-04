import { Link } from 'react-router-dom'
import { BentoCell, BentoGrid } from '../../ui/BentoGrid'
import ComplianceStrip from '../ComplianceStrip'
import PersonalBests from '../PersonalBests'
import PolarizedDistribution from '../PolarizedDistribution'
import RampRate from '../RampRate'
import WeekStrip from '../WeekStrip'
import WeekVsLast from '../WeekVsLast'
import WeekPreface from '../WeekPreface'
import DayPlanCard from '../DayPlanCard'
import { useCurrentWeek } from '../../../hooks/useCurrentWeek'
import { useLanguage } from '../../../hooks/useLanguage'

// ─── Skeleton — matches CoachBrief loading pattern ───────────────────────────

function WeekPlanSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Preface skeleton */}
      <div
        className="rounded-xl p-6 border"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          borderColor: 'var(--color-rule)',
        }}
      >
        <div
          className="h-3 w-28 rounded animate-pulse mb-4"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
        <div
          className="h-8 w-20 rounded animate-pulse mb-4"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
        <div className="flex flex-col gap-2">
          <div className="h-3 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
          <div className="h-3 w-5/6 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
          <div className="h-3 w-4/6 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        </div>
      </div>

      {/* Day cards skeleton row */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg p-4 border"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              borderColor: 'var(--color-rule)',
              minHeight: 140,
            }}
          >
            <div className="h-2.5 w-12 rounded animate-pulse mb-3" style={{ backgroundColor: 'var(--color-rule)' }} />
            <div className="h-3 w-full rounded animate-pulse mb-2" style={{ backgroundColor: 'var(--color-rule)' }} />
            <div className="h-12 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Error / CTA states ────────────────────────────────────────────────────────

function ProfileSetupCTA({ language }: { language: 'simple' | 'technical' }) {
  const headline =
    language === 'simple'
      ? 'We need your FTP to plan your week'
      : 'FTP required to generate a training plan'

  return (
    <div
      className="rounded-xl p-8 border text-center"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        borderColor: 'var(--color-rule)',
      }}
    >
      <p
        className="eyebrow mb-3"
        style={{ color: 'var(--color-muted)' }}
      >
        Set up first
      </p>
      <h3
        className="text-[18px] font-medium mb-4"
        style={{ color: 'var(--color-ink)' }}
      >
        {headline}
      </h3>
      <Link
        to="/profile-setup"
        className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[13px] font-medium min-h-[40px]"
        style={{
          backgroundColor: 'var(--color-ink)',
          color: 'var(--color-paper)',
        }}
      >
        Finish profile
      </Link>
    </div>
  )
}

function WeekErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="rounded-xl p-5 border flex items-center justify-between gap-3 flex-wrap"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        borderColor: 'var(--color-rule)',
      }}
    >
      <span
        className="eyebrow"
        style={{ color: 'var(--color-alert)' }}
      >
        Couldn&apos;t load this week
      </span>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
        style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
      >
        Retry
      </button>
    </div>
  )
}

// ─── Primary surface — week plan ──────────────────────────────────────────────

function WeekPlanPrimary() {
  const { data, isLoading, isError, error, refetch } = useCurrentWeek()
  const { language } = useLanguage()

  if (isLoading) return <WeekPlanSkeleton />

  // Detect 409 (ftp_required / profile_required)
  if (isError) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 409) {
      return <ProfileSetupCTA language={language} />
    }
    return <WeekErrorBanner onRetry={() => void refetch()} />
  }

  if (!data) return <WeekPlanSkeleton />

  // Defensive: log a warning if days count is unexpected
  if (data.days.length !== 7) {
    console.warn(`[WeekTab] Expected 7 days from server, got ${data.days.length}. Rendering available days.`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Weekly preface card */}
      <WeekPreface
        preface={data.preface}
        mesoBlock={data.meso_block}
        weekStart={data.week_start}
        weekEnd={data.week_end}
        language={language}
      />

      {/* 7-day grid — 1 col mobile, 7 col desktop */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {data.days.map((day) => (
          <DayPlanCard
            key={day.date}
            day={day}
            language={language}
          />
        ))}
      </div>
    </div>
  )
}

// ─── WeekTab — primary surface above existing analytics ───────────────────────

export default function WeekTab() {
  return (
    <div className="flex flex-col gap-8">
      {/* PRIMARY — periodization week plan (NEW) */}
      <WeekPlanPrimary />

      {/* SECONDARY — existing analytics (PRESERVED) */}
      <section>
        <p
          className="eyebrow mb-4"
          style={{ color: 'var(--color-muted)' }}
        >
          This week&apos;s analytics
        </p>
        <BentoGrid>
          {/* Plan vs actual compliance — leading cell, most action-informing signal */}
          <BentoCell span={3}>
            <ComplianceStrip />
          </BentoCell>

          {/* Week calendar — the anchor */}
          <BentoCell span={2}>
            <WeekStrip />
          </BentoCell>

          {/* Load delta — this week vs last */}
          <BentoCell span={1}>
            <WeekVsLast />
          </BentoCell>

          {/* Ramp rate — overreaching traffic light */}
          <BentoCell span={1}>
            <RampRate />
          </BentoCell>

          {/* Zone balance — training quality */}
          <BentoCell span={2}>
            <PolarizedDistribution />
          </BentoCell>

          {/* Personal records — dopamine hit */}
          <BentoCell span={3}>
            <PersonalBests />
          </BentoCell>
        </BentoGrid>
      </section>
    </div>
  )
}
