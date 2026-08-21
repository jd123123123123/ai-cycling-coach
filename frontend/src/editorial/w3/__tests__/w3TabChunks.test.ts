import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const chunks = readFileSync(join(SRC, 'w3TabChunks.ts'), 'utf8')
const bar = readFileSync(join(SRC, 'W3TabBar.tsx'), 'utf8')
const app = readFileSync(join(SRC, '..', '..', 'App.tsx'), 'utf8')

/**
 * A prefetcher that drifts from the router is worse than no prefetcher: it
 * spends the bytes and reports success. This once shipped — the GARAGE tab
 * warmed `W3GaragePage`, a screen only `/e/w3-garage-old` renders — so the
 * relationship is pinned rather than left to a comment asking for care.
 */
describe('the tab prefetcher and the router cannot disagree', () => {
  it('warms a tab for every route the bar can navigate to', () => {
    const routes = [...bar.matchAll(/route: '([a-z0-9-]+)'/g)].map((m) => m[1])
    expect(routes.length).toBe(5)
    for (const route of routes) {
      expect(chunks, `no loader for the ${route} tab`).toContain(`'${route}':`)
    }
  })

  it('never warms the retired catalogue garage', () => {
    // The prose above the list is allowed to NAME it — that is the note saying
    // why. What must not come back is a loader that fetches it.
    expect(chunks).not.toContain("import('./W3GaragePage')")
    expect(chunks).toContain("import('./W3EconomyPages')")
  })

  it('gives App its tab screens from that same list, not a second one', () => {
    expect(app).toContain("from './editorial/w3/w3TabChunks'")
    for (const name of ['W3TodayPage', 'W3RidesPage', 'W3GarageHome', 'W3WinsPage', 'W3BikerPage']) {
      expect(app, `${name} re-declared in App`).not.toMatch(
        new RegExp(`const ${name} = lazyWithRetry`),
      )
    }
  })

  it('spends the pointer-down, not just the idle period', () => {
    expect(bar).toContain('onPointerDown')
    expect(bar).toContain('preloadTab(route)')
  })
})
