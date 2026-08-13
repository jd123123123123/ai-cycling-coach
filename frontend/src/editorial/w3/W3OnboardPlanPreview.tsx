import { useState } from 'react'
import W3OnboardPlanView, { type W3PlanMode, type W3GoalKey } from './W3OnboardPlanView'

/**
 * TEMP preview — /e/w3-onboard-plan-preview (unguarded). Interactive local
 * state so the mode cards + goal chips + upload reveal can be exercised without
 * the router or any persistence. Nothing here writes storage or navigates.
 */
export default function W3OnboardPlanPreview() {
  const [mode, setMode] = useState<W3PlanMode | null>('build')
  const [goals, setGoals] = useState<W3GoalKey[]>(['ftp', 'climbing'])

  const toggleGoal = (g: W3GoalKey) =>
    setGoals((prev) => {
      if (prev.includes(g)) return prev.filter((x) => x !== g)
      if (prev.length >= 3) return prev
      return [...prev, g]
    })

  return (
    <W3OnboardPlanView
      mode={mode}
      goals={goals}
      onModeChange={setMode}
      onToggleGoal={toggleGoal}
      onFileChange={() => {}}
      onNext={() => {}}
      onSkip={() => {}}
    />
  )
}
