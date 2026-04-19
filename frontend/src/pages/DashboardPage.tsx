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
      workoutPreviewModal={null /* plan 04-04 mounts the modal here */}
    />
  )
}
