/**
 * PlanTab — the forward plan. This week's sessions + plan-vs-actual + calendar
 * (WeekTab), with the workout library folded in as a collapsed section so it
 * no longer needs its own top-level tab.
 */
import WeekTab from './WeekTab'
import WorkoutsTab from './WorkoutsTab'
import DashboardSection from '../DashboardSection'
import { useT } from '../../../contexts/LocaleContext'

export default function PlanTab() {
  const t = useT()
  return (
    <div className="flex flex-col gap-9 sm:gap-11">
      <WeekTab />
      <DashboardSection id="plan-workouts" title={t('tab_workouts')} defaultExpanded={false}>
        <WorkoutsTab />
      </DashboardSection>
    </div>
  )
}
