import { Navigate, useNavigate } from 'react-router-dom'
import { useWeekReviewVm } from './useWeekReviewVm'
import W3WeekReviewView from './W3WeekReviewView'
import W3Loading from './W3Loading'

/**
 * W3 · WOCHENRÜCKBLICK, wired. Route `/e/w3-week-review`.
 *
 * The whole plan-vs-actual producer — both acts, all five sources — lives in
 * `useWeekReviewVm`, because the Today card's celebration popup
 * (`W3WeekRecapCard`) tells the same story and the two must never be able to
 * disagree about the rider's own week. This file is now only the route: fetch
 * through the shared hook, and decide what a failure looks like.
 *
 * A failed recap read must not strand the rider on a spinner — the moment is
 * optional, so we send them where they were going.
 */
export default function W3WeekReviewPage() {
  const navigate = useNavigate()
  const { vm, isLoading, isError } = useWeekReviewVm()

  if (isError) return <Navigate to="/e/w3-today" replace />
  if (isLoading || !vm) return <W3Loading label="Deine Woche wird zusammengefasst…" />

  return (
    <W3WeekReviewView
      vm={vm}
      onClose={() => navigate('/e/w3-today')}
      onStart={() => navigate('/e/w3-today')}
      onFullPlan={() => navigate('/e/w3-plan')}
    />
  )
}
