import { useEffect, useState } from 'react'
import { renderStoryCard, type StoryData } from './w3share'
import { T } from './w3tokens'

/** Backend-free preview of the 9:16 story card — /e/w3-story-preview.
 *  Paints the REAL painter so the card can be judged as an image, which is the
 *  only way to know a canvas is right. Values mirror pen frame `sYlFV`. */

const D: StoryData = {
  handle: '@jannis_d',
  badge: 'W3 ANALYSE',
  lead: 'Schnellste Rheinschleife',
  emphasis: 'seit Mai — bei 4 °C weniger.',
  bigValue: '52,4',
  bigUnit: 'km',
  stats: [
    { v: '1:47:32', l: 'BEWEGTE ZEIT' },
    { v: '612', l: 'HÖHENMETER' },
  ],
  series: Array.from({ length: 34 }, (_, i) => 0.35 + 0.6 * Math.abs(Math.sin(i / 3.1))),
  footer: '24. AUG 2026 · 8,1 °C · GEGENWIND',
  // A real photograph, to prove the full-bleed path and the scrim over it.
  photo: '/w3/example-rider.webp',
}

export default function W3StoryPreview() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { renderStoryCard(D).then((r) => setUrl(r.dataUrl || null)) }, [])

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, display: 'grid', placeItems: 'center', padding: 16 }}>
      {url
        ? <img src={url} alt="Story-Karte" style={{ width: '100%', maxWidth: 360, borderRadius: 14 }} />
        : <span style={{ color: T.quiet, fontSize: 13 }}>zeichne…</span>}
    </div>
  )
}
