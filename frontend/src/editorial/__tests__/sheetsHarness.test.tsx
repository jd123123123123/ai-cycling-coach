/**
 * Visual harness for Task 13's two bottom sheets. Standalone — does NOT
 * touch `TodayView`/`TodayPage` (owned by another agent mid-edit), so this
 * mirrors `visualHarness.test.tsx`'s write-to-HTML pattern but mounts each
 * sheet directly, open, over a plain dark backdrop standing in for the page
 * behind it.
 *
 * Usage:
 *   HARNESS_OUT=/tmp/sheets.html npx vitest run src/editorial/__tests__/sheetsHarness.test.tsx
 *   python3 -m http.server 9700 --directory /tmp
 * then open http://localhost:9700/sheets.html (Switch Day Type, rest→training),
 * http://localhost:9700/sheets.training.html (Switch, training→rest) and
 * http://localhost:9700/sheets.back.html (Back To Session Done) at 390x844.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import BackToSessionDoneSheet from '../components/BackToSessionDoneSheet'
import SwitchDayTypeSheet from '../components/SwitchDayTypeSheet'

const OUT = process.env.HARNESS_OUT

afterEach(cleanup)

// This harness writes ONE static frame per sheet, captured the instant
// `render()` returns. `Sheet`'s own entrance animation starts translated off
// the bottom edge and only reaches `translateY(0)` after a `rAF` tick most
// test runners never advance for a synchronous snapshot like this one — left
// alone, every harness file would show only the scrim (the panel still
// pushed below the viewport). Reduced motion makes `Sheet` paint its final,
// settled state on the very first render instead, which is what a static
// HTML file needs to be useful here.
window.matchMedia = ((query: string) => ({
  matches: query.includes('reduce'),
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
})) as unknown as typeof window.matchMedia

// Each `it` needs its OWN fresh `#editorial-sheet-root` — `Sheet.tsx` looks
// it up by id, and a stale one left over from a prior test in this file
// (RTL's `cleanup()` unmounts React trees but does not remove DOM nodes we
// appended by hand) would silently steal every later portal.
function mountPortalTarget() {
  document.getElementById('editorial-sheet-root')?.remove()
  const el = document.createElement('div')
  el.id = 'editorial-sheet-root'
  document.body.appendChild(el)
  return el
}

function writeHarness(suffix: '' | 'training' | 'back', bodyHtml: string, ground: string) {
  const tokens = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')
  const base = OUT!.endsWith('.html') ? OUT!.slice(0, -5) : OUT!
  const finalPath = suffix === '' ? OUT! : `${base}.${suffix}.html`
  writeFileSync(finalPath, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#000}${tokens}
.editorial-root{position:relative;width:390px;height:844px;overflow:hidden;background:${ground}}
</style>
</head><body><div class="editorial-root">${bodyHtml}</div></body></html>`)
}

describe('sheets visual harness', () => {
  // `Sheet` portals into `#editorial-sheet-root`, which RTL mounts as a
  // sibling of its own render container, not a descendant — so the sheet's
  // actual markup lives in `portalRoot.innerHTML`, not `container.innerHTML`.
  it.skipIf(!OUT)('writes SwitchDayTypeSheet (rest -> training) to HTML', () => {
    const portalRoot = mountPortalTarget()
    render(<SwitchDayTypeSheet open current="rest" onPick={() => {}} onClose={() => {}} />)
    writeHarness('', portalRoot.innerHTML, 'var(--g-rest)')
  })

  it.skipIf(!OUT)('writes SwitchDayTypeSheet (training -> rest) to HTML', () => {
    const portalRoot = mountPortalTarget()
    render(<SwitchDayTypeSheet open current="training" onPick={() => {}} onClose={() => {}} />)
    writeHarness('training', portalRoot.innerHTML, 'var(--g-training)')
  })

  it.skipIf(!OUT)('writes BackToSessionDoneSheet to HTML', () => {
    const portalRoot = mountPortalTarget()
    render(<BackToSessionDoneSheet open onConfirm={() => {}} onClose={() => {}} />)
    writeHarness('back', portalRoot.innerHTML, 'var(--g-resting)')
  })
})
