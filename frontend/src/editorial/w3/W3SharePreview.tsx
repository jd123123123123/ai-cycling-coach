import { useEffect, useState } from 'react'
import { STARTER_BIKE } from './starterBike'
import { renderSharePoster, canShareImage, type ShareAngle, type PosterData } from './w3share'
import W3ShareView, { type W3ShareVm } from './W3ShareView'

/** TEMP preview harness — renders W3ShareView with a pen-faithful fixture, no
 *  backend. Route /e/w3-share-preview is unguarded. Mirrors pen `oLeCk` +
 *  the ShareCard variants (nYrIu/R73uSK/qKdV0). Remove before merge. */

// A synthetic winding GPX track (lat/lng) so the poster's route reads real.
const POLY: [number, number][] = Array.from({ length: 40 }, (_, i) => {
  const t = i / 39
  return [51.74 + 0.05 * Math.sin(t * 6) + t * 0.02, 10.6 + t * 0.12 + 0.03 * Math.cos(t * 5)]
})

function build(angle: ShareAngle): PosterData {
  const common = {
    angle, handle: '@jannis_d', club: 'So, 24. August',
    polyline: POLY, bikeSrc: STARTER_BIKE, avatarUrl: null, avatarInitial: 'J',
    footer: 'Harzrunde · So, 24. August',
  }
  if (angle === 'fahrt') return {
    ...common,
    kicker: 'GANZE FAHRT · HARZRUNDE', bigValue: '118', bigUnit: 'km', delta: null,
    sentence: 'Die längste Runde seit dem Frühjahr.',
    pills: [{ text: 'Längste', sub: 'seit April', tone: 'acid' }, { text: '3 Bestzeiten', sub: 'an Segmenten', tone: 'violet' }],
    stats: [{ v: '2.140', l: 'HÖHENMETER' }, { v: '4:52', l: 'STUNDEN' }, { v: '24,2', l: 'KM/H Ø' }],
  }
  if (angle === 'leistung') return {
    ...common,
    kicker: 'BESTE 20 MINUTEN', bigValue: '271', bigUnit: 'Watt', delta: null,
    sentence: 'So stark warst du seit Mai nicht mehr.',
    pills: [{ text: '+9 Watt', sub: 'gegen Mai', tone: 'acid' }, { text: 'Ø 158', sub: 'Herzfrequenz', tone: 'violet' }],
    stats: [{ v: '248', l: 'NORMALISIERT' }, { v: '0,86', l: 'INTENSITÄT' }, { v: '4:52', l: 'STUNDEN' }],
  }
  return {
    ...common,
    kicker: 'SEGMENT-REKORD · SONNENBERG', bigValue: '18:42', bigUnit: '', delta: '1:12',
    sentence: 'Schneller als je zuvor da hoch.',
    pills: [{ text: '3 PRs', sub: 'an einem Tag', tone: 'acid' }, { text: 'Längste', sub: 'seit April', tone: 'violet' }],
    stats: [{ v: '118', l: 'KM' }, { v: '2.140', l: 'HÖHENMETER' }, { v: '4:52', l: 'STUNDEN' }],
  }
}

export default function W3SharePreview() {
  const [angle, setAngle] = useState<ShareAngle>('rekord')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let alive = true
    setGenerating(true)
    renderSharePoster(build(angle))
      .then((o) => { if (alive) { setDataUrl(o.dataUrl || null); setBlob(o.blob) } })
      .finally(() => { if (alive) setGenerating(false) })
    return () => { alive = false }
  }, [angle])

  const vm: W3ShareVm = {
    posterDataUrl: dataUrl,
    generating,
    activeAngle: angle,
    hasOwnPhoto: false,
    canShare: canShareImage(),
    angles: [
      { id: 'rekord', label: 'Segment-PR', sub: 'Sonnenberg' },
      { id: 'fahrt', label: 'Beste Fahrt', sub: 'Harzrunde' },
      { id: 'leistung', label: 'Beste 20 min', sub: '271 W' },
    ],
  }

  return (
    <W3ShareView
      vm={vm}
      onClose={() => history.back()}
      onDownload={() => { if (blob) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = 'w3-ride.png'; a.click(); URL.revokeObjectURL(u) } }}
      onSelectAngle={setAngle}
      onShare={() => {}}
      onStory={() => {}}
      onCrew={() => { location.hash = '#/e/w3-crew' }}
      onLink={() => {}}
    />
  )
}
