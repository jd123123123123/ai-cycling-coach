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

const model: TodayModel = {
  state: 'trained',
  dateLabel: present('WED 22 JUL'),
  streakDays: present(13),
  readiness: present({ score: 74, deltaVsYesterday: 8 }),
  hrv: present({ value: 68, unit: 'ms', delta: 4, band: { low: 52, high: 74, position: 'above' } }),
  restingHr: present({ value: 46, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'in' } }),
  sleep: present({ totalS: 27000, deepS: 4800, remS: 5400, lightS: 15600, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 58, form: -2, series: [] }),
  recovery: present({ hoursRemaining: 26, clearAtLabel: 'Fri 09:00' }),
  session: present({
    title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
    blocks: [{ label: '1', minutes: 12, watts: 285 }],
  }),
  ride: present({ activityId: 1, distanceM: 52400, kj: 1148, avgHr: 151, np: 296, durationS: 6420 }),
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

describe('visual harness', () => {
  it.skipIf(!OUT)('writes the Trained screen to HTML', () => {
    const { container } = render(<MemoryRouter><TodayView model={model} /></MemoryRouter>)
    const tokens = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')
    writeFileSync(OUT!, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#000}${tokens}</style>
</head><body>${container.innerHTML}</body></html>`)
  })
})
