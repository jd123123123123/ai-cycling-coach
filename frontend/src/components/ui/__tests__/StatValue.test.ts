/**
 * StatValue.test.ts — the honest-dash rule is ENFORCED, not aspirational
 * (audit P2-16): untracked never renders as 0. Tests target the pure
 * resolution core (node-env vitest, no rendering — see vite.config.ts).
 */
import { describe, it, expect } from 'vitest'
import { resolveStatValue, honestPercent, DASH } from '../StatValue'

describe('resolveStatValue — untracked never renders as 0', () => {
  it('null/undefined value → dash + localized "not tracked" caption', () => {
    const en = resolveStatValue({ value: null })
    expect(en.text).toBe(DASH)
    expect(en.caption).toBe('not tracked')
    expect(en.untracked).toBe(true)

    const deRes = resolveStatValue({ value: undefined, de: true })
    expect(deRes.text).toBe(DASH)
    expect(deRes.caption).toBe('nicht erfasst')
  })

  it('trackedWhen === false forces the dash even when a number exists', () => {
    const d = resolveStatValue({ value: 0, trackedWhen: false })
    expect(d.text).toBe(DASH)
    expect(d.text).not.toBe('0')
    expect(d.untracked).toBe(true)

    // A plausible-looking but untracked value must not leak either.
    expect(resolveStatValue({ value: 73, trackedWhen: false }).text).toBe(DASH)
  })

  it('NaN and empty string are missing, not zero', () => {
    expect(resolveStatValue({ value: Number.NaN }).text).toBe(DASH)
    expect(resolveStatValue({ value: '' }).text).toBe(DASH)
  })

  it('suppresses the unit next to a dash ("— %" is a lie)', () => {
    const d = resolveStatValue({ value: null, unit: '%' })
    expect(d.unit).toBeNull()
  })

  it('a TRACKED zero renders as 0 with its unit — real zeros are real', () => {
    const d = resolveStatValue({ value: 0, unit: 'TSS', trackedWhen: true })
    expect(d.text).toBe('0')
    expect(d.unit).toBe('TSS')
    expect(d.untracked).toBe(false)
  })

  it('tracked values pass through with their caption', () => {
    const d = resolveStatValue({ value: '82%', caption: 'bedtime variance' })
    expect(d.text).toBe('82%')
    expect(d.caption).toBe('bedtime variance')
    expect(d.untracked).toBe(false)
  })

  it('untrackedCaption overrides the default reason (e.g. "zu wenig Nächte")', () => {
    const d = resolveStatValue({ value: null, untrackedCaption: 'zu wenig Nächte', de: true })
    expect(d.caption).toBe('zu wenig Nächte')
  })
})

describe('honestPercent re-export (single import path for tiles)', () => {
  it('is the same honest gate as utils/format', () => {
    expect(honestPercent(0, false)).toBe(DASH)
    expect(honestPercent(null)).toBe(DASH)
    expect(honestPercent(0)).toBe('0%')
    expect(honestPercent(64.7)).toBe('65%')
  })
})
