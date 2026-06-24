/**
 * TrendsTab — the instrument panel. Everything analytical lives here so Today
 * stays a one-glance verdict and Train stays the plan. Grouped into collapsible
 * sections; the most decision-relevant one (fitness & form) is open by default.
 *
 * Now user-reorderable: each top-level visual group is a CardDef; <ReorderableTab>
 * renders them in the user's saved order and hosts the Customize editor.
 */
import DashboardSection from '../DashboardSection'
import TrendsHero from '../TrendsHero'
import PMCChart from '../PMCChart'
import RampRate from '../RampRate'
import IntensityDistribution from '../IntensityDistribution'
import PolarizedDistribution from '../PolarizedDistribution'
import TrainingDistributionCard from '../TrainingDistributionCard'
import HRVTrend from '../HRVTrend'
import FTPEstimate from '../FTPEstimate'
import CriticalPowerCard from '../CriticalPowerCard'
import WBalanceTraceCard from '../WBalanceTraceCard'
import VO2MaxEstimate from '../VO2MaxEstimate'
import EfficiencyTrend from '../EfficiencyTrend'
import VolumeHistory from '../VolumeHistory'
import PersonalBests from '../PersonalBests'
import CalendarHeatmap from '../CalendarHeatmap'
import TrainingLogStrip from '../TrainingLogStrip'
import RecentActivities from '../RecentActivities'
import ReorderableTab from '../ReorderableTab'
import { useT } from '../../../contexts/LocaleContext'
import type { CardDef } from '../cardRegistry'

function RampEfficiencyRow() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RampRate />
      <EfficiencyTrend />
    </div>
  )
}

function IntensitySection() {
  const t = useT()
  return (
    <DashboardSection id="trends-intensity" title={t('section_intensity')} defaultExpanded>
      <div className="flex flex-col gap-4">
        <TrainingDistributionCard />
        <div className="grid gap-4 md:grid-cols-2">
          <IntensityDistribution />
          <PolarizedDistribution />
        </div>
      </div>
    </DashboardSection>
  )
}

function BiometricsSection() {
  const t = useT()
  return (
    <DashboardSection id="trends-biometrics" title={t('section_biometrics')} defaultExpanded={false}>
      <HRVTrend />
    </DashboardSection>
  )
}

function EstimatesSection() {
  const t = useT()
  return (
    <DashboardSection id="trends-estimates" title={t('section_estimates')} defaultExpanded={false}>
      <div className="flex flex-col gap-4">
        <CriticalPowerCard />
        <WBalanceTraceCard />
        <div className="grid gap-4 md:grid-cols-2">
          <FTPEstimate />
          <VO2MaxEstimate sport="cycling" />
        </div>
      </div>
    </DashboardSection>
  )
}

function HistorySection() {
  const t = useT()
  return (
    <DashboardSection id="trends-history" title={t('section_history')} defaultExpanded={false}>
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
  )
}

export default function TrendsTab() {
  const t = useT()
  const cards: CardDef[] = [
    { id: 'trends-hero', label: t('card_trends_hero'), render: () => <TrendsHero /> },
    { id: 'pmc-chart', label: t('card_pmc_chart'), render: () => <PMCChart /> },
    { id: 'ramp-efficiency', label: t('card_ramp_efficiency'), render: () => <RampEfficiencyRow /> },
    { id: 'intensity-distribution', label: t('card_intensity_distribution'), render: () => <IntensitySection /> },
    { id: 'biometrics', label: t('card_biometrics'), render: () => <BiometricsSection /> },
    { id: 'estimates', label: t('card_estimates'), render: () => <EstimatesSection /> },
    { id: 'history-records', label: t('card_history_records'), render: () => <HistorySection /> },
  ]
  return <ReorderableTab tabId="trends" cards={cards} />
}
