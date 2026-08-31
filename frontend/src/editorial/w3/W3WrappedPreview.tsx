import W3WrappedView from './W3WrappedView'
import { buildWrappedVm } from './w3wrapped'
import type { Wrapped } from '../../pages/WeeklyWrapped'

/** Backend-free preview — /e/w3-wrapped-preview. Feeds the REAL builder a
 *  payload shaped exactly like the endpoint's, so the deck under test is the
 *  deck that ships. */
const FIXTURE: Wrapped = {
  week_start: '2026-08-18',
  week_end: '2026-08-24',
  has_rides: true,
  totals: { sessions: 5, hours: 8.25, km: 214.6, tss: 486, active_days: 5, saddle_hm: '8h 15m' },
  planned_tss: 450,
  ctl_delta: 2.4,
  // A real closed loop so the route mark has a shape to draw.
  route: {
    points: Array.from({ length: 180 }, (_, i) => {
      const t = (i / 180) * Math.PI * 2
      const r = 0.05 + 0.016 * Math.sin(t * 3) + 0.009 * Math.cos(t * 5)
      return [50.6 + r * Math.sin(t), 7.2 + r * Math.cos(t) * 1.5] as [number, number]
    }),
    view: { w: 100, h: 100 }, n_points: 180, activity_id: 1, title: 'Rheinschleife', km: 214.6,
  },
  distance_comparison: 'Das ist Köln bis Frankfurt — und ein Stück zurück.',
  saddle_line: 'Acht Stunden. Ein Arbeitstag, nur mit besserer Aussicht.',
  daily_effort: [
    { key: 'mo', date: '2026-08-18', tss: 0, km: 0, sessions: 0, peak: false },
    { key: 'di', date: '2026-08-19', tss: 112, km: 48.2, sessions: 1, peak: false },
    { key: 'mi', date: '2026-08-20', tss: 64, km: 31.0, sessions: 1, peak: false },
    { key: 'do', date: '2026-08-21', tss: 138, km: 52.4, sessions: 1, peak: true },
    { key: 'fr', date: '2026-08-22', tss: 0, km: 0, sessions: 0, peak: false },
    { key: 'sa', date: '2026-08-23', tss: 96, km: 40.0, sessions: 1, peak: false },
    { key: 'so', date: '2026-08-24', tss: 76, km: 43.0, sessions: 1, peak: false },
  ],
  elevation_m: 2140,
  peak_power: {
    watts: 1180, wkg: 16.4,
    comparison: [
      { key: 'you', label: 'Du', watts: 1180, you: true },
      { key: 'moped', label: 'ein Moped', watts: 900, you: false },
      { key: 'toaster', label: 'ein Toaster', watts: 800, you: false },
    ],
  },
  best_ride: {
    activity_id: 1, title: 'Rheinschleife', date: '2026-08-21',
    tss: 138, km: 52.4, hours: 1.79, score: 94, moving: '1:47:32',
  },
  rides: 5,
  zero_missed: true,
}

export default function W3WrappedPreview() {
  return <W3WrappedView vm={buildWrappedVm(FIXTURE, { bike: '/w3/example-rider.webp', bestRideScene: '/w3/example-rider.webp' })} onClose={() => history.back()} onShare={async (slide) => {
      // The preview paints the real card and opens it, so the exported artwork
      // can be judged without a share sheet.
      const { renderWrappedCard } = await import('./w3share')
      const { sceneFor } = await import('./w3wrapped')
      const out = await renderWrappedCard({
        eyebrow: slide.eyebrow, value: slide.value, unit: slide.unit,
        lead: slide.lead, accent: slide.accent, foot: slide.foot,
        series: slide.series, photo: slide.image, scene: sceneFor(slide.key),
        weekLabel: '18 – 24. August',
      })
      const w = window.open()
      if (w) w.document.write(`<img src="${out.dataUrl}" style="width:100%">`)
    }} />
}
