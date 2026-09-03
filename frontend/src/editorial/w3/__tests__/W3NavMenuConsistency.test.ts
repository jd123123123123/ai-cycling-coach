import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ONE MENU BUTTON, ACROSS EVERY SCREEN.
 *
 * The bug this locks shut: the same sheet was opened by a gear on Today and by
 * a hamburger on Biker, Fahrten and Plan, because W3TopBar took the bare
 * defaults and the stage passed its own props. Two promises, one destination.
 *
 * Asserted against the SOURCE rather than a render, because the thing that
 * must stay true is that no call site restates the treatment — a render can
 * only tell us about the call sites a test happens to mount, and the next
 * screen to add a header is the one that gets it wrong.
 */

const dir = join(__dirname, '..')
const read = (f: string) => readFileSync(join(dir, f), 'utf8')

describe('the header menu', () => {
  it('is styled in exactly one place — its own defaults', () => {
    const overriders = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx') && f !== 'W3NavMenu.tsx')
      // The whole tag, then keep only the ones carrying a prop — `<W3NavMenu />`
      // has a space before the slash and must not read as an override.
      .flatMap((f) => (read(f).match(/<W3NavMenu\b[^>]*>/g) ?? [])
        .filter((tag) => tag.includes('='))
        .map((tag) => `${f}: ${tag}`))
    // A call site may pass nothing. Anything else is a second design.
    expect(overriders).toEqual([])
  })

  it('defaults to the gear on the round-icon-button ground', () => {
    const src = read('W3NavMenu.tsx')
    expect(src).toMatch(/iconSize = 20/)
    expect(src).toMatch(/background = T\.heroChip/)
    expect(src).toMatch(/Icon = Settings/)
  })

  it('and the button beside it in the top bar shares that ground', () => {
    // Back and menu are both 44px round icon buttons in one row; one on
    // `surface` and one on `heroChip` is visible as a mismatch at a glance.
    const bar = read('W3TopBar.tsx')
    const back = bar.slice(bar.indexOf('aria-label="Zurück"'))
    expect(back.slice(0, 160)).toMatch(/background: T\.heroChip/)
  })
})
