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

  it('declares the depth ramp d-1 through d-4', () => {
    for (const n of [1, 2, 3, 4]) expect(css).toMatch(new RegExp(`--d-${n}\\s*:`))
  })
})
