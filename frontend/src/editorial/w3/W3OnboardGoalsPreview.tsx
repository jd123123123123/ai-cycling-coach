import { useState } from 'react'
import W3OnboardGoalsView, { type W3YearGoals } from './W3OnboardGoalsView'

/** TEMP preview — /e/w3-onboard-goals-preview (unguarded, no persistence). */
export default function W3OnboardGoalsPreview() {
  // fixture: local state only; the wired Page persists (localStorage + best-effort backend).
  const [goals, setGoals] = useState<W3YearGoals>({
    distanceKm: 8000,
    daysPerWeek: 4,
    trainingDays: ['tue', 'thu', 'sat', 'sun'],
    longRideDays: ['sat'],
  })
  return (
    <W3OnboardGoalsView
      goals={goals}
      onChange={(p) => setGoals((g) => ({ ...g, ...p }))}
      onNext={() => {}}
      onSkip={() => {}}
    />
  )
}
