import W3RideCelebrateView, { type W3CelebrateVm } from './W3RideCelebrateView'

/** TEMP preview — /e/w3-ride-celebrate-preview (unguarded). Pen-faithful
 *  fixture for the pending→settled celebration; the live page wires it to real
 *  ride stats + the ledger's RideCoin breakdown. Remove before merge. */
export const CELEBRATE_FIXTURE: W3CelebrateVm = {
  provider: 'WAHOO',
  kicker: 'PUNKTE VERDIENT',
  title: 'Fahrt', titleAccent: 'gebucht.',
  settledTitle: 'Punkte', settledAccent: 'verdient.',
  total: 840,
  coinsPending: '73 Coins auf der Straße',
  coinsSettled: '73 Coins · alle gebucht',
  stats: [
    { icon: 'route', label: 'DISTANZ', value: '28', unit: 'km' },
    { icon: 'timer', label: 'FAHRZEIT', value: '2h04', unit: '' },
    { icon: 'power', label: 'Ø WATT', value: '186', unit: 'W' },
    { icon: 'climb', label: 'ANSTIEG', value: '412', unit: 'm' },
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
  bestEffortNote: '8 min lang · BESTWERT',
  firstsCount: 3,
  firsts: [
    { icon: 'route', title: 'Längste Fahrt', sub: 'SEIT 6 WOCHEN' },
    { icon: 'flame', title: '3.-schwerste', sub: 'ALLER ZEITEN' },
    { icon: 'climb', title: '412 m hoch', sub: 'MEISTE SEIT APRIL' },
  ],
  breakMeta: '2h04 · 28 KM · 186 W',
  breakdown: [
    { label: 'FAHRT', value: '702' },
    { label: 'STREAK ×1.2', value: '+138' },
  ],
  bankedNote: 'AUFS KONTO GEBUCHT',
  alreadyClaimed: false,
}

export default function W3RideCelebratePreview() {
  return <W3RideCelebrateView vm={CELEBRATE_FIXTURE} />
}
