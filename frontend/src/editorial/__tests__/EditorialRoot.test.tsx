import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import EditorialRoot from '../EditorialRoot'
import NotInThisSystem from '../pages/NotInThisSystem'

afterEach(cleanup)

describe('EditorialRoot', () => {
  it('scopes the token class and exposes the sheet portal target', () => {
    const { container } = render(<EditorialRoot state="rest"><p>hello</p></EditorialRoot>)
    const root = container.querySelector('.editorial-root')
    expect(root).not.toBeNull()
    expect(root!.querySelector('#editorial-sheet-root')).not.toBeNull()
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('binds the active accent and the ground to the day state', () => {
    const { container } = render(<EditorialRoot state="trained"><span /></EditorialRoot>)
    const root = container.querySelector('.editorial-root') as HTMLElement
    expect(root.style.getPropertyValue('--st-active')).toBe('var(--st-trained)')
    expect(root.style.getPropertyValue('--e-ground')).toBe('var(--g-trained)')
  })

  it('gives each state its own ground — the tint is the mood system', () => {
    const grounds = (['rest', 'training', 'trained', 'resting', 'evening'] as const).map((s) => {
      const { container } = render(<EditorialRoot state={s}><span /></EditorialRoot>)
      const el = container.querySelector('.editorial-root') as HTMLElement
      return el.style.getPropertyValue('--e-ground')
    })
    expect(new Set(grounds).size).toBe(5)
  })
})

describe('NotInThisSystem', () => {
  it('says plainly that the tab is not designed here', () => {
    render(<NotInThisSystem tab="RECOVERY" />)
    expect(screen.getByText(/RECOVERY/)).toBeTruthy()
    expect(screen.getByText(/not in this design system yet/i)).toBeTruthy()
  })
})
