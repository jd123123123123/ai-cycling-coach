import W3BikerView, { type W3BikerVm } from './W3BikerView'
import { SHOWCASE_RIDER } from './showcaseRider'

/** TEMP preview — design fixture only. /e/w3-biker-preview (unguarded).
 *  The LIVE page (`W3BikerPage`) renders none of these numbers: it reads the
 *  rider's real rides, wallet, profile, streak, badges and devices. */
const FIXTURE: W3BikerVm = {
  avatarUrl: SHOWCASE_RIDER, // design fixture only — the live page shows the rider's OWN garage figurine
  name: 'Jonathan Ghost',
  handle: '@jonathan.ghost',
  ready: true,
  role: 'Kletterer',
  level: 7,
  levelPct: 0.62,
  levelNote: '190 RC bis Level 8',
  chips: ['CAT 2', '3,8 W/KG', '292 W FTP', 'SEIT 2021'],
  headline: '1,2× um die Erde',
  headlineCaption: 'jeder Kilometer, den du je gefahren bist',
  primary: { totalDistance: '48.120 km', totalRides: '1.204', saddleTime: '1.760 h' },
  insights: [
    { key: 'elevation', label: 'HÖHENMETER', value: '61,4 km', caption: '≈ 6,9× Mount Everest' },
    { key: 'longest', label: 'LÄNGSTE', value: '233 km', caption: 'dein größter Tag im Sattel' },
    { key: 'speed', label: 'Ø TEMPO', value: '27,4', caption: 'km/h über alle Fahrten' },
    { key: 'burned', label: 'VERBRANNT', value: '184,2K', caption: 'kcal · ≈ 216 Pizzen' },
  ],
  engine: [
    { label: 'FTP', value: '292 W', caption: 'Watt an der Schwelle' },
    { label: 'W/KG', value: '4,1', caption: 'bei 71,2 kg' },
    { label: 'FITNESS', value: '68', caption: 'CTL · 42-Tage-Belastung' },
  ],
  streak: { label: 'STREAK', value: '12', caption: 'Tage in Folge' },
  badges: { label: 'ABZEICHEN', value: '14/38', caption: 'Meilensteine, erfahren im Sattel' },
  coin: { balance: '15.800', pct: 63, foot: 'RIDECOIN · aus echten Fahrten verdient', note: '9.200 BIS STUFE PRESTIGE' },
  referral: { code: 'HYXBS9', note: '3 aktiv · 1 abgeschlossen' },
  devices: [
    { name: 'Garmin', sub: 'Sync vor 2 min', icon: 'watch', on: true },
    { name: 'Wahoo', sub: 'Nicht verbunden', icon: 'zap', on: false },
  ],
}

export default function W3BikerPreview() {
  return <W3BikerView vm={FIXTURE} />
}
