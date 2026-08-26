import { useEffect, useState } from 'react'
import { renderStoryCard, type StoryData, type StoryLayout } from './w3share'
import { T, FONT } from './w3tokens'

/**
 * The four share formats, rendered side by side — /e/w3-story-preview.
 *
 * Paints the REAL painter four times, because a layout argument settled in
 * prose is a layout argument nobody has looked at. Values mirror pen `sYlFV`.
 */

const BASE: StoryData = {
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
  photo: '/w3/example-rider.webp',
  routeName: 'Rheinschleife',
  dateline: 'AUSFAHRT NR. 1284 · 24.08.2026',
  ticker: '— SCHNELLSTE SEIT MAI — NEUE BESTZEIT',
  readings: [
    { v: '29,2 km/h', l: 'Ø Tempo' },
    { v: '234', l: 'Ø Leistung, W' },
    { v: '172', l: 'Puls ⌀' },
  ],
  // A closed loop, so `trace` has a real shape to draw rather than a squiggle.
  polyline: Array.from({ length: 220 }, (_, i) => {
    const t = (i / 220) * Math.PI * 2
    const r = 0.05 + 0.014 * Math.sin(t * 3) + 0.008 * Math.cos(t * 5)
    return [50.6 + r * Math.sin(t), 7.2 + r * Math.cos(t) * 1.5] as [number, number]
  }),
}

const FORMATS: { id: StoryLayout; name: string; drops: string }[] = [
  { id: 'full', name: 'DIE KARTE', drops: 'sYlFV · C6Xn06 — Satz, Zahl, Werte, Verlauf' },
  { id: 'silent', name: 'OHNE WORTE', drops: 'abH9Z — dieselbe Karte, ohne den Satz' },
  { id: 'trace', name: 'DIE SPUR', drops: 'DJJ0P — Foto, Strecke, drei Werte' },
  { id: 'headline', name: 'M3 · LAUFBAND', drops: 'D1SQI — Titel, zwei laufende Bänder' },
  { id: 'viewfinder', name: 'M1 · TELEMETRIE-HUD', drops: 'BMzgQ — Raster, Ticks, Monospace' },
  { id: 'effort', name: 'K3 · EFFORT-KURVE', drops: 'pi5Hm — Satz oben, vier Werte, Fläche' },
]

export default function W3StoryPreview() {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    Promise.all(FORMATS.map(async (f) => {
      // `effort` is drawn in the pen's orange, which is also the proof that the
      // accent is a control rather than a constant.
      const r = await renderStoryCard({
        ...BASE, layout: f.id,
        accent: f.id === 'effort' ? T.warn : undefined,
      })
      return [f.id, r.dataUrl] as const
    })).then((pairs) => { if (alive) setUrls(Object.fromEntries(pairs)) })
    return () => { alive = false }
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, padding: 16, fontFamily: FONT }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {FORMATS.map((f) => (
          <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {urls[f.id]
              ? <img src={urls[f.id]} alt={f.name} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
              : <div style={{ width: '100%', aspectRatio: '9 / 16', borderRadius: 10, background: T.surface }} />}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: T.acid }}>{f.name}</span>
            <span style={{ fontSize: 9.5, fontWeight: 600, lineHeight: 1.35, color: T.quiet }}>{f.drops}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
