import TodayPostRecoveryReview from './TodayPostRecoveryReview'
import TodayPostRideReview from './TodayPostRideReview'

/**
 * MorningRecap — single mount point for the mutually-exclusive "yesterday"
 * cards on Today. Each child gates itself; at most one renders.
 *
 *   TodayPostRideReview       → yesterday's logged ride had a post-ride review
 *   TodayPostRecoveryReview   → yesterday was a planned rest / recovery day
 *
 * Order matters: a logged ride wins over a "planned rest" classification.
 * The missed-yesterday chip was removed — a skipped session already shows up
 * in today's lower load / higher TSB (the hero's "why" chips), so a separate
 * callout was redundant noise.
 */
export default function MorningRecap() {
  return (
    <>
      <TodayPostRideReview />
      <TodayPostRecoveryReview />
    </>
  )
}
