import DashboardShell from '../components/dashboard/DashboardShell'
import BodyStatusCard from '../components/dashboard/BodyStatusCard'
import PMCChart from '../components/dashboard/PMCChart'
import TrainingCalendar from '../components/dashboard/TrainingCalendar'

export default function DashboardPage() {
  return (
    <DashboardShell
      bodyStatus={<BodyStatusCard />}
      pmc={<PMCChart />}
      calendar={<TrainingCalendar />}
      workoutPreviewModal={null /* reserved: TrainingCalendar owns its own modal via portal; this slot is for a future lifted-state pattern (e.g. open-by-URL routing) */}
    />
  )
}
