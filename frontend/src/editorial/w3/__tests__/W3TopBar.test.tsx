import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The bar is the subject; its two children only need to be present.
vi.mock('../W3RiderAvatar', () => ({ default: () => <span data-testid="avatar" /> }))
vi.mock('../W3NavMenu', () => ({ default: () => <span data-testid="menu" /> }))

const { default: W3TopBar } = await import('../W3TopBar')

/**
 * The header that every W3 screen shares.
 *
 * Both of these guard the same class of bug: a header that is subtly different
 * on one screen than on its siblings. One is a control that does nothing, the
 * other is a label nobody asked for — and the second only became visible by
 * putting Biker and Fahrten side by side.
 */

afterEach(cleanup)

const draw = (at: string, props: Parameters<typeof W3TopBar>[0] = {}) =>
  render(<MemoryRouter initialEntries={[at]}><W3TopBar {...props} /></MemoryRouter>)

describe('the avatar', () => {
  it('offers the profile from any other screen', () => {
    draw('/e/w3-rides')
    expect(screen.getByLabelText('Profil & Einstellungen')).toBeTruthy()
  })

  it('IS NOT A LINK TO THE PAGE YOU ARE ON', () => {
    // On the profile it navigated to the profile: a button whose only effect
    // was a no-op. The portrait is on the screen already, larger.
    draw('/e/w3-biker')
    expect(screen.queryByLabelText('Profil & Einstellungen')).toBeNull()
    expect(screen.getByTestId('menu')).toBeTruthy()   // the rest of the bar stays
  })

  it('is gone on the profile\'s sub-routes too', () => {
    draw('/e/w3-biker/einstellungen')
    expect(screen.queryByLabelText('Profil & Einstellungen')).toBeNull()
  })

  it('does not mistake a screen whose path merely starts alike', () => {
    draw('/e/w3-biker-shop')
    expect(screen.getByLabelText('Profil & Einstellungen')).toBeTruthy()
  })
})

describe('the back button', () => {
  it('appears only when there is somewhere to go back to', () => {
    draw('/e/w3-plan', { onBack: () => {} })
    expect(screen.getByLabelText('Zurück')).toBeTruthy()
    cleanup()
    draw('/e/w3-plan')
    expect(screen.queryByLabelText('Zurück')).toBeNull()
  })
})

it('keeps close-only sheets separate from page navigation',()=>{
 const onClose=vi.fn();draw('/e/w3-plan',{title:'Deine Woche',onClose});
 expect(screen.getByLabelText('Schließen')).toBeTruthy();expect(screen.queryByTestId('menu')).toBeNull();expect(screen.queryByLabelText('Profil & Einstellungen')).toBeNull()
})
it('retains the shared menu and contextual tools in a ride detail',()=>{
 draw('/e/w3-ride/307',{title:'21.09.2026',showAvatar:false,onBack:()=>{},extra:<button aria-label="Fahrt teilen">Teilen</button>});
 expect(screen.getByTestId('menu')).toBeTruthy();expect(screen.getByLabelText('Fahrt teilen')).toBeTruthy();expect(screen.queryByLabelText('Profil & Einstellungen')).toBeNull()
})
