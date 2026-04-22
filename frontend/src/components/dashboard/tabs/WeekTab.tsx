/**
 * WeekTab — weekly recap bento.
 *
 * Components arranged in a 12-col BentoGrid.
 * At 1440×900 the bento lays out in two rows:
 *   Row 1: WeekStrip (8-col) + ComplianceStrip (4-col)
 *   Row 2: WeeklySportMetrics (4-col) + PolarizedDistribution (8-col)
 *   Row 3: LastWeekRecap (full 12-col)
 */
import { BentoCell, BentoGrid } from '../../ui/BentoGrid'
import ComplianceStrip from '../ComplianceStrip'
import LastWeekRecap from '../LastWeekRecap'
import PolarizedDistribution from '../PolarizedDistribution'
import WeekStrip from '../WeekStrip'
import WeeklySportMetrics from '../WeeklySportMetrics'

export default function WeekTab() {
  return (
    <BentoGrid>
      {/* Full weekly strip — full week overview, wider card */}
      <BentoCell span={2}>
        <WeekStrip />
      </BentoCell>

      {/* Compliance dumbbell — planned vs actual per day */}
      <BentoCell span={1}>
        <ComplianceStrip />
      </BentoCell>

      {/* Sport breakdown metrics */}
      <BentoCell span={1}>
        <WeeklySportMetrics />
      </BentoCell>

      {/* Polarized distribution donut — zone balance */}
      <BentoCell span={2}>
        <PolarizedDistribution />
      </BentoCell>

      {/* Last week recap — celebration card, full width */}
      <BentoCell span={3}>
        <LastWeekRecap />
      </BentoCell>
    </BentoGrid>
  )
}
