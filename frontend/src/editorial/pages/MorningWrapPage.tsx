import EditorialRoot from '../EditorialRoot'
import MorningWrapView from './MorningWrapView'
import { MORNING_WRAP_FIXTURE } from './morningWrapFixture'

/**
 * `/e/morning` — Flagship Morning Wrap.
 *
 * Still on the fixture: the adapter needs overnight HRV/respiration/skin-temp
 * bands and a sleep hypnogram, none of which `useTodayModel` exposes yet.
 * `MorningWrapView` takes its whole model as a prop so the composition can be
 * signed off before that work, and so the adapter is written once.
 */
export default function MorningWrapPage() {
  return (
    <EditorialRoot state="resting">
      <MorningWrapView model={MORNING_WRAP_FIXTURE} />
    </EditorialRoot>
  )
}
