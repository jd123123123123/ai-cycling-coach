import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DayPlan } from '../../../api/weeks'
import { nextDate, step, trainingImpact } from '../w3TrainingImpact'
import type { FormPoint } from '../w3TrainingImpact'
import { W3FormCardView } from '../W3FormCard'
import { setW3Mode } from '../w3tokens'

afterEach(() => { cleanup(); setW3Mode('dark') })
const today = '2026-09-09'
const entries: FormPoint[] = [
  { date: '2026-09-08', ctl: 34, atl: 40, tsb: -6, tss: 0 },
  step({ ctl: 34, atl: 40, tsb: -6 }, 0, today),
]
const day = (date: string, tss: number | null, secondary: number | null = null): DayPlan => ({ date, target_tss: tss, category: tss === 0 ? 'rest' : 'endurance', secondary_target_tss: secondary, secondary_title: secondary != null ? 'Run' : null, sport: 'cycling', title: 'Endurance', template_id: null, duration_seconds_target: 3600, intervals: [], rationale: '', is_today: date === today })
const days = [day('2026-09-10', 35), day('2026-09-11', 0), day('2026-09-12', 55)]
const args = { entries, today, state: 'quality' as const, target: 90, days }

describe('existing plan calculation', () => {
  it('adds today once and isolates its decaying contribution with full precision', () => {
    const r = trainingImpact(args)
    expect(r.mode).toBe('training')
    expect(r.plan[0].ctl).toBeCloseTo(entries[1].ctl + 90 / 42, 10)
    expect(r.plan.at(-1)!.ctl).toBeCloseTo((entries[1].ctl + 90 / 42) * (41 / 42) ** 3 + 35 / 42 * (41 / 42) ** 2 + 55 / 42, 10)
    expect(r.plan.at(-1)!.atl).toBeCloseTo((entries[1].atl + 90 / 7) * (6 / 7) ** 3 + 35 / 7 * (6 / 7) ** 2 + 55 / 7, 10)
    expect(r.plan.every(p => p.tsb === p.ctl - p.atl)).toBe(true)
  })
  it('never removes completed work or compares an unsafe/stale prescription', () => {
    for (const state of ['trained_already', 'sick', 'injured', 'break', 'planned_rest', null] as const) {
      expect(trainingImpact({ ...args, state }).mode).not.toBe('training')
    }
    expect(trainingImpact({ ...args, entries: [...entries.slice(0, -1), { ...entries[1], tss: 20 }] }).mode).toBe('completed')
    expect(trainingImpact({ ...args, entries: entries.slice(0, -1) }).mode).toBe('unavailable')
    expect(trainingImpact({ ...args, entries: [{ ...entries[1], tss: null }] }).mode).toBe('unavailable')
    for (const target of [null, -1, NaN, Infinity, 0]) expect(trainingImpact({ ...args, target }).mode).toBe('unavailable')
  })
  it('makes rest a zero-load plan and retains secondary sessions', () => {
    const rest = trainingImpact({ ...args, state: 'planned_rest', target: 90, days: [day(nextDate(today), 35, 20)] })
    expect(rest.target).toBe(0)
    expect(rest.plan[0].ctl).toBe(entries[1].ctl)
    expect(rest.plan[0].atl).toBe(entries[1].atl)
    expect(rest.plan[1].tss).toBe(55)
  })
  it('stops at a missing or unquantified date instead of fabricating future rest', () => {
    expect(trainingImpact({ ...args, days: days.slice(1) }).plan).toHaveLength(1)
    expect(trainingImpact({ ...args, days: [day(nextDate(today), null)] }).plan).toHaveLength(1)
    expect(trainingImpact({ ...args, days: [{ ...day(nextDate(today), 30), secondary_title: 'Unknown run' }] }).plan).toHaveLength(1)
  })
})
describe('form card interaction', () => {
  it('shows history and the existing plan with explanations on demand, without comparison controls', () => {
    render(<W3FormCardView entries={entries} impact={trainingImpact(args)} />)
    expect(screen.queryByText(/Fitness ist dein langfristiger/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fitness erklären' }))
    expect(screen.getByRole('status').textContent).toContain('0 TSS erfasst')
    expect(screen.queryByRole('button', { name: 'Heute pausieren' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mit Einheit' })).toBeNull()
    expect(screen.queryByText(/Fitness mit dieser Einheit/)).toBeNull()
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(screen.getByText('Plan · 11. Sept.')).toBeTruthy()
  })
  it('supports a prescribed rest day without training prompts', () => {
    render(<W3FormCardView entries={entries} impact={trainingImpact({ ...args, state: 'planned_rest' })} />)
    expect(screen.getByText('Deine Form')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Heute pausieren' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Heutige Einheit ansehen' })).toBeNull()
  })
  it('resolves metric text colors after switching to light mode', () => {
    setW3Mode('light')
    render(<W3FormCardView entries={entries} />)
    expect(screen.getByRole('button', { name: 'Fitness erklären' }).style.color).toBe('rgb(11, 11, 11)')
  })
  it('handles empty and invalid histories without drawing imaginary data', () => {
    const { container } = render(<W3FormCardView entries={[{ ctl: NaN, atl: 2, tsb: 0 }]} />)
    expect(container.innerHTML).toBe('')
  })
})
