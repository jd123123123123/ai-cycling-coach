import { useEffect, useMemo, useState } from 'react'
import { STARTER_BIKE } from './starterBike'
import {
  renderStoryCard, canShareImage, laufbandStrings, type StoryTextZone,
  type ShareAngle, type PosterData, type StoryData, type StoryLayout,
} from './w3share'
import W3ShareView, { type W3ShareVm, type EditField } from './W3ShareView'
import { STORY_FORMATS } from './w3storyEdit'
import { useRouteSnapshot } from './useRouteSnapshot'
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

/**
 * `?grid` — every template at once, side by side.
 *
 * Judging a card family one navigation at a time is how a set drifts: you fix
 * the one in front of you and never see it against its siblings. This renders
 * all of them from the SAME story at a size you can actually read, which is
 * the only way to catch "these two disagree about where the footer sits".
 */
function TemplateGrid({ story }: { story: StoryData }) {
  const [shots, setShots] = useState<{ id: StoryLayout; name: string; url: string }[]>([])
  useEffect(() => {
    let alive = true
    void (async () => {
      const out: { id: StoryLayout; name: string; url: string }[] = []
      for (const f of STORY_FORMATS) {
        const r = await renderStoryCard({ ...story, layout: f.id }, { scale: 0.42 })
        if (!alive) return
        out.push({ id: f.id, name: f.name, url: r.dataUrl })
        setShots([...out])
      }
    })()
    return () => { alive = false }
  }, [story])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12, background: T.bg }}>
      {shots.map((s2) => (
        <div key={s2.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <img src={s2.url} alt={s2.name} style={{ width: 227, display: 'block', borderRadius: 8 }} />
          <span style={{ fontSize: 11, color: '#fff', fontFamily: 'sans-serif' }}>{s2.name}</span>
        </div>
      ))}
    </div>
  )
}

export default function W3SharePreview() {
  const [angle, setAngle] = useState<ShareAngle>('rekord')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [generating, setGenerating] = useState(false)
  const [zones, setZones] = useState<StoryTextZone[]>([])
  const [thumbs, setThumbs] = useState<Partial<Record<StoryLayout, string>>>({})
  // The harness drives the REAL controls. It used to pin `format: 'full'` and
  // pass no `onPickFormat`, which meant the one screen that exists to exercise
  // this view could not reach five of its six layouts — and the Laufband, whose
  // whole point is that it moves, was unreachable in the only place it moves.
  const [format, setFormat] = useState<StoryLayout>('wrap')
  const [edits, setEdits] = useState<Partial<Record<EditField, string>>>({})
  //: The harness carries the SAME ground the real screen does — the route on
  //: the map. Without it every template was audited over flat black, which
  //: flatters some layouts and condemns others for a fault they do not have.
  const { image: routeShot, rig: routeRig } = useRouteSnapshot(PREVIEW_BLOCK_DATA.polyline)

  //: The card the harness is currently describing. Held as data rather than
  //: rebuilt inside the effect so the Laufband strings and the bitmap are
  //: built from one object.
  const story = useMemo<StoryData>(() => {
    const p = build(angle)
    const on = (k: EditField, fallback: string) => {
      const v = edits[k]
      return v != null && v.trim() !== '' ? v : fallback
    }
    return {
      layout: format,
      handle: p.handle, badge: 'RIDR ANALYSE',
      lead: on('lead', p.sentence.split(' — ')[0] ?? p.sentence),
      emphasis: on('emphasis', p.sentence.split(' — ').slice(1).join(' — ')),
      bigValue: p.bigValue, bigUnit: p.bigUnit,
      stats: [{ v: p.stats[0].v, l: p.stats[0].l }, { v: p.stats[1].v, l: p.stats[1].l }],
      series: Array.from({ length: 48 }, (_, i) => 0.34 + 0.6 * Math.abs(Math.sin(i / 4.3))),
      footer: p.footer, photo: routeShot, groundIsRoute: !!routeShot, polyline: p.polyline,
      routeName: on('routeName', 'Harzrunde'),
      dateline: on('dateline', p.footer),
      ticker: on('ticker', p.sentence),
      readings: [{ v: '29,2 km/h', l: 'Ø Tempo' }, { v: '234', l: 'Ø Leistung' }, { v: '172', l: 'Puls Ø' }],
    }
  }, [angle, format, edits, routeShot])

  useEffect(() => {
    let alive = true
    setGenerating(true)
    // The STORY card, not the retired poster — the harness must show the same
    // object the real screen sends, or it is a preview of nothing.
    renderStoryCard(story)
      .then((o) => { if (alive) { setDataUrl(o.dataUrl || null); setBlob(o.blob); setZones(o.zones) } })
      .finally(() => { if (alive) setGenerating(false) })
    return () => { alive = false }
  }, [story])

  // The picker's own tiles — the same idle pass the real page runs.
  useEffect(() => {
    let alive = true
    const idle = (fn: () => void) =>
      typeof requestIdleCallback === 'function' ? requestIdleCallback(fn) : setTimeout(fn, 120)
    idle(async () => {
      for (const f of STORY_FORMATS) {
        if (!alive) return
        const out = await renderStoryCard({ ...story, layout: f.id }, { scale: 0.16 })
        if (!alive) return
        if (out.dataUrl) setThumbs((prev) => ({ ...prev, [f.id]: out.dataUrl }))
      }
    })
    return () => { alive = false }
  }, [story])

  const vm: W3ShareVm = {
    posterDataUrl: dataUrl,
    zones,
    thumbs,
    generating,
    activeAngle: angle,
    hasOwnPhoto: false,
    canShare: canShareImage(),
    // The four controls the real screen now offers, so the harness exercises
    // them rather than the retired block picker.
    format,
    laufband: laufbandStrings(story),
    edits,
    defaults: {
      routeName: 'Harzrunde', dateline: story.footer, lead: story.lead,
      emphasis: story.emphasis, ticker: story.ticker,
    },
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

  // `?grid` shows every template side by side — see `TemplateGrid`.
  const grid = typeof window !== 'undefined' && window.location.search.includes('grid')
  if (grid) return <>{routeRig}<TemplateGrid story={story} /></>

  return (
    <>
    {routeRig}
    <W3ShareView
      vm={vm}
      onClose={() => history.back()}
      onDownload={() => { if (blob) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = 'w3-ride.png'; a.click(); URL.revokeObjectURL(u) } }}
      onSelectAngle={setAngle}
      onPickFormat={setFormat}
      onEditText={(field, value) => setEdits((prev) => ({ ...prev, [field]: value }))}
      onShare={() => {}}
      onCrew={() => { location.assign('/e/w3-crew') }}
      onLink={() => {}}
    />
    </>
  )
}
