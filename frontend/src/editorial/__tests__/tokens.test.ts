import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')

describe('EDITORIAL II tokens', () => {
  it('declares every token under .editorial-root only', () => {
    expect(css).toContain('.editorial-root')
    expect(css).not.toMatch(/^:root/m)
  })

  it('carries the pen palette verbatim', () => {
    const expected: Record<string, string> = {
      '--e-bg': '#08090C', '--e-ink': '#FFFFFF', '--e-mid': '#8A9099',
      '--e-lo': '#4A5058', '--e-quiet': '#767D87', '--e-acid': '#C8FF00',
      '--e-rule': '#FFFFFF1F', '--e-glass': '#FFFFFF0F', '--e-cool': '#6B8CFF',
      '--e-warn': '#FF9F1C', '--e-bad': '#FF4D4D',
      '--st-rest': '#C8FF00', '--st-training': '#2BE68F', '--st-trained': '#FF5E00',
      '--st-resting': '#00E5FF', '--st-evening': '#7B5CFF',
      '--m-hrv': '#00E5FF', '--m-sleep': '#ED29FF', '--m-cardiac': '#FF47B2',
      '--m-load': '#FF5E00', '--m-form': '#A8D400', '--m-fatigue': '#7099EB',
      '--s-good': '#2BE68F', '--s-mid': '#FFB020', '--s-low': '#FF4356',
    }
    for (const [name, hex] of Object.entries(expected)) {
      expect(css).toMatch(new RegExp(`${name}\\s*:\\s*${hex}\\b`, 'i'))
    }
  })

  it('carries the depth ramp verbatim', () => {
    // Pen-verified (2026-08-05): the pen's ramp is NOT evenly stepped, and
    // d-2..d-4 differ from this plan's first draft. These are the pen's.
    const ramp: Record<string, string> = {
      '--d-1': '#FFFFFF14', '--d-2': '#FFFFFF2B',
      '--d-3': '#FFFFFF4D', '--d-4': '#FFFFFF8C',
    }
    for (const [name, hex] of Object.entries(ramp)) {
      expect(css).toMatch(new RegExp(`${name}\\s*:\\s*${hex}\\b`, 'i'))
    }
  })

  it('carries the pen-verified per-state grounds', () => {
    const grounds: Record<string, string> = {
      '--g-rest': '#0A0B05', '--g-training': '#05100A', '--g-trained': '#120B05',
      '--g-resting': '#051012', '--g-evening': '#0A0816', '--g-session': '#05100A',
    }
    for (const [name, hex] of Object.entries(grounds)) {
      expect(css).toMatch(new RegExp(`${name}\\s*:\\s*${hex}\\b`, 'i'))
    }
  })

  it('declares the pill radius, the off-foreground, and the accent alphas', () => {
    expect(css).toMatch(/--radius-pill\s*:\s*100px\b/i)
    expect(css).toMatch(/--e-off\s*:\s*#3E444C\b/i)
    for (const name of ['--st-a07', '--st-a12', '--st-a28', '--st-a40']) {
      expect(css).toMatch(new RegExp(`${name}\\s*:\\s*color-mix\\(`, 'i'))
    }
  })

  it('carries the Cover Meta row Avatar ring verbatim (topbar task)', () => {
    expect(css).toMatch(/--e-avatar-ring\s*:\s*#FFFFFF29\b/i)
  })
})
