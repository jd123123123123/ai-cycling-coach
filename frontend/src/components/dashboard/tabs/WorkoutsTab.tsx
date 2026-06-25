import { useState } from 'react'
import WorkoutsList from '../../workouts/WorkoutsList'
import WorkoutDetail from '../../workouts/WorkoutDetail'

export default function WorkoutsTab() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  return selectedKey === null ? (
    <WorkoutsList onOpen={setSelectedKey} />
  ) : (
    <WorkoutDetail workoutKey={selectedKey} onBack={() => setSelectedKey(null)} />
  )
}
