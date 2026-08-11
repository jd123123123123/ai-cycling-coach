/**
 * Visual harness for the Morning Wrap deck. Skipped in the normal suite.
 *   HARNESS_OUT=/tmp/mw.html npx vitest run src/editorial/__tests__/morningWrapHarness.test.tsx
 *
 * Writes three files:
 *   mw.html          the deck as it ships — one chapter, 100dvh, snapping
 *   mw.stacked.html  the same deck with the snap container unwound, so all
 *                    seven chapters can be screenshotted in one pass (the
 *                    archive harness cannot do this, and its own comment
 *                    records that as the reason it shows so little)
 *   mw.nodata.html   every reading withheld — the arm that must never invent
 */
import { render } from '@testing-library/react'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'vitest'
import MorningDeckView from '../morning/MorningDeckView'
import { MORNING_WRAP_FIXTURE, MORNING_WRAP_NO_DATA } from '../morning/fixture'

const OUT = process.env.HARNESS_OUT

/** Unwinds the 100dvh snap container so every chapter paints in one document.
 *  Layout-only, and confined to this file — it never ships. */
const STACKED = `
.morning-root { height: auto; overflow: visible; }
.morning-deck { position: static; height: auto; overflow: visible; }
.morning-chapter { min-height: 844px; }
.morning-rail, .morning-peek { display: none; }
`

function write(file: string, html: string, css: string, extra = '') {
  // Read the ground out of tokens.css rather than repeating the hex: a literal
  // here would be a second place naming a colour, which isolation.test.ts
  // exists to prevent.
  const ground = /--g-morning:\s*([^;]+);/.exec(css)?.[1].trim() ?? 'black'
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:${ground}}${css}${extra}</style>
</head><body>${html}</body></html>`)
}

describe('morning wrap harness', () => {
  it.skipIf(!OUT)('writes the Morning Wrap deck to HTML', () => {
    const css =
      readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8') +
      readFileSync(path.join(__dirname, '..', 'morning', 'morning.css'), 'utf8')
    const base = OUT!.endsWith('.html') ? OUT!.slice(0, -5) : OUT!

    const a = render(<MorningDeckView model={MORNING_WRAP_FIXTURE} />)
    write(`${base}.html`, a.container.innerHTML, css)
    write(`${base}.stacked.html`, a.container.innerHTML, css, STACKED)

    const b = render(<MorningDeckView model={MORNING_WRAP_NO_DATA} />)
    write(`${base}.nodata.html`, b.container.innerHTML, css, STACKED)
  })
})
