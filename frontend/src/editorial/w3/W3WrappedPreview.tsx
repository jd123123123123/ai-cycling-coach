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
  totals: { sessions: 5, hours: 8.25, km: 214.6, tss: 486, active_days: 5, saddle_hm: '8:15 h' },
  planned_tss: 450,
  ctl_delta: 2.4,
  route: null,
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
  return <W3WrappedView vm={buildWrappedVm(FIXTURE)} onClose={() => history.back()} onShare={() => location.assign('/e/w3-share-preview')} />
}
