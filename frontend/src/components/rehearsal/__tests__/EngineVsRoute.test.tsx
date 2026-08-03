import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import EngineVsRoute from '../EngineVsRoute'
import TimeInZones from '../TimeInZones'
import CostCard from '../CostCard'
import type { RehearsalDemand, RehearsalZone } from '../../../api/rehearsal'

afterEach(cleanup)

const demand = (over: Partial<RehearsalDemand>[] = []): RehearsalDemand[] =>
  [
    { duration_s: 300, required_w: 260, athlete_best_w: 312, spare_w: 52, ratio: 0.833 },
    { duration_s: 1200, required_w: 245, athlete_best_w: 280, spare_w: 35, ratio: 0.875 },
    { duration_s: 3600, required_w: 214, athlete_best_w: 252, spare_w: 38, ratio: 0.849 },
  ].map((d, i) => ({ ...d, ...(over[i] ?? {}) }))

describe('EngineVsRoute', () => {
  it('shows what the route demands next to what the rider has', () => {
    render(<EngineVsRoute demand={demand()} de={false} />)
    expect(screen.getByText(/YOUR ENGINE vs THIS ROUTE/i)).toBeTruthy()
    expect(screen.getByText('260')).toBeTruthy()
    expect(screen.getByText(/312/)).toBeTruthy()
  })

  it('reports the TIGHTEST margin, not the roomiest', () => {
    // A rider is limited by their worst duration. Averaging the three would
    // hide a 5-minute wall behind a comfortable hour.
    render(<EngineVsRoute demand={demand()} de={false} />)
    expect(screen.getByText(/\+35 W SPARE/)).toBeTruthy()
  })

  it('flags a route that asks for more than the rider has ever done', () => {
    const over = demand([{ athlete_best_w: 240, spare_w: -20, ratio: 1.08 }])
    render(<EngineVsRoute demand={over} de={false} />)
    expect(screen.getByText(/−20 W/)).toBeTruthy()
    expect(screen.getByText(/asks for more than you have ever held/i)).toBeTruthy()
  })

  it("still shows the road's demand to a rider with no recorded bests", () => {
    // The demand is a fact about the road. Withholding it would hide the one
    // thing we are certain of.
    const bare: RehearsalDemand[] = [
      { duration_s: 300, required_w: 260 },
      { duration_s: 1200, required_w: 245 },
    ]
    render(<EngineVsRoute demand={bare} de={false} />)
    expect(screen.getByText('260')).toBeTruthy()
    expect(screen.getByText(/Once you have bests over these durations/i)).toBeTruthy()
    // ... and claims no comparison it cannot make.
    expect(screen.queryByText(/SPARE/)).toBeNull()
  })

  it('renders nothing at all without a demand curve', () => {
    const { container } = render(<EngineVsRoute demand={[]} de={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('speaks German', () => {
    render(<EngineVsRoute demand={demand()} de />)
    expect(screen.getByText(/DEIN MOTOR vs DIESE STRECKE/)).toBeTruthy()
  })
})

const zones: RehearsalZone[] = [
  { zone: 1, name_en: 'Recovery', name_de: 'Erholung', seconds: 960, fraction: 0.08 },
  { zone: 2, name_en: 'Endurance', name_de: 'Grundlage', seconds: 5640, fraction: 0.46 },
  { zone: 3, name_en: 'Tempo', name_de: 'Tempo', seconds: 3420, fraction: 0.28 },
  { zone: 4, name_en: 'Threshold', name_de: 'Schwelle', seconds: 1740, fraction: 0.14 },
  { zone: 5, name_en: 'VO2 Max', name_de: 'VO2max', seconds: 480, fraction: 0.04 },
]

describe('TimeInZones', () => {
  it('lists every zone with its time and share', () => {
    render(<TimeInZones zones={zones} de={false} />)
    expect(screen.getByText('Endurance')).toBeTruthy()
    expect(screen.getByText('46%')).toBeTruthy()
  })

  it('says whether the route is carried by base or by top end', () => {
    render(<TimeInZones zones={zones} de={false} />)
    // 82% aerobic here.
    expect(screen.getByText(/Aerobic base carries this route/i)).toBeTruthy()
  })

  it('says the opposite when the route is genuinely hard', () => {
    const hard: RehearsalZone[] = [
      { zone: 1, name_en: 'Recovery', name_de: 'Erholung', seconds: 100, fraction: 0.05 },
      { zone: 2, name_en: 'Endurance', name_de: 'Grundlage', seconds: 400, fraction: 0.2 },
      { zone: 3, name_en: 'Tempo', name_de: 'Tempo', seconds: 500, fraction: 0.25 },
      { zone: 4, name_en: 'Threshold', name_de: 'Schwelle', seconds: 800, fraction: 0.4 },
      { zone: 5, name_en: 'VO2 Max', name_de: 'VO2max', seconds: 200, fraction: 0.1 },
    ]
    render(<TimeInZones zones={hard} de={false} />)
    expect(screen.getByText(/this is not a base ride/i)).toBeTruthy()
  })

  it('discloses when a CP stood in for a missing FTP', () => {
    render(<TimeInZones zones={zones} ftpUsedW={264} ftpIsCpFallback de={false} />)
    expect(screen.getByText(/binned against your CP \(264 W\)/i)).toBeTruthy()
  })

  it('renders nothing without zones to show', () => {
    const { container } = render(<TimeInZones zones={[]} de={false} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('CostCard', () => {
  const battery = { start_pct: 82, finish_pct: 18, cost_pct: 64, is_estimate: true }
  const matches = {
    count: 2,
    count_uncapped: 2,
    time_above_cp_s: 600,
    min_balance_j: 1200,
    fully_depleted: false,
    starts_s: [3000, 5400],
  }

  it('shows the battery from start to finish', () => {
    render(<CostCard battery={battery} de={false} />)
    expect(screen.getByText('82%')).toBeTruthy()
    expect(screen.getByText('≈ 18%')).toBeTruthy()
  })

  it('states the gap instead of drawing a battery from nothing', () => {
    // Forecasting a finish state from an unknown start is exactly the failure
    // the readiness gate exists to prevent.
    render(<CostCard battery={null} matches={matches} de={false} />)
    expect(screen.getByText(/needs today's readiness/i)).toBeTruthy()
    expect(screen.queryByText(/YOU START AT/i)).toBeNull()
  })

  it('turns matches into a pacing instruction, not just a count', () => {
    render(<CostCard battery={battery} matches={matches} de={false} />)
    expect(screen.getByText(/2 hard efforts in the tank/i)).toBeTruthy()
    expect(screen.getByText(/Spend them on the key climb/i)).toBeTruthy()
  })

  it('says plainly when the route has no hard effort to spare', () => {
    render(<CostCard battery={battery} matches={{ ...matches, count: 0 }} de={false} />)
    expect(screen.getByText(/no hard effort to spare/i)).toBeTruthy()
  })

  it('labels the training effect in words a Garmin user recognises', () => {
    render(
      <CostCard
        battery={battery}
        trainingEffect={{
          aerobic: 4.2,
          anaerobic: 2.1,
          recovery_hours_low: 36,
          recovery_hours_high: 60,
          is_estimate: true,
        }}
        de={false}
      />,
    )
    expect(screen.getByText('4.2')).toBeTruthy()
    expect(screen.getByText(/highly improving/i)).toBeTruthy()
    expect(screen.getByText('36–60 h')).toBeTruthy()
  })

  it('marks the whole card an estimate', () => {
    render(<CostCard battery={battery} de={false} />)
    expect(screen.getByText('estimate')).toBeTruthy()
  })

  it('renders nothing when it has nothing to say', () => {
    const { container } = render(<CostCard de={false} />)
    expect(container.innerHTML).toBe('')
  })
})
