// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import W3SceneAnnouncement, { sceneAnnouncementKey } from '../W3SceneAnnouncement'
import { claimGate, gateHolder, resetGates, seizeGate } from '../w3gates'
const state = vi.hoisted(() => ({ riderId: 0 as number | null, loading: false, bike: true }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.riderId === null ? null : { id: state.riderId }, isLoading: state.loading }) }))
vi.mock('../../../hooks/useGarage', () => ({ useGarage: () => ({ isLoading: false, data: { rider: { image_base64: 'rider' }, bike: state.bike ? { image_base64: 'bike' } : null } }) }))
let nextRider = 100
const renderGate = (path = '/e/w3-today') => render(<MemoryRouter initialEntries={[path]}><W3SceneAnnouncement /><Routes><Route path="/e/w3-wins" element={<h1>Erfolge Zielseite</h1>} /><Route path="*" element={null} /></Routes></MemoryRouter>)
const advance = () => act(() => { vi.advanceTimersByTime(3300) })
beforeEach(() => {
  vi.useFakeTimers(); resetGates(); localStorage.clear()
  state.riderId = nextRider++; state.loading = false; state.bike = true
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.useRealTimers(); resetGates() })
describe('scene announcement launch eligibility', () => {
  it('shows once per rider and preserves the next rider’s eligibility', () => {
    const first = state.riderId!
    const view = renderGate(); advance()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(localStorage.getItem(sceneAnnouncementKey(first))).toBe('seen')
    fireEvent.click(screen.getByText('Später'))
    expect(screen.queryByRole('dialog')).toBeNull(); expect(gateHolder()).toBeNull()
    view.unmount(); renderGate(); advance(); expect(screen.queryByRole('dialog')).toBeNull()
    cleanup(); state.riderId = nextRider++; renderGate(); advance(); expect(screen.getByRole('dialog')).toBeTruthy()
  })
  it('never opens anonymously, during auth loading, or during setup', () => {
    state.riderId = null; renderGate(); advance(); expect(screen.queryByRole('dialog')).toBeNull()
    cleanup(); state.riderId = nextRider++; state.loading = true; renderGate(); advance(); expect(screen.queryByRole('dialog')).toBeNull()
    cleanup(); state.loading = false; renderGate('/e/w3-bike-studio'); advance(); expect(screen.queryByRole('dialog')).toBeNull()
    cleanup(); state.bike = false; renderGate(); advance(); expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('defers to morning without marking seen', () => {
    claimGate('morning'); renderGate(); advance()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem(sceneAnnouncementKey(state.riderId!))).toBeNull(); expect(gateHolder()).toBe('morning')
  })
  it('does not stack on an open reward', () => {
    const reward = document.createElement('dialog'); reward.setAttribute('open', ''); document.body.append(reward)
    renderGate(); advance(); expect(screen.queryByText('Erfolge entdecken')).toBeNull()
    expect(localStorage.getItem(sceneAnnouncementKey(state.riderId!))).toBeNull(); reward.remove()
  })
  it('yields when required setup seizes the launch', () => {
    renderGate(); advance(); expect(screen.getByRole('dialog')).toBeTruthy()
    act(() => { seizeGate('setup'); vi.advanceTimersByTime(250) })
    expect(screen.queryByRole('dialog')).toBeNull(); expect(gateHolder()).toBe('setup')
  })
  it('navigates to achievements and labels reference imagery', () => {
    renderGate(); advance(); expect(screen.getByText('Beispielbild mit Referenzrad')).toBeTruthy()
    fireEvent.click(screen.getByText('Erfolge entdecken'))
    expect(screen.getByText('Erfolge Zielseite')).toBeTruthy(); expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('closes on logout', () => {
    const view = renderGate(); advance(); state.riderId = null
    view.rerender(<MemoryRouter><W3SceneAnnouncement /></MemoryRouter>)
    expect(screen.queryByRole('dialog')).toBeNull(); expect(gateHolder()).toBeNull()
  })
})
