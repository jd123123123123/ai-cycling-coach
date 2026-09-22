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

describe('shared light surfaces', () => {
  const luminance=(hex:string)=>{const c=hex.slice(1,7).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722}
  const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  it('uses pure white for the page and neutral surfaces for controls',()=>{
    setW3Mode('light');expect(T.bg).toBe('#FFFFFF')
    for(const token of [T.surface,T.surface2,T.heroChip]){expect(token.slice(1,3)).toBe(token.slice(3,5));expect(token.slice(3,5)).toBe(token.slice(5,7))}
  })
  it('keeps primary, secondary and accent text readable on every navigation surface',()=>{
    setW3Mode('light')
    for(const bg of [T.bg,T.surface,T.surface2,T.heroChip]) for(const ink of [T.ink,T.mid,T.quiet,T.acid]) expect(contrast(ink,bg),`${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(T.heroInk,T.acid)).toBeGreaterThanOrEqual(4.5)
  })
})
