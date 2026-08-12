import W3ChallengesView, { type W3ChallengesVm } from './W3ChallengesView'
import { CHALLENGES_FIXTURE } from './W3ChallengesPreview'

/**
 * W3 · 08 CHALLENGES, route /e/w3-challenges.
 *
 * This Page passes honest FIXTURES. The reward economy the pen depicts — POWER
 * payouts, the "Hot Streak" monthly personal challenge, the global community
 * challenges with cover art and "top X%", and the open-to-join catalogue — is
 * NOT built in the backend. The real seam is `useCrewChallenges()` (from
 * `hooks/useChallenges.ts`): crew-scoped goals scoring each member against a
 * target (metric/target/period + per-member `pct`/`reached`). That maps to the
 * community-card *shape* (a bar toward a target with a personal standing) but
 * has no reward, cover image, monthly-personal, or "% of the whole community"
 * concept — so wiring it here would misrepresent the data. When the reward
 * layer lands, replace this constant with a `useMemo` over the hook, mirroring
 * `W3RidesPage`.
 */

export default function W3ChallengesPage() {
  const vm: W3ChallengesVm = CHALLENGES_FIXTURE
  return <W3ChallengesView vm={vm} />
}
