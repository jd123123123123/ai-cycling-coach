import MissedYesterdayChip from './MissedYesterdayChip'
import TodayPostRecoveryReview from './TodayPostRecoveryReview'
import TodayPostRideReview from './TodayPostRideReview'

/**
 * MorningRecap — single mount point for the three mutually-exclusive
 * "yesterday" cards on Today. Each child gates itself; at most one renders.
 *
 *   TodayPostRideReview       → yesterday's logged ride had a post-ride review
 *   TodayPostRecoveryReview   → yesterday was a planned rest / recovery day
 *   MissedYesterdayChip       → yesterday had a real prescription you skipped
 *
 * Order matters: a logged ride wins over a "planned rest" classification,
 * and a planned rest wins over the missed-yesterday fallback (since a real
 * rest day shouldn't trigger the miss chip). The child guards already encode
 * this priority — wrapping them here keeps TodayTab declarative.
 */
export default function MorningRecap() {
  return (
    <>
      <TodayPostRideReview />
      <TodayPostRecoveryReview />
      <MissedYesterdayChip />
    </>
  )
}
