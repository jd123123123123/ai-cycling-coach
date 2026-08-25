import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import W3ThresholdProposal from './W3ThresholdProposal'
import W3StatusBar from './W3StatusBar'
import { THRESHOLD_PROPOSAL_KEY } from '../../hooks/useThresholdProposal'
import { T, FONT } from './w3tokens'
import './w3.css'

/**
 * TEMP preview — /e/w3-threshold-preview, unguarded and backend-free.
 *
 * It seeds the real query cache and renders the REAL component, rather than a
 * lookalike built from the same parts: a preview that composes the screen
 * differently is how a live surface drifts away from the design it was signed
 * off on. `?down` shows the case that is easiest to get wrong — a threshold
 * that FELL, which has to be surfaced without reading as a telling-off.
 */
export default function W3ThresholdPreview() {
  const qc = useQueryClient()
  const [ready, setReady] = useState(false)
  const down = new URLSearchParams(window.location.search).has('down')

  useEffect(() => {
    qc.setQueryData(THRESHOLD_PROPOSAL_KEY, down
      ? {
        available: true,
        current_watts: 285, proposed_watts: 262, delta_watts: -23, delta_pct: -8.1,
        direction: 'down', confidence: 'moderate',
        headline: 'Deine Zonen passen nicht mehr.',
        body: 'Deine Schwelle sieht aktuell nach 262 W aus, wir rechnen aber mit 285 W. '
          + 'Das passiert nach Krankheit, einer Pause oder einem harten Block — und solange '
          + 'die Zahl zu hoch steht, sind alle Einheiten zu hart angesetzt.',
        evidence: [
          { kind: 'model', watts: 262,
            text: 'Dein Leistungs-Dauer-Modell aus 24 Fahrten kommt auf 262 W.' },
        ],
      }
      : {
        available: true,
        current_watts: 250, proposed_watts: 280, delta_watts: 30, delta_pct: 12.0,
        direction: 'up', confidence: 'high',
        headline: 'Du bist stärker geworden.',
        body: 'Deine Schwelle sieht nach 280 W aus — 30 W mehr als die 250 W, mit denen wir '
          + 'bisher rechnen. Übernehmen wir das, verschieben sich deine Zonen und jede '
          + 'kommende Einheit rechnet mit der neuen Zahl.',
        evidence: [
          { kind: 'test_effort', watts: 280,
            text: 'Deine beste 20-Minuten-Leistung am 20.08.: 295 W. Mal 0,95 ergibt 280 W.' },
          { kind: 'model', watts: 277,
            text: 'Dein Leistungs-Dauer-Modell aus 31 Fahrten kommt auf 277 W.' },
        ],
      })
    setReady(true)
  }, [qc, down])

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        {ready && <W3ThresholdProposal />}
      </div>
    </div>
  )
}
