import W3BikerView, { type W3BikerVm } from './W3BikerView'

/** TEMP preview — pen-exact fixture. /e/w3-biker-preview (unguarded). */
const FIXTURE: W3BikerVm = {
  avatarUrl: null, // → SHOWCASE_RIDER figurine
  handle: '@jonathan.ghost',
  tierChip: 'SILVER TIER', sinceChip: 'RIDING SINCE 2021', locationChip: 'HAMBURG, DE',
  name: 'Jonathan Ghost',
  stats: [
    { v: '4,182 km', l: 'This season', s: '+18% vs 2024' },
    { v: '61,400 m', l: 'Climbed', s: 'top 6% locally' },
    { v: '292 W', l: 'FTP', s: '+11 W in 16 weeks' },
    { v: '4.1', l: 'W/kg', s: '71.2 kg' },
  ],
  tierFrom: 'Silver', tierTo: 'Gold', tierPct: 63, tierFoot: '15,800 of 25,000 RIDECOIN', tierRate: '~13 WEEKS AT THIS RATE',
  referralCode: 'HYXBS9',
  referralBody: 'Bring a training partner. You both get 250 RideCoin when they log their first three rides.',
  referralActive: '3 active · 750 RideCoin earned',
  devices: [
    { name: 'Garmin Edge 840', sub: 'Synced 2 min ago', icon: 'watch', on: true },
    { name: 'Strava', sub: 'Synced today', icon: 'activity', on: true },
    { name: 'Wahoo KICKR', sub: 'Synced 3 days ago', icon: 'zap', on: true },
    { name: 'Apple Health', sub: 'Not connected', icon: 'heart', on: false },
  ],
}

export default function W3BikerPreview() {
  return <W3BikerView vm={FIXTURE} />
}
