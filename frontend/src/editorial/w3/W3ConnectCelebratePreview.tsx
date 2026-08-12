import W3ConnectCelebrateView, { type W3ConnectVm } from './W3ConnectCelebrateView'

/** TEMP preview — fixture, no backend. /e/w3-connected-preview is unguarded. */
const FIXTURE: W3ConnectVm = {
  source: 'Garmin',
  headline: '6 years of riding, in.',
  sub: 'From Mar 2020 to today — nothing left behind.',
  ridesCount: 842,
  ridesLabel: 'rides imported',
  km: 34910,
  earthPct: 0.87,
  earthLine: '87% around the Earth',
  everestLine: '46 Everests climbed',
  stats: [
    { icon: 'clock', value: '1,204 h', label: 'in the saddle' },
    { icon: 'mountain', value: '412,600 m', label: 'total climbing' },
    { icon: 'flame', value: '842', label: 'rides logged' },
  ],
  standout: { title: 'Stelvio Pass', detail: '182 km · 4,240 m climbed · Jul 2023' },
  ctaLabel: 'Meet your rider',
}

export default function W3ConnectCelebratePreview() {
  return <W3ConnectCelebrateView vm={FIXTURE} onContinue={() => {}} />
}
