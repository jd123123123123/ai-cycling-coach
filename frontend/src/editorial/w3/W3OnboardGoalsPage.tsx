import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateGoals, updateProfile } from '../../api/athletes'
import type { DaysAvailableFlags } from '../../types/athlete'
import { markW3OnboardingSeen } from './w3Onboarding'
import W3OnboardGoalsView, { WEEKDAYS, type W3YearGoals, type Weekday } from './W3OnboardGoalsView'

/**
 * W3 · Onboarding — "Set your year", wired. Route /e/w3-onboard-goals.
 *
 * PERSISTENCE — honest note on where each field lands:
 *   • The whole plan is written to localStorage under `w3_year_goals`. This is
 *     the source of truth for the yearly *distance* target, which has NO backend
 *     column — it is LOCAL-ONLY by design (no invented endpoint).
 *   • Best-effort, we also mirror the parts the backend already models:
 *       – training days + the (first) long-ride day → profile.days_available
 *         (DaysAvailableFlags) via updateProfile.
 *       – days-per-week → goals.days_per_week via updateGoals.
 *     These are fire-and-once awaits wrapped in try/catch; a failure never traps
 *     the rider — navigation always proceeds.
 */

const STORAGE_KEY = 'w3_year_goals'

const DEFAULT_GOALS: W3YearGoals = {
  distanceKm: 8000,
  daysPerWeek: 4,
  trainingDays: ['tue', 'thu', 'sat', 'sun'],
  longRideDays: ['sat'],
}

function loadGoals(): W3YearGoals {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_GOALS
    const parsed = JSON.parse(raw) as Partial<W3YearGoals>
    const valid = new Set(WEEKDAYS.map((d) => d.key))
    const clean = (arr: unknown): Weekday[] =>
      Array.isArray(arr) ? WEEKDAYS.map((d) => d.key).filter((k) => (arr as string[]).includes(k) && valid.has(k)) : []
    return {
      distanceKm: typeof parsed.distanceKm === 'number' ? parsed.distanceKm : DEFAULT_GOALS.distanceKm,
      daysPerWeek: typeof parsed.daysPerWeek === 'number' ? parsed.daysPerWeek : DEFAULT_GOALS.daysPerWeek,
      trainingDays: parsed.trainingDays ? clean(parsed.trainingDays) : DEFAULT_GOALS.trainingDays,
      longRideDays: parsed.longRideDays ? clean(parsed.longRideDays) : DEFAULT_GOALS.longRideDays,
    }
  } catch {
    return DEFAULT_GOALS
  }
}

function saveLocal(goals: W3YearGoals): void {
  // Local-only persistence — see the file header. Best-effort; a blocked write
  // (private mode / SSR) simply isn't stored.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
  } catch {
    /* ignore */
  }
}

function toDaysAvailable(goals: W3YearGoals): DaysAvailableFlags {
  const has = (d: Weekday) => goals.trainingDays.includes(d)
  return {
    mon: has('mon'), tue: has('tue'), wed: has('wed'), thu: has('thu'),
    fri: has('fri'), sat: has('sat'), sun: has('sun'),
    // The backend models a single long day; we persist the first of the
    // rider's picks and keep the full list in localStorage.
    long_day: goals.longRideDays[0] ?? null,
  }
}

export default function W3OnboardGoalsPage() {
  const navigate = useNavigate()
  const [goals, setGoals] = useState<W3YearGoals>(loadGoals)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<W3YearGoals>) => setGoals((g) => ({ ...g, ...p }))

  const persist = async (g: W3YearGoals) => {
    saveLocal(g)
    // Best-effort backend mirror — never blocks the flow on failure.
    try {
      await Promise.allSettled([
        updateProfile({ days_available: toDaysAvailable(g) }),
        updateGoals({ days_per_week: g.daysPerWeek }),
      ])
    } catch {
      /* offline / not-yet-provisioned — the local copy still holds the plan */
    }
  }

  const next = async () => {
    setSaving(true)
    await persist(goals)
    setSaving(false)
    navigate('/e/w3-onboard-rewards')
  }

  const skip = () => {
    saveLocal(goals)
    markW3OnboardingSeen()
    navigate('/e/w3-today', { replace: true })
  }

  return (
    <W3OnboardGoalsView
      goals={goals}
      onChange={patch}
      onNext={next}
      onSkip={skip}
      saving={saving}
    />
  )
}
