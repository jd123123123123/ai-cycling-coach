/**
 * Visual harness for the Archive deck. Skipped in the normal suite.
 *   HARNESS_OUT=/tmp/ar.html npx vitest run src/editorial/__tests__/archiveHarness.test.tsx
 * then serve /tmp and open at 390×844.
 *
 * Writes one file per chapter so each snap section can be looked at on its
 * own — the deck itself is 100dvh-per-chapter, which a single screenshot
 * cannot show.
 */
import { render } from '@testing-library/react'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'vitest'
import ArchiveDeckView from '../archive/ArchiveDeckView'
import { MONTH_FIXTURE } from '../archive/archiveFixture'

const OUT = process.env.HARNESS_OUT

describe('archive harness', () => {
  it.skipIf(!OUT)('writes the Archive deck to HTML', () => {
    const { container } = render(<ArchiveDeckView model={MONTH_FIXTURE} />)
    const css = readFileSync(path.join(__dirname, '..', 'archive', 'archive.css'), 'utf8')
    const tokens = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')
    // Read the ground out of tokens.css rather than repeating the hex here —
    // a literal in this file would be a second place naming a colour, which
    // is what isolation.test.ts exists to prevent.
    const ground = /--ar-ground:\s*([^;]+);/.exec(tokens)?.[1].trim() ?? 'black'
    const base = OUT!.endsWith('.html') ? OUT!.slice(0, -5) : OUT!
    writeFileSync(`${base}.html`, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Instrument+Serif:ital@0;1&family=Archivo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:${ground}}${tokens}${css}</style>
</head><body>${container.innerHTML}</body></html>`)
  })
})
