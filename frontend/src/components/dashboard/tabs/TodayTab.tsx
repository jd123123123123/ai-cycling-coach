/**
 * TodayTab — the verdict. State (ReadinessHero) → trajectory → coach
 * prescription → training-state (PMCCompact) → 90-day log strip. Everything
 * analytical lives on the Trends tab now; Today's deep-dive holds only
 * today-relevant extras (curated external workouts + the file-export row).
 */
import CoachBrief from '../CoachBrief'
import MissedYesterdayChip from '../MissedYesterdayChip'
import PMCCompact from '../PMCCompact'
import TrainingLogStrip from '../TrainingLogStrip'
import ExternalWorkouts from '../ExternalWorkouts'
import ReadinessHero from '../ReadinessHero'
import TrajectorySentence from '../TrajectorySentence'
import WorkoutExportRow from '../WorkoutExportRow'
import StreakStrip from '../StreakStrip'
import WeeklyChallenge from '../WeeklyChallenge'
import DashboardSection from '../DashboardSection'

export default function TodayTab() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      <ReadinessHero />
      <TrajectorySentence />
      <MissedYesterdayChip />
      <CoachBrief />

      {/* Momentum — the addiction spine: streak chain + weekly-challenge ring */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto] items-stretch">
        <StreakStrip />
        <WeeklyChallenge />
      </div>

      <PMCCompact />
      <TrainingLogStrip />

      <DashboardSection id="today-deep-dive" title="Deep dive" defaultExpanded={false}>
        <div className="flex flex-col gap-6">
          <ExternalWorkouts />
          <WorkoutExportRow />
        </div>
      </DashboardSection>
    </div>
  )
}
