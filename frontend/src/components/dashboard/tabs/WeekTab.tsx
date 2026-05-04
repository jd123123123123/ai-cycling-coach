import { BentoCell, BentoGrid } from '../../ui/BentoGrid'
import ComplianceStrip from '../ComplianceStrip'
import PersonalBests from '../PersonalBests'
import PolarizedDistribution from '../PolarizedDistribution'
import RampRate from '../RampRate'
import WeekStrip from '../WeekStrip'
import WeekVsLast from '../WeekVsLast'

export default function WeekTab() {
  return (
    <BentoGrid>
      {/* Plan vs actual compliance — leading cell, most action-informing signal */}
      <BentoCell span={3}>
        <ComplianceStrip />
      </BentoCell>

      {/* Week calendar — the anchor */}
      <BentoCell span={2}>
        <WeekStrip />
      </BentoCell>

      {/* Load delta — this week vs last */}
      <BentoCell span={1}>
        <WeekVsLast />
      </BentoCell>

      {/* Ramp rate — overreaching traffic light */}
      <BentoCell span={1}>
        <RampRate />
      </BentoCell>

      {/* Zone balance — training quality */}
      <BentoCell span={2}>
        <PolarizedDistribution />
      </BentoCell>

      {/* Personal records — dopamine hit */}
      <BentoCell span={3}>
        <PersonalBests />
      </BentoCell>
    </BentoGrid>
  )
}
