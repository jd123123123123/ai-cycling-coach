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
  role: 'Climber',
  level: 7,
  levelPct: 0.62,
  levelNote: '190 RC to Level 8',
  chips: ['CAT 2', '3.8 W/KG', '292 W FTP', 'SINCE 2021'],
  headline: '1.2× around the Earth',
  headlineCaption: 'every kilometre you have ever ridden',
  primary: { totalDistance: '48,120 km', totalRides: '1,204', saddleTime: '1,760 h' },
  insights: [
    { key: 'elevation', label: 'ELEVATION', value: '61.4 km', caption: '≈ 6.9× Mount Everest' },
    { key: 'longest', label: 'LONGEST', value: '233 km', caption: 'your biggest day in the saddle' },
    { key: 'speed', label: 'AVG SPEED', value: '27.4', caption: 'km/h across every ride' },
    { key: 'burned', label: 'BURNED', value: '184.2K', caption: 'kcal · ≈ 216 pizzas' },
  ],
  engine: [
    { label: 'FTP', value: '292 W', caption: 'watts at threshold' },
    { label: 'W/KG', value: '4.1', caption: 'at 71.2 kg' },
    { label: 'FITNESS', value: '68', caption: 'CTL · 42-day load' },
  ],
  streak: { label: 'STREAK', value: '12', caption: 'days in a row' },
  badges: { label: 'BADGES', value: '14/38', caption: 'milestones earned by riding' },
  coin: { balance: '15,800', pct: 63, foot: 'RIDECOIN · earned from real rides', note: '9,200 TO PRESTIGE TIER' },
  referral: { code: 'HYXBS9', note: '3 active · 1 completed' },
  devices: [
    { name: 'Garmin', sub: 'Synced 2 min ago', icon: 'watch', on: true },
    { name: 'Wahoo', sub: 'Not connected', icon: 'zap', on: false },
  ],
}

export default function W3BikerPreview() {
  return <W3BikerView vm={FIXTURE} />
}
