import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useLanguage } from '../../contexts/LanguageContext'
import PostRideReview from './PostRideReview'

/**
 * TodayPostRideReview — top-of-page wrapper that renders the post-ride review
 * when the athlete trained today. The brief already attaches `post_ride_review`
 * when an activity is logged for the current day; CoachBrief swaps its
 * workout card for the same review internally — this wrapper promotes it
 * above TodayHero so the *first* thing the athlete sees is "yesterday's ride
 * landed like this," not a generic readiness number.
 *
 * Renders nothing when there's no review (no ride today / brief not loaded /
 * older brief shape without the field).
 */
export default function TodayPostRideReview() {
  const { data: brief } = useCoachBrief()
  const { language } = useLanguage()
  const review = brief?.post_ride_review ?? null
  if (!review) return null
  return <PostRideReview review={review} language={language} />
}
