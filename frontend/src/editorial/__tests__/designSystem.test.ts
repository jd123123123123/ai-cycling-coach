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

  it('round-trips the stored preference', () => {
    writeDesignSystem('v4')
    expect(readDesignSystem()).toBe('v4')
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

  it('lands on W3 Today by default, and on /dashboard only when v4 is stored', () => {
    // W3 Today, not the older /e/today: that is the screen the tab bar and
    // every W3 route assume, and the guard that enforces onboarding wraps it.
    expect(resolveLandingPath('')).toBe('/e/w3-today')
    writeDesignSystem('v4')
    expect(resolveLandingPath('')).toBe('/dashboard')
  })

  it('?ds= overrides the stored preference and persists it', () => {
    writeDesignSystem('v4')
    expect(resolveLandingPath('?ds=editorial2')).toBe('/e/w3-today')
    expect(readDesignSystem()).toBe('editorial2')
  })
})
