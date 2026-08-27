import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { recapHasStory } from './useWeekReviewVm'
import { useWeeklyRecap } from '../../hooks/useWeeklyRecap'
import { claimGate } from './w3gates'

/**
 * W3 · Week-review auto-trigger.
 *
 * A render-null watcher, mounted once inside the Router next to
 * `W3RideCelebrationWatcher` and `W3SetupGate`. At the START of a new week it
 * opens the WOCHENRÜCKBLICK (`/e/w3-week-review`) exactly once — then not again
 * until the next week rolls over.
 *
 * The "seen" key is the reviewed week's own Monday (`recap.week_start`), not a
 * boolean: dismissing THIS week's review can never suppress next week's, and a
 * hard refresh cannot re-fire the same one. That is why localStorage is right
 * here where the setup gate uses sessionStorage — "I've read week 33" is a
 * fact about a week, not about a browser session, but it expires on its own the
 * moment week 34 begins. Nothing is silenced forever.
 *
 * Guards, so it can never hijack a session or nag:
 *  - only inside the W3 experience (`/e/w3-*`), never on the design previews;
 *  - never mid-onboarding, mid-session, or on the celebrate / share / auth
 *    screens it would step on — and never on the review route itself;
 *  - only in the FIRST DAYS of a new week: "last week" is a story with a short
 *    shelf life, and springing it on a Saturday would be strange. Later in the
 *    week the route is still reachable from the nav menu;
 *  - only when the week actually holds a story — at least one ride, or a plan
 *    it can be measured against. A rider with neither gets nothing;
 *  - once per week, recorded BEFORE navigating so a re-render or a second tab
 *    can't double-fire.
 *
 * Mount (App.tsx, inside <BrowserRouter>):
 *   import W3WeekReviewGate from './editorial/w3/W3WeekReviewGate'
 *   … <W3WeekReviewGate />
 */

const SEEN_KEY = 'w3.weekReviewSeen'
/** Mon / Tue / Wed. Day 0 is Monday in this (Mon-anchored) index. */
const REVIEW_WINDOW_DAYS = 3

const BLOCKED_PREFIXES = [
  '/e/w3-week-review',      // the destination itself
  '/e/w3-onboard',
  '/e/w3-avatar-onboard',
  '/e/w3-first-bike',
  '/e/w3-bike-studio',   // the step that replaced it: their own bike, photographed
  '/e/w3-connected',
  '/e/w3-ride-celebrate',   // don't step on a celebration
  '/e/w3-session',          // never interrupt a ride
  '/e/w3-share',
  '/e/w3-login',
  '/e/w3-register',
  '/e/w3-auth',
]

export default function W3WeekReviewGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading } = useAuth()
  const firedRef = useRef(false)

  const path = location.pathname
  const mondayIndex = (new Date().getDay() + 6) % 7
  const inWindow = mondayIndex < REVIEW_WINDOW_DAYS

  const eligible =
    !isLoading &&
    !!user &&
    inWindow &&
    path.startsWith('/e/w3-') &&
    !path.endsWith('-preview') &&
    !BLOCKED_PREFIXES.some((p) => path.startsWith(p))

  // Only fetched while the gate could actually fire — a logged-out or
  // out-of-window session never asks the server for a recap it won't show.
  const { data: recap } = useWeeklyRecap({ enabled: eligible, locale: 'de' })

  useEffect(() => {
    if (firedRef.current || !eligible || !recap) return

    // Nothing to review: no ride, and no plan to have missed.
    // One copy of this rule, and it is `recapHasStory` — this gate had its own
    // inline duplicate, which is how the guarded version and the unguarded one
    // came to disagree.
    const hasStory = recapHasStory(recap)
    if (!hasStory) { firedRef.current = true; return }

    let seen: string | null = null
    try { seen = localStorage.getItem(SEEN_KEY) } catch { /* private mode */ }
    if (seen === recap.week_start) { firedRef.current = true; return }

    // Record BEFORE navigating so a re-render / second tab can't double-fire.
    firedRef.current = true
    // One interruption per app open — the morning briefing outranks a look back
    // at last week, and two of them on one launch is the behaviour that makes
    // riders dread opening an app.
    if (!claimGate('weekReview')) return
    try { localStorage.setItem(SEEN_KEY, recap.week_start) } catch { /* ignore */ }
    navigate('/e/w3-week-review')
  }, [eligible, recap, navigate])

  return null
}
