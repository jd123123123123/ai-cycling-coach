import { describe, it, expect, afterEach } from 'vitest'
import { modeForBackdrop, WHITE_STUDIO_ID } from '../W3ModeProvider'
import { T, setW3Mode, w3Mode } from '../w3tokens'

/** The palette is read live through a proxy, so the mode has to change what
 *  `T` answers with — not just what a stylesheet says. */

afterEach(() => setW3Mode('dark'))

describe('white mode · which backdrop means which room', () => {
  it('is the white studio, and nothing else', () => {
    expect(modeForBackdrop(WHITE_STUDIO_ID)).toBe('light')
    expect(modeForBackdrop('studio_black')).toBe('dark')
    expect(modeForBackdrop('mountain_pass')).toBe('dark')
  })

  it('treats an unknown or absent stage as the dark room', () => {
    // A stage id this build has never heard of must not blank the app into a
    // half-lit state — the default room is the one every screen was drawn in.
    expect(modeForBackdrop(null)).toBe('dark')
    expect(modeForBackdrop(undefined)).toBe('dark')
    expect(modeForBackdrop('place:somewhere-new')).toBe('dark')
  })
})

describe('white mode · the palette answers differently', () => {
  it('turns the ground and the ink over', () => {
    setW3Mode('dark')
    const darkBg = T.bg, darkInk = T.ink
    setW3Mode('light')
    expect(T.bg).not.toBe(darkBg)
    expect(T.ink).not.toBe(darkInk)
    // Light ground, dark ink — the relationship, not just different values.
    expect(T.bg.toUpperCase()).toMatch(/^#F/)
    expect(T.ink.toUpperCase()).toMatch(/^#0/)
  })

  it('deepens the accent so it is still legible as type', () => {
    setW3Mode('dark')
    const darkAcid = T.acid
    setW3Mode('light')
    expect(T.acid).not.toBe(darkAcid)
  })

  it('keeps every token defined — a missing one would paint undefined', () => {
    setW3Mode('dark')
    const keys = Object.keys(T)
    expect(keys.length).toBeGreaterThan(50)
    setW3Mode('light')
    for (const k of keys) {
      expect(T[k as keyof typeof T], `light mode is missing ${k}`).toBeDefined()
    }
  })

  it('reports the mode it is in', () => {
    setW3Mode('light')
    expect(w3Mode()).toBe('light')
  })
})
