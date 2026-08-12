import W3RideCelebrateView, { type W3CelebrateVm } from './W3RideCelebrateView'

/** TEMP preview — /e/w3-ride-celebrate-preview (unguarded). Pen-faithful
 *  fixture for the pending→settled celebration; the live page wires it to real
 *  ride stats + the ledger's RideCoin breakdown. Remove before merge. */
export const CELEBRATE_FIXTURE: W3CelebrateVm = {
  provider: 'WAHOO',
  kicker: 'POINTS EARNED',
  title: 'Ride', titleAccent: 'banked.',
  settledTitle: 'Points', settledAccent: 'earned.',
  total: 840,
  coinsPending: '73 coins on the road',
  coinsSettled: '73 coins · all banked',
  stats: [
    { icon: 'route', label: 'DISTANCE', value: '28', unit: 'km' },
    { icon: 'timer', label: 'MOVING', value: '2h04', unit: '' },
    { icon: 'power', label: 'AVG POWER', value: '186', unit: 'W' },
    { icon: 'climb', label: 'CLIMBED', value: '412', unit: 'm' },
  ],
  zones: [
    { z: 'ZONE 1', name: 'Recovery', min: '14 min', pct: 24, peak: false },
    { z: 'ZONE 2', name: 'Endurance', min: '38 min', pct: 62, peak: false },
    { z: 'ZONE 3', name: 'Tempo', min: '31 min', pct: 50, peak: false },
    { z: 'ZONE 4', name: 'Threshold', min: '22 min', pct: 100, peak: true },
    { z: 'ZONE 5', name: 'VO2', min: '15 min', pct: 40, peak: false },
    { z: 'ZONE 6', name: 'Anaerobic', min: '4 min', pct: 16, peak: false },
  ],
  ftp: 'FTP 250 W',
  bestEffortW: '271 W',
  bestEffortNote: 'for 8 min · NEW BEST',
  firstsCount: 3,
  firsts: [
    { icon: 'route', title: 'Longest ride', sub: 'IN 6 WEEKS' },
    { icon: 'flame', title: '3rd hardest', sub: 'RIDE EVER' },
    { icon: 'climb', title: '412 m up', sub: 'MOST SINCE APRIL' },
  ],
  breakMeta: '2h04 · 28 KM · 186 W',
  breakdown: [
    { label: 'RIDE', value: '702' },
    { label: 'STREAK ×1.2', value: '+138' },
  ],
  bankedNote: 'BANKED TO YOUR LEDGER',
  alreadyClaimed: false,
}

export default function W3RideCelebratePreview() {
  return <W3RideCelebrateView vm={CELEBRATE_FIXTURE} />
}
