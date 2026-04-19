import DashboardShell from '../components/dashboard/DashboardShell'
import BodyStatusCard from '../components/dashboard/BodyStatusCard'
import PMCChart from '../components/dashboard/PMCChart'

export default function DashboardPage() {
  return (
    <DashboardShell
      bodyStatus={<BodyStatusCard />}
      pmc={<PMCChart />}
      calendar={null /* plan 04-03 mounts TrainingCalendar here */}
      workoutPreviewModal={null /* plan 04-04 mounts the modal here */}
    />
  )
}
