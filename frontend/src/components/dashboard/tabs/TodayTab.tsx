/**
 * TodayTab — the verdict surface, now user-reorderable. The fixed sequence is
 * declared as a registry of cards; <ReorderableTab> renders them in the user's
 * saved order (hidden cards omitted) and hosts the Customize editor.
 */
import CoachBrief from '../CoachBrief'
import MorningCheckin from '../MorningCheckin'
import MorningRecap from '../MorningRecap'
import TrainHero from '../TrainHero'
import { useT } from '../../../contexts/LocaleContext'
import AchievementBadges from '../AchievementBadges'
import DidYouKnow from '../DidYouKnow'
import MomentumChips from '../MomentumChips'
import PMCCompact from '../PMCCompact'
import SeasonStats from '../SeasonStats'
import TrainingLogStrip from '../TrainingLogStrip'
import ExternalWorkouts from '../ExternalWorkouts'
import TodayHero from '../TodayHero'
import WorkoutExportRow from '../WorkoutExportRow'
import StreakStrip from '../StreakStrip'
import WeeklyChallenge from '../WeeklyChallenge'
import DashboardSection from '../DashboardSection'
import ReorderableTab from '../ReorderableTab'
import type { CardDef } from '../cardRegistry'

function StreakChallengeRow() {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto] items-stretch">
      <StreakStrip />
      <WeeklyChallenge />
    </div>
  )
}

function TodayDeepDive() {
  const t = useT()
  return (
    <DashboardSection id="today-deep-dive" title={t('deep_dive')} defaultExpanded={false}>
      <div className="flex flex-col gap-6">
        <ExternalWorkouts />
        <WorkoutExportRow />
      </div>
    </DashboardSection>
  )
}

export default function TodayTab() {
  const t = useT()
  const cards: CardDef[] = [
    { id: 'train-hero', label: t('card_train_hero'), render: () => <TrainHero /> },
    { id: 'morning-checkin', label: t('card_checkin'), render: () => <MorningCheckin /> },
    { id: 'morning-recap', label: t('card_recap'), render: () => <MorningRecap /> },
    { id: 'today-hero', label: t('card_today_hero'), render: () => <TodayHero /> },
    { id: 'momentum', label: t('card_momentum'), render: () => <MomentumChips /> },
    { id: 'coach-brief', label: t('card_coach_brief'), render: () => <CoachBrief /> },
    { id: 'streak', label: t('card_streak'), render: () => <StreakChallengeRow /> },
    { id: 'pmc', label: t('card_pmc'), render: () => <PMCCompact /> },
    { id: 'season-stats', label: t('card_season'), render: () => <SeasonStats /> },
    { id: 'achievements', label: t('card_badges'), render: () => <AchievementBadges /> },
    { id: 'did-you-know', label: t('card_dyk'), render: () => <DidYouKnow /> },
    { id: 'log-strip', label: t('card_log'), render: () => <TrainingLogStrip /> },
    { id: 'deep-dive', label: t('card_deep_dive'), render: () => <TodayDeepDive /> },
  ]
  return <ReorderableTab tabId="today" cards={cards} />
}
