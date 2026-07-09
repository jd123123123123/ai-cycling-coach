/**
 * AnalyzeTab — one analytical narrative, not three sub-tabs.
 *
 * The Report (period grade → diagnosis → prescription) is the story; the raw
 * charts (PMC, distribution, biometrics, estimates, history) become a collapsed
 * drill-down beneath it. The custom-chart Workspace lives at /dashboards.
 */
import ReportTab from './ReportTab'
import TrendsTab from './TrendsTab'
import DashboardSection from '../DashboardSection'
import { useT } from '../../../contexts/LocaleContext'

export default function AnalyzeTab() {
  const t = useT()
  return (
    <div className="flex flex-col gap-9 sm:gap-11">
      <ReportTab />
      <DashboardSection id="analyze-charts" title={t('analyze_charts')} defaultExpanded={false}>
        <TrendsTab />
      </DashboardSection>
    </div>
  )
}
