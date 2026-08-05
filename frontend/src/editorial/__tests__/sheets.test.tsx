/**
 * Task 13 — the two bottom sheets. Covers: a pick reports the right target
 * state, a closed sheet renders nothing, Escape and scrim clicks both
 * close, focus lands in the panel, and the override those sheets exist to
 * drive round-trips through `state/dayState.ts` (and expires at the
 * athlete's midnight — `dayState.test.ts` already covers that expiry in
 * isolation; here we prove the SHEET's own callback is what feeds it).
 *
 * Note on locale: EDITORIAL II defaults to German with no `LocaleProvider`
 * mounted (`i18n/useCopy.ts`'s own `EDITORIAL_DEFAULT_LOCALE`), so every
 * button is queried by its German text, not the pen's English.
 */
import { fireEvent, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BackToSessionDoneSheet from '../components/BackToSessionDoneSheet'
import SwitchDayTypeSheet from '../components/SwitchDayTypeSheet'
import { isoDateKey, readOverride, writeOverride } from '../state/dayState'

// `Sheet.tsx` looks the portal target up by id — `cleanup()` unmounts React
// trees between tests but does not remove DOM nodes appended by hand, so a
// stale root from a prior test would silently steal every later portal.
function mountPortalTarget() {
  document.getElementById('editorial-sheet-root')?.remove()
  const el = document.createElement('div')
  el.id = 'editorial-sheet-root'
  document.body.appendChild(el)
  return el
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('SwitchDayTypeSheet', () => {
  it('offers rest and training and reports the target state on pick', () => {
    mountPortalTarget()
    const onPick = vi.fn()
    render(<SwitchDayTypeSheet open current="rest" onPick={onPick} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /trainingstag wechseln/i }))
    expect(onPick).toHaveBeenCalledWith('training')
  })

  it('picks rest when the current state is training', () => {
    mountPortalTarget()
    const onPick = vi.fn()
    render(<SwitchDayTypeSheet open current="training" onPick={onPick} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /ruhetag wechseln/i }))
    expect(onPick).toHaveBeenCalledWith('rest')
  })

  it('a closed sheet renders nothing', () => {
    mountPortalTarget()
    const { baseElement } = render(<SwitchDayTypeSheet open={false} current="rest" onPick={() => {}} onClose={() => {}} />)
    expect(baseElement.querySelector('[data-sheet]')).toBeNull()
  })

  it('closes on scrim click', () => {
    mountPortalTarget()
    const onClose = vi.fn()
    const { baseElement } = render(<SwitchDayTypeSheet open current="rest" onPick={() => {}} onClose={onClose} />)
    const scrim = baseElement.querySelector('[data-sheet-scrim]')
    expect(scrim).not.toBeNull()
    fireEvent.click(scrim as Element)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    mountPortalTarget()
    const onClose = vi.fn()
    render(<SwitchDayTypeSheet open current="rest" onPick={() => {}} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('focuses the panel dialog on open, for Escape/Tab to work immediately', () => {
    mountPortalTarget()
    render(<SwitchDayTypeSheet open current="rest" onPick={() => {}} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(dialog)
  })

  it("the sheet's own pick feeds the real override mechanism, which round-trips and expires at midnight", () => {
    mountPortalTarget()
    const now = new Date(2026, 7, 5, 9, 0)
    render(<SwitchDayTypeSheet open current="rest" onPick={(s) => writeOverride(s, now)} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /trainingstag wechseln/i }))
    expect(readOverride(now)).toBe('training')
    expect(readOverride(new Date(2026, 7, 6, 9, 0))).toBeNull()
    expect(localStorage.getItem('editorial.dayState')).toBe(JSON.stringify({ date: isoDateKey(now), state: 'training' }))
  })
})

describe('BackToSessionDoneSheet', () => {
  it('confirms the return to trained', () => {
    mountPortalTarget()
    const onConfirm = vi.fn()
    render(<BackToSessionDoneSheet open onConfirm={onConfirm} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /zurück zu erledigt/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('a closed sheet renders nothing', () => {
    mountPortalTarget()
    const { baseElement } = render(<BackToSessionDoneSheet open={false} onConfirm={() => {}} onClose={() => {}} />)
    expect(baseElement.querySelector('[data-sheet]')).toBeNull()
  })

  it('closes on scrim click and on Escape', () => {
    mountPortalTarget()
    const onClose = vi.fn()
    const { baseElement } = render(<BackToSessionDoneSheet open onConfirm={() => {}} onClose={onClose} />)
    fireEvent.click(baseElement.querySelector('[data-sheet-scrim]') as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("confirm feeds the real override mechanism as 'trained'", () => {
    mountPortalTarget()
    const now = new Date(2026, 7, 5, 15, 0)
    render(<BackToSessionDoneSheet open onConfirm={() => writeOverride('trained', now)} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /zurück zu erledigt/i }))
    expect(readOverride(now)).toBe('trained')
  })
})
