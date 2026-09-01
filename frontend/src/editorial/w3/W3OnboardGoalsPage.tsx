import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateGoals, updateProfile } from '../../api/athletes'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
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
 *
 * IT OPENS ON THE ANSWER THE RIDER ALREADY GAVE. The step before this one
 * (`/e/w3-onboard-goal`, hours branch) asks which days they ride and writes
 * them to `days_available` — and this screen used to open on a hardcoded
 * tue/thu/sat/sun regardless, so the rider was asked the same question twice
 * and the second answer silently overwrote the first. Seeding from the profile
 * makes the two screens agree: the days arrive already ticked, and what is
 * genuinely new here (the yearly distance, the long-ride day) is what is left
 * to answer.
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

/** The days the previous step wrote, as this screen's own shape. */
function fromDaysAvailable(flags: DaysAvailableFlags): Weekday[] {
  return WEEKDAYS.map((d) => d.key).filter((k) => flags[k as keyof DaysAvailableFlags] === true)
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
  const { data: profile } = useAthleteProfile()

  // ONCE, AND ONLY OVER UNTOUCHED DEFAULTS. The profile arrives after first
  // paint, so the seed has to be an effect — but it must not fight the rider:
  // it runs a single time, and only if they have not already edited the days
  // on this screen. A late server response overwriting a live selection would
  // trade one lost answer for another.
  const seeded = useRef(false)
  const touched = useRef(false)
  useEffect(() => {
    if (seeded.current || touched.current) return
    const flags = profile?.days_available
    if (!flags) return
    const days = fromDaysAvailable(flags)
    if (days.length === 0) return
    seeded.current = true
    setGoals((g) => ({
      ...g,
      trainingDays: days,
      daysPerWeek: days.length,
      // The backend models one long day; honour it when it is set and is a day
      // they actually ride, otherwise leave their local pick alone.
      longRideDays: flags.long_day && days.includes(flags.long_day) ? [flags.long_day] : g.longRideDays,
    }))
  }, [profile])

  const patch = (p: Partial<W3YearGoals>) => {
    if (p.trainingDays || p.longRideDays || p.daysPerWeek !== undefined) touched.current = true
    setGoals((g) => ({ ...g, ...p }))
  }

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
