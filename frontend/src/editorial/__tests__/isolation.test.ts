// The whole EDITORIAL II architecture rests on a one-way dependency:
// editorial/ may import from api/, hooks/, utils/, contexts/ and
// components/ui/ — but nothing outside editorial/ may import from it, and
// editorial/components/ (the presentational layer) may not reach for data
// itself. This file makes that guarantee automated rather than aspirational.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

// Strip comments before scanning for hex literals. The pen-transcription
// record cites the pen's own colours constantly in prose ("fill #FF5E00 ->
// --st-trained") — that is documentation, not a style value, and the brief
// is explicit that it's fine and common here.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('editorial isolation', () => {
  const all = walk(SRC)
  const outside = all.filter((f) => !f.includes(`${path.sep}editorial${path.sep}`))

  it('nothing outside editorial/ imports from editorial/, except App.tsx', () => {
    // App.tsx is the one permitted inbound edge: it registers the
    // editorial routes. Everything else outside editorial/ must stay
    // ignorant that editorial/ exists at all.
    const offenders = outside.filter((f) => {
      if (path.basename(f) === 'App.tsx') return false
      return /from\s+['"][^'"]*\/editorial\//.test(readFileSync(f, 'utf8'))
    })
    expect(offenders).toEqual([])
  })

  it('editorial components never import hooks directly or call the view-model hooks — data enters via data/ and the pages', () => {
    const components = all.filter((f) => f.includes(`${path.sep}editorial${path.sep}components${path.sep}`))
    const offenders = components.filter((f) => {
      const src = readFileSync(f, 'utf8')
      // Components/ui/RouteSketch is a deliberate, permitted outbound
      // import (the shared route-thumbnail renderer) — it is not a data
      // hook, and living under components/ui/ makes it fine per the
      // architecture's own allowlist (editorial/ -> components/ui/).
      // Excluding it here just means the hooks-import check below doesn't
      // false-positive on its import line; it's still checked by the
      // outbound-hex and inbound-import assertions like everything else.
      const withoutRouteSketch = src.replace(/^.*RouteSketch.*$/gm, '')
      const importsHooks = /from\s+['"][^'"]*\/hooks\//.test(withoutRouteSketch)
      const callsViewModel = /\buseTodayModel\s*\(|\buseSessionModel\s*\(/.test(src)
      return importsHooks || callsViewModel
    })
    expect(offenders).toEqual([])
  })

  it('editorial declares no raw hex colours in style values — every colour is a token', () => {
    // i18n/ and motion/ are internal-only modules (copy strings, animation
    // timing helpers) with no colour concerns; they're allowed like every
    // other editorial/ subtree, this comment just documents that they were
    // considered, per the brief.
    const files = all.filter((f) => f.includes(`${path.sep}editorial${path.sep}`) && !f.endsWith('tokens.css'))
    const offenders = files.filter((f) => {
      // ── WHERE HEX IS THE SUBJECT, NOT THE STYLING ──────────────────
      // Two kinds of file are exempt, and only two.
      //
      // PALETTE SOURCES must contain hex or there is nothing to tokenise
      // against: `tokens.css` (excluded above), `w3/w3tokens.tsx` — the same
      // role for W3 — and `w3/w3map.ts`, which is the BASEMAP's palette:
      // land, water, parks, road weights. Those have no token equivalents and
      // should not get them. Nothing else in this app is a lake, and inventing
      // `T.water` to satisfy a lint rule would put a colour in the design
      // system that no component may use. `w3/w3stageThemes.ts` is the same
      // role for the hero room's backdrops: a dawn's ember and a night's
      // star-blue ARE the theme, belong to exactly one stage each, and a
      // `T.morgenfahrtEmber` token would be a colour no component may use.
      //
      // COLOUR TESTS compare hex as EXPECTED VALUES. `tokens` asserts
      // tokens.css matches the pen; `fadeRunway` measures the distance between
      // two colours, so hex IS its input; `groundColour` reads a colour back
      // out of a rendered scene and pins the exact string, including the
      // zero-padding bug it exists to catch (#050505 once came out "#555");
      // `boardPalette` computes ΔE between the board tints. Expressing any of
      // them in tokens would make the test assert nothing about the numbers it
      // exists to pin.
      //
      // A test that STYLES something with hex is still an offender — that is
      // why this is a named list and not a blanket `__tests__` exemption.
      const EXEMPT = [
        `${path.sep}w3${path.sep}w3tokens.tsx`,
        `${path.sep}w3${path.sep}w3map.ts`,
        `${path.sep}w3${path.sep}w3stageThemes.ts`,
        `${path.sep}__tests__${path.sep}tokens.test.ts`,
        `${path.sep}__tests__${path.sep}fadeRunway.test.ts`,
        `${path.sep}__tests__${path.sep}groundColour.test.ts`,
        `${path.sep}__tests__${path.sep}boardPalette.test.ts`,
      ]
      if (EXEMPT.some((e) => f.endsWith(e))) return false
      const src = stripComments(readFileSync(f, 'utf8'))
      return /#[0-9a-fA-F]{6}\b/.test(src)
    })
    expect(offenders).toEqual([])
  })
})
