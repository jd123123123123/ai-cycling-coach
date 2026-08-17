import W3ConnectCelebrateView, { type W3ConnectVm } from './W3ConnectCelebrateView'

/** TEMP preview — fixture, no backend. /e/w3-connected-preview is unguarded. */
const FIXTURE: W3ConnectVm = {
  source: 'Garmin',
  headline: '6 Jahre Fahrten. Alles drin.',
  sub: 'Von Mär 2020 bis heute — nichts fehlt.',
  ridesCount: 842,
  ridesLabel: 'Fahrten importiert',
  km: 34910,
  earthPct: 0.87,
  earthLine: '87% um die Erde',
  everestLine: '46× Everest',
  stats: [
    { icon: 'clock', value: '1,204 h', label: 'im Sattel' },
    { icon: 'mountain', value: '412,600 m', label: 'Höhenmeter' },
    { icon: 'flame', value: '842', label: 'Fahrten' },
  ],
  standout: { title: 'Stelvio Pass', detail: '182 km · 4,240 m hoch · Jul 2023' },
  ctaLabel: 'Lern deinen Rider kennen',
}

export default function W3ConnectCelebratePreview() {
  return <W3ConnectCelebrateView vm={FIXTURE} onContinue={() => {}} />
}
