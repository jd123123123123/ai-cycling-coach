/**
 * TodayTab — executive-brief layout, scoped to exactly one job: "what do I do
 * today, and am I ready for it?". Trend reporting (CTL/TSB/eFTP), the gamified
 * weekly ring, the consistency streak AND the recent-ride history are
 * MECE-owned by Analyze / Social, so Today only carries slim teasers that
 * point there — never their full surfaces. Two tight pillars:
 *   ① Heute — today's SESSION (the hero) → one readiness line → directive
 *   ② Woche — compact load teaser → Social, form teaser → Analyze
 */
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import CoachBrief from '../CoachBrief'
import AdaptiveDirectiveCard from '../AdaptiveDirectiveCard'
import MorningCheckin from '../MorningCheckin'
import MorningRecap from '../MorningRecap'
import { useLocale } from '../../../contexts/LocaleContext'
import AchievementBadges from '../AchievementBadges'
import DidYouKnow from '../DidYouKnow'
import MomentumChips from '../MomentumChips'
import SeasonStats from '../SeasonStats'
import TodayHero from '../TodayHero'
import WeeklyChallenge from '../WeeklyChallenge'
import DashboardSection from '../DashboardSection'
import PillarSection from '../PillarSection'

// One-line "Form is coming" teaser — the full fitness trend (CTL/TSB/eFTP)
// lives in Analyze; Today just points there so the two surfaces never overlap.
function FormTeaser({ de }: { de: boolean }) {
  return (
    <Link
      to="/dashboard?tab=analyze"
      className="flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 transition-colors"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        textDecoration: 'none',
      }}
    >
      <span style={{ color: 'var(--color-ink)', fontSize: 14 }}>
        {de ? 'Form kommt — Details in Analyse' : 'Form is coming — see Analyze'}
      </span>
      <ChevronRight size={15} strokeWidth={2} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
    </Link>
  )
}

export default function TodayTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const copy = de
    ? {
        heroQ: 'Was mache ich heute — und bin ich bereit dafür?',
        week: 'Woche', weekQ: 'Belastung und Form auf einen Blick.',
        more: 'Mehr',
      }
    : {
        heroQ: "What do I do today — and am I ready for it?",
        week: 'Week', weekQ: 'Load and form at a glance.',
        more: 'More',
      }

  return (
    <div className="flex flex-col gap-9 sm:gap-11">
      {/* ── ① Today: the SESSION leads (CoachBrief owns the workout hero + its
             one-line why), then ONE compact readiness line, then the demoted
             directive. Morning input + momentum trail underneath. ── */}
      <PillarSection index="1" title={de ? 'Heute' : 'Today'} question={copy.heroQ}>
        <CoachBrief />
        <TodayHero />
        <AdaptiveDirectiveCard />
        <MorningCheckin />
        <MorningRecap />
        <MomentumChips />
      </PillarSection>

      {/* ── ② Week: slim load + form teasers that hand off to Social / Analyze ── */}
      <PillarSection index="2" title={copy.week} question={copy.weekQ}>
        <WeeklyChallenge teaser />
        <FormTeaser de={de} />
      </PillarSection>

      {/* ── Context, demoted ── */}
      <DashboardSection id="today-more" title={copy.more} defaultExpanded={false}>
        <div className="flex flex-col gap-6">
          <SeasonStats />
          <AchievementBadges />
          <DidYouKnow />
        </div>
      </DashboardSection>
    </div>
  )
}
