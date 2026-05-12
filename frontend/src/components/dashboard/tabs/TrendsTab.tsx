/**
 * TrendsTab — the instrument panel. Everything analytical lives here so Today
 * stays a one-glance verdict and Train stays the plan. Grouped into collapsible
 * sections; the most decision-relevant one (fitness & form) is open by default.
 */
import DashboardSection from '../DashboardSection'
import PMCChart from '../PMCChart'
import RampRate from '../RampRate'
import IntensityDistribution from '../IntensityDistribution'
import PolarizedDistribution from '../PolarizedDistribution'
import HRVTrend from '../HRVTrend'
import FTPEstimate from '../FTPEstimate'
import VO2MaxEstimate from '../VO2MaxEstimate'
import EfficiencyTrend from '../EfficiencyTrend'
import VolumeHistory from '../VolumeHistory'
import PersonalBests from '../PersonalBests'
import CalendarHeatmap from '../CalendarHeatmap'
import TrainingLogStrip from '../TrainingLogStrip'
import RecentActivities from '../RecentActivities'

export default function TrendsTab() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      {/* Fitness & form — the gold-standard endurance picture */}
      <PMCChart />
      <div className="grid gap-4 md:grid-cols-2">
        <RampRate />
        <EfficiencyTrend />
      </div>

      <DashboardSection id="trends-intensity" title="Intensity & distribution" defaultExpanded>
        <div className="grid gap-4 md:grid-cols-2">
          <IntensityDistribution />
          <PolarizedDistribution />
        </div>
      </DashboardSection>

      <DashboardSection id="trends-biometrics" title="Biometrics" defaultExpanded={false}>
        <HRVTrend />
      </DashboardSection>

      <DashboardSection id="trends-estimates" title="Estimates" defaultExpanded={false}>
        <div className="grid gap-4 md:grid-cols-2">
          <FTPEstimate />
          <VO2MaxEstimate />
        </div>
      </DashboardSection>

      <DashboardSection id="trends-history" title="History & records" defaultExpanded={false}>
        <div className="flex flex-col gap-5">
          <TrainingLogStrip />
          <div className="grid gap-4 md:grid-cols-2">
            <VolumeHistory />
            <PersonalBests />
          </div>
          <CalendarHeatmap />
          <RecentActivities />
        </div>
      </DashboardSection>
    </div>
  )
}
