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

  it('binds the active accent to the day state', () => {
    const { container } = render(<EditorialRoot state="trained"><span /></EditorialRoot>)
    const root = container.querySelector('.editorial-root') as HTMLElement
    expect(root.style.getPropertyValue('--st-active')).toBe('var(--st-trained)')
  })
})

describe('NotInThisSystem', () => {
  it('says plainly that the tab is not designed here', () => {
    render(<NotInThisSystem tab="RECOVERY" />)
    expect(screen.getByText(/RECOVERY/)).toBeTruthy()
    expect(screen.getByText(/not in this design system yet/i)).toBeTruthy()
  })
})
