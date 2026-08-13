import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { markW3OnboardingSeen } from './w3Onboarding'
import W3OnboardPlanView, { planReady, type W3PlanMode, type W3GoalKey } from './W3OnboardPlanView'

/**
 * W3 · Onboarding — Training plan, wired. Route /e/w3-onboard-plan.
 *
 * The rider picks how they want to train. State lives here; the choice is
 * persisted to localStorage under 'w3_training_plan'.
 *
 * PERSISTENCE IS LOCAL-ONLY INTENT. There is no backend contract for a
 * multi-select focus list or for a user-uploaded plan file, and per the brief
 * we do NOT invent one. The athlete/goals API (TrainingGoals) has no focus-area
 * or plan-file field, so writing focus areas there would be fabricating a shape
 * the server doesn't define. We therefore only record the rider's intent
 * locally — enough for later screens to read "what did they choose" — and the
 * uploaded File is never sent anywhere (no upload endpoint exists); we keep
 * only its name/type/size as a marker of intent.
 */

const KEY = 'w3_training_plan'

interface StoredPlan {
  mode: W3PlanMode
  goals: W3GoalKey[]
  file: { name: string; type: string; size: number } | null
  savedAt: string
}

function persist(plan: StoredPlan) {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan))
  } catch {
    /* best-effort — a blocked write just means the choice isn't remembered locally */
  }
}

export default function W3OnboardPlanPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<W3PlanMode | null>(null)
  const [goals, setGoals] = useState<W3GoalKey[]>([])
  const [file, setFile] = useState<File | null>(null)

  const toggleGoal = (g: W3GoalKey) => {
    setGoals((prev) => {
      if (prev.includes(g)) return prev.filter((x) => x !== g)
      if (prev.length >= 3) return prev // cap at 3
      return [...prev, g]
    })
  }

  const skip = () => {
    markW3OnboardingSeen()
    navigate('/e/w3-today', { replace: true })
  }

  const next = () => {
    if (!mode || !planReady(mode, goals)) return
    persist({
      mode,
      goals: mode === 'build' ? goals : [],
      file: mode === 'own' && file ? { name: file.name, type: file.type, size: file.size } : null,
      savedAt: new Date().toISOString(),
    })
    navigate('/e/w3-onboard-goals')
  }

  return (
    <W3OnboardPlanView
      mode={mode}
      goals={goals}
      onModeChange={setMode}
      onToggleGoal={toggleGoal}
      onFileChange={setFile}
      onNext={next}
      onSkip={skip}
    />
  )
}
