import { BentoCell, BentoGrid } from '../../ui/BentoGrid'
import CalendarHeatmap from '../CalendarHeatmap'
import FTPEstimate from '../FTPEstimate'
import HRVTrend from '../HRVTrend'
import PMCChart from '../PMCChart'

export default function TrendsTab() {
  return (
    <BentoGrid>
      {/* PMC fitness/fatigue/form — the gold-standard endurance chart */}
      <BentoCell span={3}>
        <PMCChart />
      </BentoCell>

      {/* HRV baseline band — 30-day trend */}
      <BentoCell span={1}>
        <HRVTrend />
      </BentoCell>

      {/* FTP auto-estimate from recent rides */}
      <BentoCell span={2}>
        <FTPEstimate />
      </BentoCell>

      {/* Training consistency calendar */}
      <BentoCell span={3}>
        <CalendarHeatmap />
      </BentoCell>
    </BentoGrid>
  )
}
