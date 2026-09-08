import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * THE ONBOARDING TRAP, pinned so it cannot regrow.
 *
 * Observed on production with a fresh account: a rider completed the whole W3
 * onboarding — consent granted, FTP and weight saved — and still could not
 * reach the app. Every attempt at /e/w3-today bounced back to the welcome
 * screen, and a reload did not help.
 *
 * Two independent causes, both fixed here and both asserted below:
 *
 *  1. `W3OnboardNumbersPage` grants the consent and writes the profile that
 *     `useOnboarding` reads, but never invalidated that query — whose verdict
 *     is cached for five minutes. So ProtectedRoute kept redirecting on a
 *     verdict the rider had already satisfied.
 *  2. The verdict was PERSISTED to localStorage, which is why the reload did
 *     not clear it. A gate that decides whether somebody may enter the app
 *     must always be asked live.
 *
 * Source assertions rather than a mounted flow: the failure was two modules
 * disagreeing about a cache, not a rendering bug, and the same style already
 * guards the retired routes.
 */

const read = (rel: string) =>
  readFileSync(path.resolve(__dirname, rel), 'utf8')

describe('the onboarding gate cannot strand a rider', () => {
  it('the numbers page invalidates the verdict it just satisfied', () => {
    const src = read('../W3OnboardNumbersPage.tsx')
    // It writes the two things the verdict is computed from …
    expect(src).toContain('grantConsent(')
    expect(src).toContain('updateProfile(')
    // … so it must invalidate the verdict, and await it before navigating.
    expect(src).toContain('ONBOARDING_STATUS_KEY')
    expect(src).toMatch(/await qc\.invalidateQueries\(\{\s*queryKey:\s*ONBOARDING_STATUS_KEY\s*\}\)/)
    const invalidateAt = src.indexOf('ONBOARDING_STATUS_KEY })')
    const navigateAt = src.indexOf("navigate('/e/w3-onboard-rider')")
    expect(invalidateAt).toBeGreaterThan(-1)
    expect(navigateAt).toBeGreaterThan(invalidateAt)
  })

  it('the persisted cache refuses to serve the gate from disk', () => {
    const src = read('../../../lib/queryPersist.ts')
    expect(src).toMatch(/queryKey\[0\] === 'onboarding'/)
  })

  it('the gate key is still the one both sides name', () => {
    const hook = read('../../../hooks/useOnboarding.ts')
    expect(hook).toContain("export const ONBOARDING_STATUS_KEY = ['onboarding', 'status']")
  })
})
