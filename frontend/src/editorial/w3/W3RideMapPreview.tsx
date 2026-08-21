import W3RideMapView from './W3RideMapView'
import { MARATONA, MARATONA_GRADES } from './maratonaFixture'

/** TEMP preview — the real Maratona dles Dolomites course, no backend.
 *  `/e/w3-ride-map-preview` is unguarded, like every other W3 preview route.
 *  A real Alpine track rather than a synthetic loop, because switchbacks are
 *  the only thing that shows whether a route drawing is honest. */

export default function W3RideMapPreview() {
  return <W3RideMapView polyline={MARATONA} grades={MARATONA_GRADES} onBack={() => {}} />
}
