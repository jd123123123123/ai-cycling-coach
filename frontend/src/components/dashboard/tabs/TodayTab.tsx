/**
 * TodayTab — executive-brief layout. Leads with the answer (today's call), then
 * four MECE pillars, each resolving exactly one question with no overlap:
 *   ① Heute (the call)  ② Fortschritt  ③ Belastung  ④ Konstanz
 * Context (season stats, badges, trivia, tools) is demoted to a collapsed "Mehr".
 */
import CoachBrief from '../CoachBrief'
import AdaptiveDirectiveCard from '../AdaptiveDirectiveCard'
import FormProgressPanel from '../FormProgressPanel'
import MorningCheckin from '../MorningCheckin'
import MorningRecap from '../MorningRecap'
import { useLocale } from '../../../contexts/LocaleContext'
import AchievementBadges from '../AchievementBadges'
import DidYouKnow from '../DidYouKnow'
import MomentumChips from '../MomentumChips'
import SeasonStats from '../SeasonStats'
import RecentActivities from '../RecentActivities'
import TodayHero from '../TodayHero'
import StreakStrip from '../StreakStrip'
import WeeklyChallenge from '../WeeklyChallenge'
import DashboardSection from '../DashboardSection'
import PillarSection from '../PillarSection'

export default function TodayTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const copy = de
    ? {
        heroQ: 'Was mache ich heute — und bin ich bereit dafür?',
        progress: 'Fortschritt', progressQ: 'Werde ich fitter oder ermüde ich?',
        load: 'Belastung', loadQ: 'Ist mein Trainingspensum nachhaltig?',
        consistency: 'Konstanz', consistencyQ: 'Bleibe ich dran?',
        history: 'Verlauf', historyQ: 'Was habe ich zuletzt gemacht?',
        more: 'Mehr',
      }
    : {
        heroQ: "What do I do today — and am I ready for it?",
        progress: 'Progress', progressQ: 'Am I getting fitter, or fatiguing?',
        load: 'Load', loadQ: 'Is my training volume sustainable?',
        consistency: 'Consistency', consistencyQ: 'Am I staying on it?',
        history: 'History', historyQ: 'What have I done recently?',
        more: 'More',
      }

  return (
    <div className="flex flex-col gap-9 sm:gap-11">
      {/* ── ① Today's call: the readiness verdict, the session, the check-in ── */}
      <PillarSection index="1" title={de ? 'Heute' : 'Today'} question={copy.heroQ}>
        <TodayHero />
        <AdaptiveDirectiveCard />
        <CoachBrief />
        <MorningCheckin />
      </PillarSection>

      {/* ── ② Progress: am I adapting? (full fitness trend lives in Analyze) ── */}
      <PillarSection index="2" title={copy.progress} question={copy.progressQ}>
        <FormProgressPanel />
        <MorningRecap />
        <MomentumChips />
      </PillarSection>

      {/* ── ③ Load balance: is the input sustainable? ── */}
      <PillarSection index="3" title={copy.load} question={copy.loadQ}>
        <WeeklyChallenge />
      </PillarSection>

      {/* ── ④ Consistency: am I showing up? ── */}
      <PillarSection index="4" title={copy.consistency} question={copy.consistencyQ}>
        <StreakStrip />
      </PillarSection>

      {/* ── ⑤ History: today's glance (deep records live in Analyze) ── */}
      <PillarSection index="5" title={copy.history} question={copy.historyQ}>
        <RecentActivities limit={6} />
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
