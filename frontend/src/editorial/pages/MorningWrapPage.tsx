import MorningDeckView from '../morning/MorningDeckView'
import { MORNING_WRAP_FIXTURE } from '../morning/fixture'

/**
 * `/e/morning` — Flagship Morning Wrap.
 *
 * No `EditorialRoot` here, unlike the other `/e/*` screens: that shell is a
 * scrolling 100dvh-MINIMUM column with its own safe-area padding, and this
 * deck needs a 100dvh-EXACT box it can absolutely position two pieces of
 * chrome against. `.morning-root` is that box, and it carries `editorial-root`
 * as well, so every reused component still resolves the same tokens. This is
 * the arrangement `/e/archive` already uses for the same reason.
 *
 * Still on the fixture: the adapter needs overnight HRV/respiration/skin-temp
 * bands and a sleep hypnogram, none of which `useTodayModel` exposes yet.
 * `MorningDeckView` takes its whole model as a prop so the composition can be
 * signed off before that work, and so the adapter is written once.
 */
export default function MorningWrapPage() {
  return <MorningDeckView model={MORNING_WRAP_FIXTURE} />
}
