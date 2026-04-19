import DashboardShell from '../components/dashboard/DashboardShell'
import BodyStatusCard from '../components/dashboard/BodyStatusCard'

export default function DashboardPage() {
  return (
    <DashboardShell
      bodyStatus={<BodyStatusCard />}
      pmc={null /* plan 04-02 mounts PMCChart here */}
      calendar={null /* plan 04-03 mounts TrainingCalendar here */}
      workoutPreviewModal={null /* plan 04-04 mounts the modal here */}
    />
  )
}
