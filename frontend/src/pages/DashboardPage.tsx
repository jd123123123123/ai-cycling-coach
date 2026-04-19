import DashboardShell from '../components/dashboard/DashboardShell'
import ReadinessHero from '../components/dashboard/ReadinessHero'
import BiometricsDetail from '../components/dashboard/BiometricsDetail'
import PMCChart from '../components/dashboard/PMCChart'
import CalendarHeatmap from '../components/dashboard/CalendarHeatmap'
import IntensityDistribution from '../components/dashboard/IntensityDistribution'
import EfficiencyTrend from '../components/dashboard/EfficiencyTrend'
import TrainingCalendar from '../components/dashboard/TrainingCalendar'
import RecentActivities from '../components/dashboard/RecentActivities'

export default function DashboardPage() {
  return (
    <DashboardShell
      bodyStatus={<ReadinessHero />}
      pmc={
        <div className="flex flex-col gap-10">
          <BiometricsDetail />
          <div className="flex flex-col gap-6">
            <PMCChart />
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <IntensityDistribution />
              <EfficiencyTrend />
            </div>
            <CalendarHeatmap />
          </div>
        </div>
      }
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
