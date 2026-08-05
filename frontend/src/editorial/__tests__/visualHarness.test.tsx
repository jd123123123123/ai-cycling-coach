/**
 * Visual harness. Renders a real screen from a fixture model and writes
 * standalone HTML, so a screen can be LOOKED AT without a backend, auth, or a
 * dev server — the node tree tells you the spec, only pixels tell you whether
 * the screen works.
 *
 * Skipped in the normal suite. To use it:
 *   HARNESS_OUT=/tmp/trained.html npx vitest run src/editorial/__tests__/_visual.harness.test.tsx
 *   python3 -m http.server 8971 --directory /tmp   # file:// is blocked in the browser tool
 * then open http://localhost:8971/trained.html at 390x844.
 */
import { render } from '@testing-library/react'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { describe, it } from 'vitest'

const OUT = process.env.HARNESS_OUT
import { present, missing } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import TodayView from '../pages/TodayView'

function buildPmcSeries(days: number) {
  const out = []
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1)
    out.push({
      date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      ctl: 44 + t * 24 + Math.sin(i / 3) * 1.5,
      atl: 40 + t * 30 + Math.sin(i / 2) * 3,
      tsb: (44 + t * 24) - (40 + t * 30),
    })
  }
  return out
}

const model: TodayModel = {
  state: 'trained',
  dateLabel: present('WED 22 JUL'),
  streakDays: present(13),
  readiness: present({ score: 74, deltaVsYesterday: 8 }),
  hrv: present({ value: 68, unit: 'ms', delta: 4, band: { low: 52, high: 74, position: 'above' } }),
  restingHr: present({ value: 46, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'in' } }),
  sleep: present({ totalS: 27000, deepS: 4800, remS: 5400, lightS: 15600, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 58, form: -2, series: buildPmcSeries(42) }),
  recovery: present({ hoursRemaining: 26, clearAtLabel: 'Fri 09:00' }),
  session: present({
    title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
    blocks: [
      { label: 'Warm-up', minutes: 12, watts: 180 },
      { label: 'Block 1', minutes: 12, watts: 285 },
      { label: 'Recover', minutes: 5, watts: 150 },
      { label: 'Block 2', minutes: 12, watts: 283 },
      { label: 'Recover', minutes: 5, watts: 150 },
      { label: 'Block 3', minutes: 12, watts: 283 },
      { label: 'Recover', minutes: 5, watts: 150 },
      { label: 'Block 4', minutes: 12, watts: 285 },
      { label: 'Cool-down', minutes: 10, watts: 120 },
    ],
  }),
  ride: present({ activityId: 1, distanceM: 52400, kj: 1148, avgHr: 151, np: 296, durationS: 6420 }),
  zones: present([
    { name: 'Z1', lowBpm: 0, highBpm: 124, seconds: 1320 },
    { name: 'Z2', lowBpm: 124, highBpm: 141, seconds: 1440 },
    { name: 'Z3', lowBpm: 142, highBpm: 152, seconds: 1080 },
    { name: 'Z4', lowBpm: 153, highBpm: 163, seconds: 2340 },
    { name: 'Z5', lowBpm: 164, highBpm: Infinity, seconds: 240 },
  ]),
  peaks: missing('No peak-power breakdown for this ride yet.'),
  planVsRidden: missing('This ride was not matched to its plan.'),
  verdict: present({
    headline: "That's the work banked.",
    body: 'You banked it clean. Everything from here is absorption.',
  }),
  whatThisChanges: present({
    onYou: { claim: 'Your 12-minute ceiling moves to 288 W', detail: 'Threshold reference updated.' },
    onThePlan: { claim: "Thursday's VO2 targets rise 10 W", detail: 'Tomorrow stays easy.' },
  }),
  conditions: present({ tempC: 19, windKmh: 12 }),
  tomorrow: present({ title: 'Recovery spin', detail: 'Forty-five minutes, easy.', unlockLabel: missing('No unlock time.') }),
  isLoading: false,
} as TodayModel

const restModel: TodayModel = {
  state: 'rest',
  dateLabel: present('WED 22 JUL'),
  streakDays: present(12),
  readiness: present({ score: 88, deltaVsYesterday: 6 }),
  hrv: present({ value: 68, unit: 'ms', delta: 6, band: { low: 52, high: 74, position: 'above' } }),
  restingHr: present({ value: 48, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'below' } }),
  sleep: present({ totalS: 27720, deepS: 4920, remS: 6480, lightS: 15120, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 52, form: 16, series: buildPmcSeries(42) }),
  recovery: present({ hoursRemaining: 22, clearAtLabel: 'Thu 17:30' }),
  session: missing('Nothing planned for today.'),
  ride: missing('No ride recorded yet today.'),
  zones: missing('No ride recorded yet today.'),
  peaks: missing('No peak-power breakdown for this ride yet.'),
  planVsRidden: missing('This ride was not matched to its plan.'),
  verdict: present({
    headline: "Absorb, don't add.",
    body: "You're fresh — that's the point. Today your job is to stay out of the way.",
  }),
  whatThisChanges: missing('The coach has not weighed in on this ride yet.'),
  conditions: missing('No location from a recent ride.'),
  tomorrow: present({ title: 'Threshold · 4 × 8 @ 285 W', detail: '', unlockLabel: missing('No unlock time.') }),
  week: [
    { letter: 'M', tss: present(64) }, { letter: 'T', tss: present(48) }, { letter: 'W', tss: present(12) },
    { letter: 'T', tss: missing('No ride logged.') }, { letter: 'F', tss: present(24) },
    { letter: 'S', tss: present(68) }, { letter: 'S', tss: present(44) },
  ],
  isLoading: false,
} as TodayModel

const trainingModel: TodayModel = {
  ...restModel,
  state: 'training',
  dateLabel: present('WED 22 JUL'),
  readiness: present({ score: 82, deltaVsYesterday: 4 }),
  session: present({
    title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
    blocks: [
      { label: 'Warm-up', minutes: 20, watts: 180 },
      { label: 'Interval 1', minutes: 8, watts: 285 },
      { label: 'Recover', minutes: 3, watts: 150 },
      { label: 'Interval 2', minutes: 8, watts: 285 },
      { label: 'Recover', minutes: 3, watts: 150 },
      { label: 'Interval 3', minutes: 8, watts: 285 },
      { label: 'Recover', minutes: 3, watts: 150 },
      { label: 'Interval 4', minutes: 8, watts: 285 },
      { label: 'Cool-down', minutes: 15, watts: 120 },
    ],
  }),
  conditions: present({ tempC: 13, windKmh: 14 }),
  verdict: present({
    headline: 'Green light. Go get it.',
    body: "Everything's in range. You're cleared for full intensity.",
  }),
  tomorrow: missing("Tomorrow's plan is not set yet."),
} as TodayModel

describe('visual harness', () => {
  it.skipIf(!OUT)('writes the Trained screen to HTML', () => {
    writeHarness('trained', model)
  })
  it.skipIf(!OUT)('writes the Rest screen to HTML', () => {
    writeHarness('rest', restModel)
  })
  it.skipIf(!OUT)('writes the Training screen to HTML', () => {
    writeHarness('training', trainingModel)
  })
})

/** `HARNESS_OUT=/tmp/t10.html` writes trained to that exact path and
 *  rest/training alongside it as `/tmp/t10.rest.html` / `/tmp/t10.training.html`. */
function writeHarness(name: 'trained' | 'rest' | 'training', m: TodayModel) {
  const { container } = render(<MemoryRouter><TodayView model={m} /></MemoryRouter>)
  const tokens = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')
  const base = OUT!.endsWith('.html') ? OUT!.slice(0, -5) : OUT!
  const finalPath = name === 'trained' ? OUT! : `${base}.${name}.html`
  writeFileSync(finalPath, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#000}${tokens}</style>
</head><body>${container.innerHTML}</body></html>`)
}
