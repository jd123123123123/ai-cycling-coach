import { beforeEach, describe, expect, it } from 'vitest'
import {
  designSystemFromSearch, readDesignSystem, resolveLandingPath, writeDesignSystem,
} from '../state/designSystem'

describe('design system switch', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to v4 when nothing is stored', () => {
    expect(readDesignSystem()).toBe('v4')
  })

  it('round-trips the stored preference', () => {
    writeDesignSystem('editorial2')
    expect(readDesignSystem()).toBe('editorial2')
  })

  it('ignores a stored value that is not a design system', () => {
    localStorage.setItem('designSystem', 'neon')
    expect(readDesignSystem()).toBe('v4')
  })

  it('parses ?ds= and ignores anything else', () => {
    expect(designSystemFromSearch('?ds=editorial2')).toBe('editorial2')
    expect(designSystemFromSearch('?ds=v4')).toBe('v4')
    expect(designSystemFromSearch('?ds=neon')).toBeNull()
    expect(designSystemFromSearch('')).toBeNull()
  })

  it('lands on /dashboard by default and /e/today when editorial2 is stored', () => {
    expect(resolveLandingPath('')).toBe('/dashboard')
    writeDesignSystem('editorial2')
    expect(resolveLandingPath('')).toBe('/e/today')
  })

  it('?ds= overrides the stored preference and persists it', () => {
    writeDesignSystem('v4')
    expect(resolveLandingPath('?ds=editorial2')).toBe('/e/today')
    expect(readDesignSystem()).toBe('editorial2')
  })
})
