import { beforeEach, describe, expect, it } from 'vitest'
import {
  designSystemFromSearch, readDesignSystem, resolveLandingPath, writeDesignSystem,
} from '../state/designSystem'

describe('design system switch', () => {
  beforeEach(() => localStorage.clear())

  // The W3 app is the DEFAULT now, and the only one anything links to. The v4
  // dashboard still exists — it holds surfaces W3 has not replaced yet — but it
  // takes a deliberate ?ds=v4 to reach it. These assertions are the switch that
  // says so, and they flipped when the old app was hidden.
  it('defaults to the W3 app when nothing is stored', () => {
    expect(readDesignSystem()).toBe('editorial2')
  })

  // Only editorial2 round-trips. v4 deliberately does not persist — see
  // "does not remember v4 even when it is asked to" below.
  it('round-trips the stored preference', () => {
    writeDesignSystem('editorial2')
    expect(readDesignSystem()).toBe('editorial2')
  })

  it('ignores a stored value that is not a design system', () => {
    localStorage.setItem('designSystem', 'neon')
    expect(readDesignSystem()).toBe('editorial2')
  })

  it('parses ?ds= and ignores anything else', () => {
    expect(designSystemFromSearch('?ds=editorial2')).toBe('editorial2')
    expect(designSystemFromSearch('?ds=v4')).toBe('v4')
    expect(designSystemFromSearch('?ds=neon')).toBeNull()
    expect(designSystemFromSearch('')).toBeNull()
  })

  it('lands on W3 Today by default', () => {
    // W3 Today, not the older /e/today: that is the screen the tab bar and
    // every W3 route assume, and the guard that enforces onboarding wraps it.
    expect(resolveLandingPath('')).toBe('/e/w3-today')
  })

  // REPORTED FROM PRODUCTION 2026-08-19: a rider logged in after a deploy and
  // saw neither the new app nor the new onboarding. Their browser still carried
  // `designSystem: 'v4'` from the one time they opened the documented `?ds=v4`
  // escape hatch, and the root redirect had been answering /dashboard ever
  // since — across every release, with nothing in the product able to undo it.
  it('never lets a stored v4 pin a rider to the retired app', () => {
    localStorage.setItem('designSystem', 'v4')
    expect(resolveLandingPath('')).toBe('/e/w3-today')
    // …and the stale value is cleared, so the browser heals itself.
    expect(localStorage.getItem('designSystem')).toBeNull()
  })

  it('does not remember v4 even when it is asked to', () => {
    writeDesignSystem('v4')
    expect(localStorage.getItem('designSystem')).toBeNull()
    expect(readDesignSystem()).toBe('editorial2')
  })

  it('still reaches the old app for one visit via ?ds=v4', () => {
    // The escape hatch has to keep working — v4 holds surfaces W3 has not
    // replaced. It just does not survive the reload any more.
    expect(resolveLandingPath('?ds=v4')).toBe('/dashboard')
    expect(resolveLandingPath('')).toBe('/e/w3-today')
  })

  it('?ds=editorial2 overrides a stored value and persists it', () => {
    localStorage.setItem('designSystem', 'v4')
    expect(resolveLandingPath('?ds=editorial2')).toBe('/e/w3-today')
    expect(readDesignSystem()).toBe('editorial2')
  })
})
