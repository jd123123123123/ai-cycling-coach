import { present, missing } from '../data/value'
import type { MorningWrapModel } from './MorningWrapView'

/** Fixture transcribed from the pen frame `iV2fb` so the composition can be
 *  looked at before the adapter exists. Values are the pen's own. */
export const MORNING_WRAP_FIXTURE: MorningWrapModel = {
  dateLabel: present('Thu 23 Jul · 06:32'),
  streakDays: present(13),
  greeting: present('Good morning,\nJannis.'),
  sleepScore: present({ score: 91, context: 'Best night since 4 June' }),
  sleepWindow: present({ lightsOut: ['22:47', 'lights out'], asleep: ['7 h 45', 'asleep'], awake: ['06:32', 'awake'] }),
  stages: present([
    { key: 'deep', label: 'Deep', seconds: 4920 },
    { key: 'rem', label: 'REM', seconds: 5760 },
    { key: 'light', label: 'Light', seconds: 15480 },
    { key: 'awake', label: 'Awake', seconds: 1740 },
  ]),
  // Deep early, then cycling — the shape the coaching line refers to.
  hypnogram: present([
    { stage: 'light', minutes: 18 }, { stage: 'deep', minutes: 42 }, { stage: 'deep', minutes: 26 },
    { stage: 'rem', minutes: 22 }, { stage: 'light', minutes: 34 }, { stage: 'deep', minutes: 14 },
    { stage: 'rem', minutes: 28 }, { stage: 'light', minutes: 41 }, { stage: 'awake', minutes: 9 },
    { stage: 'rem', minutes: 24 }, { stage: 'light', minutes: 38 }, { stage: 'rem', minutes: 22 },
    { stage: 'light', minutes: 32 }, { stage: 'awake', minutes: 20 },
  ]),
  nightClaim: present('Deep sleep landed early and stayed. Your body did the repair work while you were gone.'),

  brief: present({
    readiness: { value: 88, delta: '+9', band: 'Your 30-day band: 61–88' },
    tiles: [
      { label: 'HRV', value: '112', unit: 'ms', sub: '+12' },
      { label: 'Resting HR', value: '42', unit: 'bpm', sub: '−3' },
      { label: 'Form', value: '+19', sub: 'Since March', tone: 'accent' },
      { label: '7d load', value: '412', sub: '−28% on plan' },
      { label: 'Sleep', value: '7:48', sub: '4 nights >7 h' },
    ],
  }),
  call: present({
    agree: '4 of 4 signals agree',
    claim: 'Hold the taper. Bank the freshness.',
    reason: 'Readiness peaked while 7d load fell 28%. The adaptation is still landing.',
    prescription: '0 TSS · 40 min walk · lights out 22:30',
  }),

  signalsClaim: present('Two signals broke your range. Both the way you want.'),
  signals: [
    present({ key: 'hrv', label: 'HRV', value: 71, unit: 'ms', delta: '+9', band: { low: 52, high: 66 }, position: 'above', outsideIsGood: true, note: '15% above your 30-day band — the strongest single read of this block.' }),
    present({ key: 'rhr', label: 'Resting HR', value: 42, unit: 'bpm', delta: '−3', band: { low: 44, high: 52 }, position: 'below', outsideIsGood: true, note: '7% under your usual 45. The heart settled early and never climbed back.' }),
    present({ key: 'resp', label: 'Respiratory rate', value: 13.8, unit: '/min', delta: '−0.2', band: { low: 13.1, high: 14.6 }, position: 'in', outsideIsGood: false, note: 'Held steady all night. No sign of anything your body is fighting.' }),
    present({ key: 'temp', label: 'Skin temp', value: -0.1, unit: '°C', delta: 'Flat', band: { low: -0.4, high: 0.4 }, position: 'in', outsideIsGood: false, note: 'Flat against baseline — the quiet reading you want after a hard week.' }),
  ],

  standClaim: present('Freshest you have been since March.'),
  standBody: present('Fitness is what you built. Fatigue is what it cost. Form is what is left.'),
  form: present({
    fitness: 78, fatigue: 59, form: 19,
    note: 'Your widest gap since 14 March. Anything over +10 is race-ready.',
    series: Array.from({ length: 42 }, (_, i) => ({
      ctl: 62 + i * 0.42 + Math.sin(i / 4) * 2.2,
      atl: 74 - i * 0.36 + Math.sin(i / 2.4) * 7,
    })),
  }),

  todayClaim: present('Nothing is asked of you. That is the assignment.'),
  todayBody: present('Five things, none of them training. Each one has a number so you know when it is done.'),
  tasks: present([
    { key: 'wake', time: '06:32', title: "You're awake", metric: 'Now', now: true, detail: '500 ml before the coffee. You lost close to a litre overnight.' },
    { key: 'mob', time: '09:00', title: 'Mobility, not training', metric: '20 min', detail: 'Hips and thoracic spine — the joints the bike holds still. No load.' },
    { key: 'eat', time: '13:00', title: 'Eat like you rode', metric: '3.5 g/kg', detail: '250 g carbs, 120 g protein. Adaptation is paid for on the rest day.' },
    { key: 'walk', time: '17:30', title: "Walk, don't ride", metric: '40 min · 14°C', detail: 'Easy blood flow, zero load. Light legs by the end means the taper works.' },
    { key: 'bed', time: '22:47', title: 'Lights out, same as last night', metric: 'Target', detail: '22:47 gave you a 91. Repeat the input, keep the output.' },
  ]),

  tomorrow: present({ when: '06:00', away: '23 h from now', title: '4 × 8 at 320 W.', cost: '82 TSS · 1 h 45' }),
  close: present({
    kicker: 'Before you start the day',
    claim: 'Yesterday you did the work. Today you collect it.',
    body: 'Thirteen days in a row you have shown up. Today the only thing on the list is to stay out of your own way.',
    cta: "Open today's plan",
  }),
  quote: present({
    text: "You don't get fitter on the bike. You get fitter on the days you leave it alone.",
    attribution: 'What today is for',
  }),
}

/** The honest counterpart: a morning where the watch synced nothing. Every
 *  section must still hold its frame and say why, never invent a number. */
export const MORNING_WRAP_NO_DATA: MorningWrapModel = {
  ...MORNING_WRAP_FIXTURE,
  sleepScore: missing('No sleep recorded since Tuesday.'),
  // The window goes with the sleep. Keeping 22:47 → 06:32 on screen while the
  // score says nothing was recorded is the screen contradicting itself.
  sleepWindow: missing('No sleep window recorded.'),
  stages: missing('No sleep stages recorded last night.'),
  hypnogram: missing('No sleep stages recorded last night.'),
  nightClaim: missing('Nothing measured overnight, so there is nothing to read into.'),
  brief: missing('No wearable reading since Tuesday.'),
  call: missing('The coach withholds a call until a fresh reading lands.'),
  // A claim and its evidence go missing TOGETHER. "Two signals broke your
  // range" asserts a fact the rows below can no longer show.
  signalsClaim: missing('No overnight signals to read.'),
  signals: [missing('No overnight signals recorded.')],
  standClaim: missing('Not enough history to place today yet.'),
  standBody: missing('Fitness and fatigue need a fuller history than this.'),
  form: missing('Not enough history for a form curve yet.'),
}
