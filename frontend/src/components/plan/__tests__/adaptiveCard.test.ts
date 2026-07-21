import { describe, expect, it } from 'vitest'
import { isSuperseded } from '../AdaptiveCard'
import type { PlanAdaptation } from '../../../api/plan'

const row = (over: Partial<PlanAdaptation>): PlanAdaptation => ({
  id: 1,
  created_at: '2026-07-21T06:00:00Z',
  target_date: '2026-07-23',
  source: 'hourly_engine',
  signal: 'short_sleep',
  rule: 'sleep_hrv_downgrade',
  before: null,
  after: { template_id: 'sweet_spot_3x20', title: 'Sweet spot — 3×20min' },
  evidence: null,
  message_de: 'x',
  message_en: 'x',
  ...over,
})

const week = (entries: Array<[string, string | null, string]>) =>
  new Map(entries.map(([d, tid, title]) => [d, { template_id: tid, title }]))

describe('isSuperseded', () => {
  it('marks a row whose after-session no longer matches the current plan for that date', () => {
    const a = row({})
    const cur = week([['2026-07-23', 'vo2_5x4', 'VO2 — 5×4min']])
    expect(isSuperseded(a, cur)).toBe(true)
  })

  it('does NOT mark a row whose after-session still matches the current plan', () => {
    const a = row({})
    const cur = week([['2026-07-23', 'sweet_spot_3x20', 'Sweet spot — 3×20min']])
    expect(isSuperseded(a, cur)).toBe(false)
  })

  it('never marks a date outside the loaded week (we do not guess)', () => {
    const a = row({ target_date: '2026-08-15' })
    const cur = week([['2026-07-23', 'vo2_5x4', 'VO2 — 5×4min']])
    expect(isSuperseded(a, cur)).toBe(false)
  })

  it('never marks a row with no after-session identity', () => {
    const a = row({ after: null })
    const cur = week([['2026-07-23', 'vo2_5x4', 'VO2 — 5×4min']])
    expect(isSuperseded(a, cur)).toBe(false)
  })

  it('falls back to title comparison when template_id is absent', () => {
    const a = row({ after: { title: 'Sweet spot — 3×20min' } })
    const curSame = week([['2026-07-23', null, 'Sweet spot — 3×20min']])
    const curDiff = week([['2026-07-23', null, 'Lockere Ausfahrt — 60min']])
    expect(isSuperseded(a, curSame)).toBe(false)
    expect(isSuperseded(a, curDiff)).toBe(true)
  })
})
