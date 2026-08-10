import type { ArchiveDeckModel } from './ArchiveDeckView'

/** Shape-realistic sample for the harness. Real months contain flat long rides,
 *  short steep rides and one epic — perfectly-correlated data would draw a line
 *  and prove nothing about the scatter. */
export const MONTH_FIXTURE: ArchiveDeckModel = {
  scope: 'Archive',
  period: 'August 2025',
  answer: {
    claim: 'August built your climbing engine.',
    support: 'Your five-minute power is up 9 W — and it came from riding 23 times, not from riding harder.',
  },
  openGoal: { label: '42 km to your biggest month ever', right: '9 days left', sub: '812 of 854 km', pct: 95 },
  wentIn: {
    hero: '812', unit: 'km', rank: '#2 of 17 months',
    verdict: 'Twenty-three rides, and only four of them hard.',
    rides: [
      { key: 'a', km: 62, climbM: 240, load: 64 }, { key: 'b', km: 28, climbM: 620, load: 58 },
      { key: 'c', km: 45, climbM: 300, load: 48 }, { key: 'd', km: 88, climbM: 410, load: 86 },
      { key: 'e', km: 24, climbM: 150, load: 26 }, { key: 'f', km: 35, climbM: 780, load: 72 },
      { key: 'g', km: 52, climbM: 260, load: 52 }, { key: 'h', km: 31, climbM: 540, load: 50 },
      { key: 'i', km: 74, climbM: 330, load: 70 }, { key: 'j', km: 26, climbM: 190, load: 28 },
      { key: 'k', km: 41, climbM: 700, load: 66 }, { key: 'l', km: 58, climbM: 220, load: 54 },
      { key: 'm', km: 33, climbM: 480, load: 46 }, { key: 'n', km: 95, climbM: 520, load: 96 },
      { key: 'o', km: 29, climbM: 160, load: 30 }, { key: 'p', km: 47, climbM: 850, load: 80 },
      { key: 'q', km: 38, climbM: 210, load: 38 }, { key: 'r', km: 66, climbM: 290, load: 62 },
      { key: 's', km: 27, climbM: 430, load: 40 }, { key: 't', km: 43, climbM: 180, load: 42 },
      { key: 'u', km: 55, climbM: 910, load: 88 },
      { key: 'epic', km: 138, climbM: 1780, load: 164, label: 'Sellaronda' },
      { key: 'w', km: 36, climbM: 250, load: 36 },
    ],
    highlightKey: 'epic',
    soWhat: 'Your gains come at 20+ rides a month. You are on pace for 19 in September.',
    stats: [['9 900', 'm climbed'], ['36 h', 'moving'], ['4', 'rest days']],
  },
  cameOut: {
    hero: '+9', unit: 'watts at 5 min', rank: '372 W · season best',
    verdict: 'You got stronger where it counts, and nowhere else.',
    current: [
      { seconds: 5, watts: 1180 }, { seconds: 15, watts: 890 }, { seconds: 30, watts: 720 },
      { seconds: 60, watts: 596 }, { seconds: 300, watts: 372 }, { seconds: 720, watts: 330 },
      { seconds: 1200, watts: 312 }, { seconds: 3600, watts: 268 },
    ],
    previous: [
      { seconds: 5, watts: 1150 }, { seconds: 15, watts: 860 }, { seconds: 30, watts: 700 },
      { seconds: 60, watts: 587 }, { seconds: 300, watts: 363 }, { seconds: 720, watts: 316 },
      { seconds: 1200, watts: 305 }, { seconds: 3600, watts: 262 },
    ],
    highlightSeconds: 300,
    soWhat: 'Five-minute power is your fastest-improving effort. Two VO₂ sessions a week is what moved it.',
    stats: [['7 of 9', 'efforts up'], ['596 W', '1 min'], ['312 W', '20 min']],
  },
  cost: {
    hero: '−41', unit: 'min sleep', rank: 'after threshold days',
    verdict: 'You paid for it in sleep, not in fatigue.',
    days: Array.from({ length: 31 }, (_, i) => ({
      ctl: 44 + i * 0.62 + Math.sin(i / 3) * 1.1,
      tsb: 4 - i * 0.5 + Math.sin(i / 2.2) * 6,
    })),
    soWhat: 'You slept 41 min less after threshold work. That is the ceiling on how often you can do it.',
    stats: [['4', 'rest days'], ['7:12', 'avg sleep'], ['0', 'sessions missed']],
  },
  setsUp: {
    verdict: "Repeat August's frequency and 20-minute power clears 320 W by October.",
    actual: [297, 301, 304, 308, 312],
    projLow: [312, 314, 316],
    projHigh: [312, 320, 328],
    conditions: [
      ['20+ rides in September', 'on pace for 19'],
      ['Two VO₂ sessions a week', 'did 8 in August'],
      ['Sleep stays above 7 h', '7:12 average'],
    ],
  },
  contents: [
    { n: '01', title: 'What went in', value: '812 km · 23 rides', tone: 'ink' },
    { n: '02', title: 'What came out', value: '+9 W at five minutes', tone: 'gold' },
    { n: '03', title: 'What it cost', value: '4 rest days, sleep held', tone: 'ink' },
    { n: '04', title: 'What it sets up', value: 'September: hold 20+', tone: 'cool' },
  ],
  close: {
    headline: 'August, in one card',
    figure: '812', unit: 'km',
    footline: 'Munich to Hamburg. Almost.',
    nextGoal: { label: 'September is already under way', right: '2 rides in', sub: '18 more to hold your streak of 20+ months', pct: 10 },
  },
}
