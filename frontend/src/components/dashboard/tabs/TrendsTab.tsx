/**
 * TrendsTab — charts bento.
 *
 * Components arranged in a 12-col BentoGrid.
 * At 1440×900 the bento lays out in two rows:
 *   Row 1: PMCChart (12-col, full width, capped at 280px height)
 *   Row 2: IntensityDistribution (8-col) + EfficiencyTrend (4-col)
 *   Row 3: CalendarHeatmap (12-col, full width)
 *
 * NOTE: EfficiencyTrend and CalendarHeatmap were originally built for
 * full-width dashboard placement. They are placed in BentoCell containers
 * here; no root max-w-* or mx-auto was found to need stripping during
 * Wave 2 audit (both scale naturally to container width).
 */
import { BentoCell, BentoGrid } from '../../ui/BentoGrid'
import CalendarHeatmap from '../CalendarHeatmap'
import EfficiencyTrend from '../EfficiencyTrend'
import IntensityDistribution from '../IntensityDistribution'
import PMCChart from '../PMCChart'

export default function TrendsTab() {
  return (
    <BentoGrid>
      {/* PMC fitness/fatigue chart — the most important trend view.
          Cap the BentoCell max height to 280px so the chart doesn't dominate
          the full screen at 1440×900, keeping the bento balanced. */}
      <BentoCell span={3}>
        <div style={{ maxHeight: 320, overflow: 'hidden' }}>
          <PMCChart />
        </div>
      </BentoCell>

      {/* Zone distribution donut */}
      <BentoCell span={2}>
        <IntensityDistribution />
      </BentoCell>

      {/* Efficiency factor trend sparklines */}
      <BentoCell span={1}>
        <EfficiencyTrend />
      </BentoCell>

      {/* Training load calendar heatmap — full width, bottom row */}
      <BentoCell span={3}>
        <CalendarHeatmap />
      </BentoCell>
    </BentoGrid>
  )
}
