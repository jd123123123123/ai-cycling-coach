import TodayPostRideReview from './TodayPostRideReview'

/**
 * MorningRecap — the single "yesterday" card on Today: yesterday's logged
 * ride, read back as a post-ride review.
 *
 * The post-recovery-review card ("Erholung blieb aus.") was removed: it
 * restated today's recovery verdict — already owned once by the hero ring +
 * its "why" chips, the AdaptiveDirectiveCard, and the CoachBrief paragraph —
 * so a fourth recovery callout here was pure duplication. A skipped/rest day
 * already shows up in today's lower load / higher TSB on the hero.
 */
export default function MorningRecap() {
  return <TodayPostRideReview />
}
