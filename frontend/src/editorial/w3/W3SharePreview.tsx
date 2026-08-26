import { useEffect, useState } from 'react'
import { STARTER_BIKE } from './starterBike'
import { renderStoryCard, canShareImage, type ShareAngle, type PosterData } from './w3share'
import W3ShareView, { type W3ShareVm } from './W3ShareView'
import { T } from './w3tokens'

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
    blockData: PREVIEW_BLOCK_DATA,
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

//: Three blocks, and enough of a ride behind them to draw all three — the
//: harness exists to show the card, and a card with empty blocks shows nothing.
const PREVIEW_BLOCK_DATA = {
  power: Array.from({ length: 240 }, (_, i) =>
    140 + 70 * Math.sin(i / 9) + (i % 47 === 0 ? 260 : 0) + (i > 150 && i < 190 ? 120 : 0)),
  hr: Array.from({ length: 240 }, (_, i) => 118 + 34 * Math.sin(i / 22) + i / 14),
  altitude: Array.from({ length: 240 }, (_, i) => 40 + 30 * Math.sin(i / 30)),
  ftp: 265,
  peaks: [
    { label: '5 s', watts: 596, best: 640, isPr: false },
    { label: '1 min', watts: 412, best: 412, isPr: true },
    { label: '5 min', watts: 318, best: 344, isPr: false },
    { label: '20 min', watts: 279, best: 291, isPr: false },
  ],
  // A loop, so the route block has something real to draw when it is picked.
  polyline: Array.from({ length: 80 }, (_, i) => {
    const a = (i / 79) * Math.PI * 2
    return [51.80 + 0.06 * Math.sin(a) + 0.014 * Math.sin(a * 3),
            10.62 + 0.09 * Math.cos(a) + 0.02 * Math.cos(a * 2)] as [number, number]
  }),
  // Filled, because a preview whose blocks are empty drops them and then shows
  // exactly what this harness exists to prove it can draw.
  stats: [{ v: '8,1', l: 'W/KG SPITZE' }, { v: '96', l: 'TSS' }, { v: '1:53', l: 'STUNDEN' }],
  pills: [{ text: '3 PRs', sub: 'an einem Tag', tone: 'acid' as const },
          { text: 'Längste', sub: 'Fahrt im Block', tone: 'violet' as const }],
}

export default function W3SharePreview() {
  const [angle, setAngle] = useState<ShareAngle>('rekord')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let alive = true
    setGenerating(true)
    // The STORY card, not the retired poster — the harness must show the same
    // object the real screen sends, or it is a preview of nothing.
    const p = build(angle)
    renderStoryCard({
      layout: 'full',
      handle: p.handle, badge: 'W3 ANALYSE',
      lead: p.sentence.split(' — ')[0] ?? p.sentence,
      emphasis: p.sentence.split(' — ').slice(1).join(' — '),
      bigValue: p.bigValue, bigUnit: p.bigUnit,
      stats: [{ v: p.stats[0].v, l: p.stats[0].l }, { v: p.stats[1].v, l: p.stats[1].l }],
      series: [], footer: p.footer, photo: null, polyline: p.polyline,
      routeName: 'Harzrunde', dateline: p.footer,
    })
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
    // The four controls the real screen now offers, so the harness exercises
    // them rather than the retired block picker.
    format: 'full',
    accent: T.acid,
    values: ['distance', 'time', 'ascent'],
    availableValues: [
      { id: 'distance', label: 'Distanz', value: '52,4' },
      { id: 'time', label: 'Zeit', value: '1:47:32' },
      { id: 'ascent', label: 'Höhenmeter', value: '612' },
      { id: 'speed', label: 'Ø Tempo', value: '29,2 km/h' },
      { id: 'np', label: 'Ø Leistung', value: '234 W' },
      { id: 'hr', label: 'Puls', value: '172' },
    ],
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
      onCrew={() => { location.assign('/e/w3-crew') }}
      onLink={() => {}}
    />
  )
}
