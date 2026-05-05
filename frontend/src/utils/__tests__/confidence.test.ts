/**
 * confidence.test.ts — unit tests for the honesty primitive's threshold logic.
 *
 * STATUS: PENDING (vitest not installed — per STATE.md decision [06.1-01]).
 * To activate: install vitest + jsdom; uncomment the import block; uncomment expect() calls.
 *
 * Why these tests exist even before the runner: thresholds are load-bearing.
 * Drifting MIN_DAYS_HRV from 7 to 5 silently is exactly the kind of regression
 * that erodes user trust in the honesty layer.
 */

// import { describe, it, expect } from 'vitest'
import {
  confidence,
  MIN_DAYS_HRV,
  MIN_DAYS_CTL_TREND,
  MIN_DAYS_POLARIZED,
} from '../confidence'

// describe('confidence thresholds (pinned)', () => {
//   it('MIN_DAYS_HRV is 7', () => expect(MIN_DAYS_HRV).toBe(7))
//   it('MIN_DAYS_CTL_TREND is 14', () => expect(MIN_DAYS_CTL_TREND).toBe(14))
//   it('MIN_DAYS_POLARIZED is 7', () => expect(MIN_DAYS_POLARIZED).toBe(7))
// })

// describe('confidence(input)', () => {
//   it('returns "low" when n_days < min_days', () => {
//     expect(confidence({ n_days: 6, min_days: 7 })).toBe('low')
//   })
//   it('returns "high" when n_days >= min_days', () => {
//     expect(confidence({ n_days: 7, min_days: 7 })).toBe('high')
//     expect(confidence({ n_days: 14, min_days: 7 })).toBe('high')
//   })
//   it('returns "low" when any precondition is false', () => {
//     expect(confidence({ n_days: 30, min_days: 7, preconditions: { has_ftp: false } })).toBe('low')
//   })
//   it('returns "low" when any precondition is null/undefined', () => {
//     expect(confidence({ n_days: 30, min_days: 7, preconditions: { has_ftp: null } })).toBe('low')
//   })
//   it('returns "high" when n_days satisfied AND all preconditions true', () => {
//     expect(confidence({ n_days: 30, min_days: 7, preconditions: { has_ftp: true, has_lthr: true } })).toBe('high')
//   })
//   it('returns "low" on missing n_days', () => {
//     expect(confidence({ min_days: 7 })).toBe('low')
//   })
// })

// Compile-only smoke (active even without vitest): forces TS to typecheck the imports
void confidence
void MIN_DAYS_HRV
void MIN_DAYS_CTL_TREND
void MIN_DAYS_POLARIZED
