import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HEAD } from '../W3TopBar'

/**
 * ONE HEADER, EVERYWHERE.
 *
 * The gear is the only control available from every screen in the app, and it
 * used to move: the hero room (Today, Fahrten, Plan, Erfolge, Garage) carried
 * it in a chip stack at the TOP LEFT, while every screen outside the room puts
 * it at the far right of `W3TopBar` — 10px higher and 4px further out. Moving
 * between them, a rider had to find the menu twice.
 *
 * The room has no top bar on purpose (its stage is the header), so the two
 * cannot share a component — they share the GEOMETRY instead, and these tests
 * exist because two magic numbers in two files is exactly how it drifted.
 */

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8')

describe('the header is one system', () => {
  it('the geometry has a single definition', () => {
    expect(HEAD.top).toBe('calc(var(--w3-header-safe-top, env(safe-area-inset-top, 0px)) + 6px)')
    expect(HEAD.row).toBe(56)
    expect(HEAD.inset).toBe(20)
    expect(HEAD.control).toBe(44)
  })

  it('the stage positions its chips from that definition, not from literals', () => {
    const src = read('../W3TodayStage.tsx')
    expect(src).toContain("import { HEAD } from './W3TopBar'")
    expect(src).toContain('top: HEAD.top, left: HEAD.inset')
    expect(src).toContain('top: HEAD.top, right: HEAD.inset')
    // The old hand-tuned coordinates must not come back.
    expect(src).not.toContain('top: 8, left: 16')
    expect(src).not.toContain('top: 8, right: 16')
  })

  it('the menu is in the RIGHT column of the stage, where the bar puts it', () => {
    const src = read('../W3TodayStage.tsx')
    const rightColumnAt = src.indexOf('right: HEAD.inset')
    const navAt = src.indexOf('<W3NavMenu />')
    expect(rightColumnAt).toBeGreaterThan(-1)
    expect(navAt).toBeGreaterThan(rightColumnAt)
  })

  it('the bar itself derives its padding from the same definition', () => {
    const src = read('../W3TopBar.tsx')
    expect(src).toContain('padding: `0 ${HEAD.inset}px`')
  })

  it('no live screen ships a header bar with neither title nor back', () => {
    // A bar with only the avatar and the gear reads as a broken header. The
    // profile is the one deliberate exception: the tab bar already names it,
    // and the docblock says so.
    const offenders: string[] = []
    for (const f of ['../W3ReferralsView.tsx', '../W3RidesView.tsx']) {
      const src = read(f)
      if (/<W3TopBar\s*\/>/.test(src)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})
