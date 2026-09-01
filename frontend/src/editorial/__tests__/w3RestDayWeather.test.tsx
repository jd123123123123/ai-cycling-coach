// frontend/src/editorial/__tests__/w3RestDayWeather.test.tsx
//
// A REST DAY DOES NOT GET A RIDE RECOMMENDATION.
//
// Today's weather zone normally answers "when should I go out": a best
// two-hour window, a ride-quality verdict, and the day drawn as hourly bars.
// On a day the plan has set aside for recovery that is the app arguing with
// itself — the card above says Ruhetag and the frame below picks the perfect
// hour to ride, with "RAUS DAMIT" sitting next to 0 TSS.
//
// The morning sheet already refuses this (`useMorningBriefing`: "Rest days get
// no ride window: a best two-hour slot on a day the plan says not to ride is an
// invitation to ignore the plan"). This guards the same rule on Today, which
// was the one surface still making the recommendation.
//
// What a rest day KEEPS is the conditions — temperature and the short line —
// because a rider deciding whether to walk or commute still wants them. The
// rule is "no recommendation", not "no weather".
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The card reaches for the coach brief through `W3WhyButton`. None of that is
// what this file is about, so it is stubbed to the quiet state — the weather
// zone renders identically either way.
vi.mock('../../hooks/useCoachBrief', () => ({
  useCoachBrief: () => ({ data: null, isLoading: false }),
  COACH_BRIEF_KEY_ROOT: ['coach', 'brief'],
}))
vi.mock('../../hooks/useCurrentWeek', () => ({
  useCurrentWeek: () => ({ data: null, isLoading: false }),
  WEEK_CURRENT_KEY_ROOT: ['weeks', 'current'],
}))

import { WeekTrainingCard, type W3DayFull, type W3Weather } from '../w3/W3Sections'

afterEach(cleanup)

const WEATHER: W3Weather = {
  window: '17:00–19:00',
  temp: '19°',
  feels: '18°',
  short: '8 km/h SW · trocken',
  verdict: 'RAUS DAMIT',
  meta: 'Keine Vorhersage verfügbar.',
  hours: [
    { hour: 17, q: 0.9, rideable: true, rain: 0, wind: 8, dir: 'SW', temp: 19 },
    { hour: 18, q: 0.8, rideable: true, rain: 0, wind: 9, dir: 'SW', temp: 18 },
  ],
  bestFrom: 17,
  bestTo: 18,
  peak: 17,
}

/** Today, with whatever the plan prescribed for it. */
function dayToday(over: Partial<W3DayFull> = {}): W3DayFull {
  return {
    letter: 'D', num: '12', actual: 0, planned: null, status: 'today',
    title: null, dateLabel: 'Di, 12. Aug.', weekday: 'Dienstag',
    targetW: '—', ftpPct: '—', ...over,
  } as W3DayFull
}

function renderDay(day: W3DayFull) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
    <MemoryRouter>
    <WeekTrainingCard
      days={[day]} selected={0} onSelect={() => {}}
      blockLabel="Aufbaublock · Woche 2" doneChip="1 / 6" loadLabel="65 von 540 TSS"
      day={day}
      session={{ dur: null, blocks: [], ftpTag: '', earn: null }}
      weather={WEATHER} />
    </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the weather zone on a rest day', () => {
  it('does not offer a best riding window', () => {
    renderDay(dayToday({ title: null, planned: null, rest: true }))
    expect(screen.queryByText(/Bestes Fenster/i)).toBeNull()
    expect(screen.queryByText('17:00–19:00')).toBeNull()
  })

  it('does not stamp a ride verdict next to 0 TSS', () => {
    renderDay(dayToday({ title: null, planned: null, rest: true }))
    expect(screen.queryByText('RAUS DAMIT')).toBeNull()
  })

  it('still reports the conditions, because a rest day is still a day', () => {
    renderDay(dayToday({ title: null, planned: null, rest: true }))
    expect(screen.getByText(/19°\s*·\s*8 km\/h SW/)).toBeTruthy()
  })

  it('KEEPS the full window on a day that prescribes a session', () => {
    // The guard has to be specific to rest, or it would quietly delete the
    // feature on every other day of the week.
    renderDay(dayToday({ title: '4 × 8 Schwelle', planned: 112, targetW: '285 W', ftpPct: '98%' }))
    expect(screen.getByText(/Bestes Fenster/i)).toBeTruthy()
    expect(screen.getByText('RAUS DAMIT')).toBeTruthy()
  })
})
