/**
 * Visual harness for the Morning Wrap. Skipped in the normal suite.
 *   HARNESS_OUT=/tmp/mw.html npx vitest run src/editorial/__tests__/morningWrapHarness.test.tsx
 */
import { render } from '@testing-library/react'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'vitest'
import EditorialRoot from '../EditorialRoot'
import MorningWrapView from '../pages/MorningWrapView'
import { MORNING_WRAP_FIXTURE, MORNING_WRAP_NO_DATA } from '../pages/morningWrapFixture'

const OUT = process.env.HARNESS_OUT

function write(file: string, html: string, tokens: string) {
  // Read the ground out of tokens.css rather than repeating the hex: a literal
  // here would be a second place naming a colour, which isolation.test.ts
  // exists to prevent.
  const ground = /--e-bg:\s*([^;]+);/.exec(tokens)?.[1].trim() ?? 'black'
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:${ground}}${tokens}</style>
</head><body>${html}</body></html>`)
}

describe('morning wrap harness', () => {
  it.skipIf(!OUT)('writes the Morning Wrap to HTML', () => {
    const tokens = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')
    const base = OUT!.endsWith('.html') ? OUT!.slice(0, -5) : OUT!

    const a = render(<EditorialRoot state="resting"><MorningWrapView model={MORNING_WRAP_FIXTURE} /></EditorialRoot>)
    write(`${base}.html`, a.container.innerHTML, tokens)

    const b = render(<EditorialRoot state="resting"><MorningWrapView model={MORNING_WRAP_NO_DATA} /></EditorialRoot>)
    write(`${base}.nodata.html`, b.container.innerHTML, tokens)
  })
})
