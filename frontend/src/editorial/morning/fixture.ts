import { present, missing } from '../data/value'
import type { MorningWrapModel } from './model'

/** Fixture transcribed from the pen frame `iV2fb` so the composition can be
 *  looked at before the adapter exists. Values are the pen's own. */
export const MORNING_WRAP_FIXTURE: MorningWrapModel = {
  dateLabel: present('Thu 23 Jul · 06:32'),
  streakDays: present(13),
  greeting: present('Good morning,\nJannis.'),
  sleepScore: present({ score: 91, context: 'Your best night since 4 June' }),
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
  nightClaim: present('You went deep early, and stayed. Deep sleep is when your body does the repair work, and yours came in the first two hours — before the night had a chance to go wrong.'),

  brief: present({
    readiness: { value: 88, delta: '+9', band: 'Your 30-day band: 61–88' },
    tiles: [
      {
        label: 'HRV', value: '112', unit: 'ms', sub: '+12', glyph: 'hrv',
        dir: 'up', good: true, spark: [98, 102, 95, 104, 101, 108, 112],
        note: 'Your highest reading since this block started.',
      },
      {
        label: 'Resting HR', value: '42', unit: 'bpm', sub: '−3', glyph: 'cardiac',
        dir: 'down', good: true, spark: [45, 44, 46, 44, 43, 43, 42],
        note: 'Three beats under your usual. Your heart settled early and stayed there.',
      },
      {
        label: 'Form', value: '+19', sub: '+6 this week', tone: 'accent', glyph: 'form',
        dir: 'up', good: true, spark: [4, 6, 9, 11, 13, 16, 19],
        note: 'Anything over +10 is race-ready. You have not been this fresh since March.',
      },
      {
        label: '7d load', value: '412', sub: '−28%', glyph: 'load',
        dir: 'down', good: true, spark: [560, 548, 520, 498, 470, 440, 412],
        note: 'Down 28% on plan, and falling on purpose. This is your taper doing its job.',
      },
      {
        label: 'Sleep', value: '7:48', sub: '+0.2 h', glyph: 'sleep',
        dir: 'up', good: true, spark: [6.4, 7.1, 6.9, 7.4, 7.2, 7.6, 7.8],
        note: 'Four nights over seven hours now. The streak matters more than any one night.',
      },
    ],
  }),
  call: present({
    agree: 'All 4 of your signals agree',
    claim: 'Hold your taper. Bank the freshness you have earned.',
    reason: 'Your readiness peaked while your 7-day load fell 28%. The adaptation is still landing.',
    prescription: '0 TSS · 40 min walk · lights out 22:30',
  }),

  signalsClaim: present('Two of your signals broke their range. Both of them the way you want.'),
  signals: [
    present({ key: 'hrv', label: 'HRV', value: 71, unit: 'ms', delta: '+9', band: { low: 52, high: 66 }, position: 'above', outsideIsGood: true, note: '15% above your 30-day band — the strongest single read of this block.' }),
    present({ key: 'rhr', label: 'Resting HR', value: 42, unit: 'bpm', delta: '−3', band: { low: 44, high: 52 }, position: 'below', outsideIsGood: true, note: '7% under your usual 45. The heart settled early and never climbed back.' }),
    present({ key: 'resp', label: 'Respiratory rate', value: 13.8, unit: '/min', delta: '−0.2', band: { low: 13.1, high: 14.6 }, position: 'in', outsideIsGood: false, note: 'Held steady all night. No sign of anything your body is fighting.' }),
    present({ key: 'temp', label: 'Skin temp', value: -0.1, unit: '°C', delta: 'Flat', band: { low: -0.4, high: 0.4 }, position: 'in', outsideIsGood: false, note: 'Flat against baseline — the quiet reading you want after a hard week.' }),
  ],

  standClaim: present('You are the freshest you have been since March.'),
  standBody: present('Fitness is what you built. Fatigue is what it cost you. Form is what you have left to spend.'),
  form: present({
    fitness: 78, fatigue: 59, form: 19,
    note: 'Your widest gap since 14 March. Anything over +10 is race-ready.',
    series: Array.from({ length: 42 }, (_, i) => ({
      ctl: 62 + i * 0.42 + Math.sin(i / 4) * 2.2,
      atl: 74 - i * 0.36 + Math.sin(i / 2.4) * 7,
    })),
  }),

  todayClaim: present('Nothing is asked of you today. That is your assignment — five things, none of them training, each with a number so you know when it is done.'),
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
    kicker: 'Before you start your day',
    claim: 'Yesterday you did the work. Today you collect it.',
    body: 'Thirteen days in a row you have shown up. Today the only thing on your list is to stay out of your own way.',
    cta: 'Open your plan for today',
  }),
  quote: present({
    text: "You don't get fitter on the bike. You get fitter on the days you leave it alone.",
    attribution: 'What your day is for',
  }),
}

/** The honest counterpart: a morning where the watch synced nothing. Every
 *  section must still hold its frame and say why, never invent a number. */
export const MORNING_WRAP_NO_DATA: MorningWrapModel = {
  ...MORNING_WRAP_FIXTURE,
  sleepScore: missing('Your watch has not recorded a night since Tuesday.'),
  // The window goes with the sleep. Keeping 22:47 → 06:32 on screen while the
  // score says nothing was recorded is the screen contradicting itself.
  sleepWindow: missing('Your watch recorded no sleep window.'),
  stages: missing('Your watch recorded no sleep stages last night.'),
  hypnogram: missing('Your watch recorded no sleep stages last night.'),
  nightClaim: missing('Nothing was measured while you slept, so there is nothing to read into.'),
  brief: missing('No reading from your watch since Tuesday.'),
  call: missing('Your coach withholds a call until a fresh reading lands.'),
  // A claim and its evidence go missing TOGETHER. "Two signals broke your
  // range" asserts a fact the rows below can no longer show.
  signalsClaim: missing('None of your overnight signals came through.'),
  signals: [missing('None of your overnight signals were recorded.')],
  standClaim: missing('Not enough of your history to place today yet.'),
  standBody: missing('Fitness and fatigue need more of your history than this.'),
  form: missing('Not enough of your history for a form curve yet.'),
}
