import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const w3 = (f: string) => readFileSync(join(__dirname, '..', 'w3', f), 'utf8')
const app = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf8')

/**
 * Every link in the sign-up journey, asserted as a link.
 *
 * The failure this guards against is not a broken screen — each of these pages
 * renders perfectly on its own, which is exactly the problem. It is a screen
 * that nothing reaches. Four separate pieces of finished machinery in this app
 * turned out to be wired to nothing (`ensure_plate`, `link_referral`, the tab
 * prefetcher, and the connect celebration below), and not one of them looked
 * broken: an orphaned route reads as dead code in a diff and as a live product
 * to anyone who types the URL.
 *
 * A unit test cannot prove the journey FEELS right. It can prove that every
 * step still names the next one, which is the part that rots silently.
 */
describe('the sign-up journey has no missing link', () => {
  const CHAIN: [string, string, string][] = [
    ['W3OnboardWelcomePage.tsx', '/e/w3-onboard-devices', 'welcome → devices'],
    ['W3OnboardDevicesPage.tsx', '/e/w3-onboard-numbers', 'devices → numbers'],
    ['W3OnboardNumbersPage.tsx', '/e/w3-onboard-rider', 'numbers → rider'],
    ['W3OnboardRiderPage.tsx', '/e/w3-onboard-plan', 'rider → plan'],
    ['W3OnboardPlanPage.tsx', '/e/w3-onboard-goals', 'plan → goals'],
    ['W3OnboardGoalsPage.tsx', '/e/w3-onboard-rewards', 'goals → rewards'],
    ['W3OnboardRewardsPage.tsx', '/e/w3-bike-studio', 'rewards → the rider photographs their own bike'],
  ]

  it.each(CHAIN)('%s still names %s (%s)', (file, target) => {
    expect(w3(file)).toContain(target)
  })

  /**
   * The celebration was built, wired to real activity data, and reachable by
   * nobody — so a rider handed over years of riding history and got a one-line
   * pill, and the 125 RC device grant it fires was never paid to anyone.
   */
  it('celebrates a connected device instead of printing a pill', () => {
    const devices = w3('W3OnboardDevicesPage.tsx')
    expect(devices, 'nothing routes to the celebration').toContain("'/e/w3-connected?source=Garmin&next='")
    expect(devices, 'the connect ends in itself again').toContain('onConnected()')
  })

  it('is the ONLY place the device grant is fired, so that screen must be reachable', () => {
    expect(w3('W3ConnectCelebratePage.tsx')).toContain("grant.mutate('device')")
  })

  /**
   * The celebration sits BEFORE the screen that satisfies the onboarding gate
   * (numbers writes the consent and the profile). Guarding it with
   * `checkOnboarding` would bounce every mid-onboarding rider back to the
   * welcome screen the instant they connected a device — a loop, not an error.
   */
  it('does not guard an onboarding step with the onboarding gate', () => {
    expect(app).toContain('<Route path="/e/w3-connected" element={<ProtectedRoute><W3ConnectCelebratePage /></ProtectedRoute>} />')
  })

  it('sends the rider back into the chain rather than off it', () => {
    const page = w3('W3ConnectCelebratePage.tsx')
    // and only to our own screens — this value arrives in a URL
    expect(page).toContain("raw.startsWith('/e/')")
  })
})
