/**
 * TrendsTab — the instrument panel behind Analyze's narrative. Deduped: ramp
 * lives in Plan, recent rides live on Today, and the intensity view is one
 * classification + one distribution (not three overlapping charts).
 */
import DashboardSection from '../DashboardSection'
import LoadFormHero from '../LoadFormHero'
import WeeklyLoadCard from '../WeeklyLoadCard'
import InjuryRiskCard from '../InjuryRiskCard'
import LoadByIntensityCard from '../LoadByIntensityCard'
import LoadBySportCard from '../LoadBySportCard'
import FitnessSignalsCard from '../FitnessSignalsCard'
import MonotonyStrainCard from '../MonotonyStrainCard'
import TrajectoryCard from '../TrajectoryCard'
import RecommendationCard from '../RecommendationCard'
import TrendsHero from '../TrendsHero'
import PMCChart from '../PMCChart'
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
import FormProgressPanel from '../FormProgressPanel'
import PaceZonesCard from '../PaceZonesCard'
import ReorderableTab from '../ReorderableTab'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import { useState } from 'react'
import { useT, useLocale } from '../../../contexts/LocaleContext'
import type { CardDef } from '../cardRegistry'

function IntensitySection() {
  const t = useT()
  return (
    <DashboardSection id="trends-intensity" title={t('section_intensity')} defaultExpanded>
      <div className="flex flex-col gap-4">
        <TrainingDistributionCard />
        <PolarizedDistribution />
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
  const { locale } = useLocale()
  const de = locale === 'de'
  // Bike/Run toggle — power estimates (CP/W′/FTP) are cycling-only; running
  // gets its own pace-zone + pace-based VO2 view instead.
  const [sport, setSport] = useState<'bike' | 'run'>('bike')
  return (
    <DashboardSection id="trends-estimates" title={t('section_estimates')} defaultExpanded={false}>
      <div className="flex flex-col gap-4">
        <div className="flex justify-center sm:justify-start">
          <SegmentedTabs
            tabs={[
              { id: 'bike', label: de ? 'Rad' : 'Bike' },
              { id: 'run', label: de ? 'Lauf' : 'Run' },
            ] as const}
            value={sport}
            onChange={setSport}
            ariaLabel={de ? 'Sportart für Schätzwerte' : 'Sport for estimates'}
            indicatorId="estimates-sport-indicator"
          />
        </div>
        {sport === 'bike' ? (
          <>
            <CriticalPowerCard />
            <WBalanceTraceCard />
            <div className="grid gap-4 md:grid-cols-2">
              <FTPEstimate />
              <VO2MaxEstimate sport="cycling" />
            </div>
          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <PaceZonesCard />
            <VO2MaxEstimate sport="running" />
          </div>
        )}
      </div>
    </DashboardSection>
  )
}

function HistorySection() {
  const t = useT()
  return (
    <DashboardSection id="trends-history" title={t('section_history')} defaultExpanded>
      <div className="flex flex-col gap-5">
        <TrainingLogStrip />
        <div className="grid gap-4 md:grid-cols-2">
          <VolumeHistory />
          <PersonalBests />
        </div>
        <CalendarHeatmap />
      </div>
    </DashboardSection>
  )
}

export default function TrendsTab() {
  const t = useT()
  const { locale } = useLocale()
  const cards: CardDef[] = [
    { id: 'load-form-hero', label: locale === 'de' ? 'Form & Belastung' : 'Load & Form', render: () => <LoadFormHero /> },
    { id: 'weekly-load', label: locale === 'de' ? 'Wöchentliche Last' : 'Weekly Load', render: () => <WeeklyLoadCard /> },
    { id: 'injury-risk', label: locale === 'de' ? 'Lastverhältnis' : 'Load ratio', render: () => <InjuryRiskCard /> },
    { id: 'load-by-intensity', label: locale === 'de' ? 'Last nach Intensität' : 'Load by intensity', render: () => <LoadByIntensityCard /> },
    { id: 'load-by-sport', label: locale === 'de' ? 'Last nach Sportart' : 'Load by sport', render: () => <LoadBySportCard /> },
    { id: 'fitness-signals', label: locale === 'de' ? 'Fitness-Signale' : 'Fitness signals', render: () => <FitnessSignalsCard /> },
    { id: 'monotony-strain', label: locale === 'de' ? 'Monotonie & Strain' : 'Monotony & strain', render: () => <MonotonyStrainCard /> },
    { id: 'trajectory', label: locale === 'de' ? 'Verlauf' : 'Trajectory', render: () => <TrajectoryCard /> },
    { id: 'recommendation', label: locale === 'de' ? 'Empfehlung' : 'Recommendation', render: () => <RecommendationCard /> },
    { id: 'trends-hero', label: t('card_trends_hero'), render: () => <TrendsHero /> },
    // Per-ride form impact — reads form/fitness as of the last ride (the hero
    // shows today's live figure). Renders nothing until a ride exists.
    { id: 'form-progress', label: locale === 'de' ? 'Formverlauf' : 'Form progress', render: () => <FormProgressPanel /> },
    { id: 'pmc-chart', label: t('card_pmc_chart'), render: () => <PMCChart /> },
    { id: 'efficiency', label: t('card_ramp_efficiency'), render: () => <EfficiencyTrend /> },
    { id: 'intensity-distribution', label: t('card_intensity_distribution'), render: () => <IntensitySection /> },
    { id: 'biometrics', label: t('card_biometrics'), render: () => <BiometricsSection /> },
    { id: 'estimates', label: t('card_estimates'), render: () => <EstimatesSection /> },
    { id: 'history-records', label: t('card_history_records'), render: () => <HistorySection /> },
  ]
  return <ReorderableTab tabId="trends" cards={cards} />
}
