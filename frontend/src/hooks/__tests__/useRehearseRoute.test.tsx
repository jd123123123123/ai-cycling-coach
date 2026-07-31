import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useRehearseRoute } from '../useRehearseRoute'

const createRehearsal = vi.fn()
vi.mock('../../api/rehearsal', () => ({
  createRehearsal: (body: unknown) => createRehearsal(body),
}))

afterEach(cleanup)
// Deliberately no mockClear/mockReset between tests: under Vitest 4, clearing
// this spy makes the NEXT mockRejectedValue surface as an unhandled rejection
// before the hook's own catch can see it, failing tests that in fact pass.
// Each test sets its own implementation, and only the first asserts on calls,
// so there is nothing to clear.

function Probe() {
  const { rehearse, pendingRef, failed, error } = useRehearseRoute()
  return (
    <div>
      <button type="button" onClick={() => void rehearse('activity', 11, 'Last Sunday')}>go</button>
      <span data-testid="pending">{String(pendingRef)}</span>
      {failed && <span data-testid="failed">{error ?? 'no detail'}</span>}
    </div>
  )
}

function renderProbe() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<Probe />} />
        <Route path="/rehearse/:id" element={<span data-testid="landed">rehearsal page</span>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('useRehearseRoute', () => {
  it('creates the rehearsal from the source and lands on its page', async () => {
    createRehearsal.mockResolvedValue({ id: 77 })
    renderProbe()
    fireEvent.click(screen.getByText('go'))

    await waitFor(() => expect(screen.getByTestId('landed')).toBeTruthy())
    expect(createRehearsal).toHaveBeenCalledWith({
      source_kind: 'activity',
      source_ref: 11,
      name: 'Last Sunday',
    })
  })

  it("shows the API's own refusal sentence rather than a status code", async () => {
    createRehearsal.mockRejectedValue({
      response: { data: { detail: 'this ride has no GPS track' } },
    })
    renderProbe()
    fireEvent.click(screen.getByText('go'))

    await waitFor(() =>
      expect(screen.getByTestId('failed').textContent).toBe('this ride has no GPS track'),
    )
    // Still on the dashboard: a refusal must not navigate to a page that has
    // nothing to show.
    expect(screen.queryByTestId('landed')).toBeNull()
  })

  it('reports a failure with no detail so the caller can localise its own', async () => {
    createRehearsal.mockRejectedValue(new Error('network down'))
    renderProbe()
    fireEvent.click(screen.getByText('go'))

    await waitFor(() => expect(screen.getByTestId('failed').textContent).toBe('no detail'))
  })

  it('clears the pending ref once the request settles', async () => {
    createRehearsal.mockRejectedValue(new Error('nope'))
    renderProbe()
    expect(screen.getByTestId('pending').textContent).toBe('null')
    fireEvent.click(screen.getByText('go'))
    await waitFor(() => expect(screen.getByTestId('failed')).toBeTruthy())
    expect(screen.getByTestId('pending').textContent).toBe('null')
  })
})
