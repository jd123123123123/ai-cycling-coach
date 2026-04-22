/**
 * SegmentedTabs smoke tests
 *
 * STATUS: PENDING — test infrastructure not yet installed.
 *
 * Required devDependencies to activate:
 *   npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
 *
 * Then add to vite.config.ts (or vitest.config.ts):
 *   test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] }
 *
 * And create src/test-setup.ts:
 *   import '@testing-library/jest-dom'
 *
 * Once infra is in place, remove the comment wrappers to activate the suite.
 *
 * ---
 * Coverage contract (from 06.1-01-PLAN.md Task 2):
 * 1. Renders one button per tab
 * 2. Clicking a tab calls onChange with its id
 * 3. ArrowRight on active tab calls onChange with the next id (with wrap-around)
 * 4. ArrowLeft wraps backward
 * 5. Home jumps to first, End jumps to last
 * 6. aria-selected is true exactly on the active tab
 */

// Uncomment the imports below once test infra is installed:
// import { describe, it, expect, vi } from 'vitest'
// import { render, screen, fireEvent } from '@testing-library/react'
// import userEvent from '@testing-library/user-event'
// import { SegmentedTabs } from '../SegmentedTabs'

const describe = (_name: string, _fn: () => void) => {}
const it = (_name: string, _fn: () => void | Promise<void>) => {}

// TABS constant is used in the commented-out test bodies below.
// Declared here for reference when activating the test suite.
const _TABS = [
  { id: 'today' as const, label: 'Today' },
  { id: 'week' as const, label: 'Week' },
  { id: 'trends' as const, label: 'Trends' },
  { id: 'plan' as const, label: 'Plan' },
] as const
void _TABS // suppress unused warning

describe('SegmentedTabs', () => {
  it('renders one button per tab', () => {
    // const { getAllByRole } = render(
    //   <SegmentedTabs tabs={TABS} value="today" onChange={vi.fn()} ariaLabel="Dashboard tabs" />
    // )
    // expect(getAllByRole('tab')).toHaveLength(4)
  })

  it('clicking a tab calls onChange with its id', async () => {
    // const onChange = vi.fn()
    // render(
    //   <SegmentedTabs tabs={TABS} value="today" onChange={onChange} ariaLabel="Dashboard tabs" />
    // )
    // await userEvent.click(screen.getByRole('tab', { name: 'Week' }))
    // expect(onChange).toHaveBeenCalledWith('week')
  })

  it('ArrowRight calls onChange with the next id (wrap-around)', () => {
    // const onChange = vi.fn()
    // render(
    //   <SegmentedTabs tabs={TABS} value="plan" onChange={onChange} ariaLabel="Dashboard tabs" />
    // )
    // const activeTab = screen.getByRole('tab', { name: 'Plan' })
    // fireEvent.keyDown(activeTab, { key: 'ArrowRight' })
    // expect(onChange).toHaveBeenCalledWith('today') // wraps to first
  })

  it('ArrowLeft wraps backward', () => {
    // const onChange = vi.fn()
    // render(
    //   <SegmentedTabs tabs={TABS} value="today" onChange={onChange} ariaLabel="Dashboard tabs" />
    // )
    // const activeTab = screen.getByRole('tab', { name: 'Today' })
    // fireEvent.keyDown(activeTab, { key: 'ArrowLeft' })
    // expect(onChange).toHaveBeenCalledWith('plan') // wraps to last
  })

  it('Home jumps to first, End jumps to last', () => {
    // const onChange = vi.fn()
    // render(
    //   <SegmentedTabs tabs={TABS} value="trends" onChange={onChange} ariaLabel="Dashboard tabs" />
    // )
    // const activeTab = screen.getByRole('tab', { name: 'Trends' })
    // fireEvent.keyDown(activeTab, { key: 'Home' })
    // expect(onChange).toHaveBeenCalledWith('today')
    //
    // onChange.mockClear()
    // fireEvent.keyDown(activeTab, { key: 'End' })
    // expect(onChange).toHaveBeenCalledWith('plan')
  })

  it('aria-selected is true exactly on the active tab', () => {
    // render(
    //   <SegmentedTabs tabs={TABS} value="week" onChange={vi.fn()} ariaLabel="Dashboard tabs" />
    // )
    // const tabs = screen.getAllByRole('tab') as HTMLElement[]
    // const selected = tabs.filter(t => t.getAttribute('aria-selected') === 'true')
    // expect(selected).toHaveLength(1)
    // expect(selected[0]).toHaveAccessibleName('Week')
  })
})

export {}
