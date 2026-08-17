import { W3RiderOnboarding } from './W3AvatarOnboardPage'

/**
 * W3 · Onboarding — der Rider-Schritt. Route /e/w3-onboard-rider.
 *
 * Das ist jetzt derselbe Flow wie /e/w3-avatar-onboard, nur mit einem anderen
 * nächsten Schritt. Vorher lag hier ein ZWEITER, schlechterer Rider-Flow:
 *
 *  - Er verlangte DREI Fotos (Selfie, Bike, Helm) und lud sie in EINEM Aufruf
 *    an `POST /garage/rider/compose` hoch. Genau das hat der Owner beanstandet:
 *    erst der Avatar, dann die Belohnung — nicht alles gleichzeitig.
 *  - Er las die Dateien mit `FileReader` RAW ein: kein Downscale, keine
 *    HEIC-Behandlung. Drei Handyfotos ergeben zweistellige MB an base64 und
 *    laufen gegen das `max_length=12_000_000` des Endpunkts — das ist die
 *    wahrscheinlichste Ursache des gemeldeten „Rider Studio ist nicht
 *    verfügbar".
 *  - Sein Ergebnis landete nur in `users.avatar_url` und NICHT in der Garage,
 *    also sah jede Fläche, die inzwischen die Garage liest, weiterhin keinen
 *    Rider.
 *
 * Der Avatar-Flow kann all das bereits richtig: ein Foto, heruntergerechnet,
 * über `/garage/asset/render` (kind:'rider') persistiert, mit dem Generating-
 * Screen und dem AVATAR-UNLOCKED-Reveal auf dem NEUEN Avatar. Zwei divergente
 * Wege zum selben Ziel zu pflegen wäre der eigentliche Fehler gewesen.
 */
export default function W3OnboardRiderPage() {
  return <W3RiderOnboarding next="/e/w3-onboard-plan" />
}
