import DashboardShell from '../components/dashboard/DashboardShell'
import ReadinessHero from '../components/dashboard/ReadinessHero'
import PMCChart from '../components/dashboard/PMCChart'
import TrainingCalendar from '../components/dashboard/TrainingCalendar'
import RecentActivities from '../components/dashboard/RecentActivities'

export default function DashboardPage() {
  return (
    <DashboardShell
      bodyStatus={<ReadinessHero />}
      pmc={<PMCChart />}
      calendar={
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="min-w-0 order-2 lg:order-1">
            <RecentActivities />
          </div>
          <div className="min-w-0 order-1 lg:order-2">
            <TrainingCalendar />
          </div>
        </div>
      }
      workoutPreviewModal={null /* reserved: TrainingCalendar owns its own modal via portal; this slot is for a future lifted-state pattern (e.g. open-by-URL routing) */}
    />
  )
}
