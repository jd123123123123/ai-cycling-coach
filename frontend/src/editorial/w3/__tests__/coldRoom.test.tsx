import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import W3HeroShell from '../W3HeroShell'
import { heroVm } from '../w3heroVm'

vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
    const p: Record<string, unknown> = { ...rest }
    for (const k of ['initial','animate','exit','transition','whileInView','viewport','layout','layoutId']) delete p[k]
    return <div {...p}>{children}</div>
  } }),
}))

afterEach(cleanup)

/** Exactly what a logged-in COLD start has in hand: nothing has resolved yet. */
const coldVm = {
  ...heroVm({ stage: null, garage: null, collection: null, meso: null, streak: null, balance: null, displayName: null }),
  onSelectStage: () => {},
  rendering: false,
}

describe('the room on a cold, logged-in start', () => {
  /**
   * THE BLACK-SCREEN SUSPECT THAT WASN'T. The whole first viewport is the room
   * — `calc(100dvh - 92px)` of stage with the page's content below the fold —
   * and every part of it is data-driven, so "logged in, first open, black" had
   * an obvious-looking culprit: an empty room is a full-screen dark box.
   *
   * It is not the culprit, and this pins the reason so nobody re-derives the
   * theory. With NOTHING resolved the room still paints: the labelled example
   * bike, the fallback handle, and the tab bar. A cold start is quiet, never
   * blank.
   */
  it('paints without a single query resolved', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/e/w3-today']}>
          <W3HeroShell vm={coldVm as never}>{null}</W3HeroShell>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim()

    // The example bike is NAMED as an example — never a stock bike passed off
    // as the rider's own.
    expect(text).toContain('BEISPIEL')
    expect(text).toContain('NOCH KEIN RAD')
    // The tab bar is always reachable, so a cold room is navigable.
    expect(text).toContain('HEUTE')
    expect(text).toContain('GARAGE')
    // And the room is not an empty box.
    expect(container.querySelectorAll('img').length).toBeGreaterThan(0)
  })
})
