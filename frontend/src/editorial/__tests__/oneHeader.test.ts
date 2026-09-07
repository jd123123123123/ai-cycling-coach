// ONE APP, ONE HEADER.
//
// `W3TopBar` is the shared header: back button, centred title, the rider's
// avatar and the settings menu. Screens kept drawing their own instead — a
// private 44px circle here, a different one there — and the cost was not
// only that the furniture jumped when moving between them. A screen with a
// private header carries NO avatar and NO menu, so a rider who landed on the
// crew-member page, the referrals page, the shop or the goal setter had no
// route to their own profile or to settings at all. The way out was the
// browser's back gesture.
//
// This test makes the rule automated rather than aspirational, the same way
// `isolation.test.ts` does for raw hex. A new screen either mounts the bar or
// names itself here with a reason.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const W3 = path.resolve(__dirname, '..', 'w3')

/**
 * Screens that legitimately have no top bar, each with the reason it does not.
 *
 * Three kinds, and the distinction is worth keeping straight:
 *
 *  - THE HERO ROOM. Today and the Garage are one mounted stage with their own
 *    identity stack; the bar would sit on top of the bike.
 *  - A FLOW THE RIDER IS INSIDE. Onboarding and auth are sequences with their
 *    own forward/skip affordances. Offering "settings" mid-signup is an exit
 *    into a screen that assumes the signup finished.
 *  - A MOMENT. Celebrations, the week review and the wrapped deck are
 *    full-bleed and momentary, with their own single way out. A settings menu
 *    in the corner of a celebration is furniture interrupting a moment.
 */
const NO_BAR: Record<string, string> = {
  // the hero room
  'W3TodayView.tsx': 'hero room — the mounted stage carries its own identity stack',
  'W3GarageView.tsx': 'hero room — same stage as Today',
  'W3GarageHero.tsx': 'hero room — the stage itself',
  'W3HeroShell.tsx': 'the shell the hero room is mounted in, not a screen',
  // flows the rider is inside
  'W3AuthView.tsx': 'sign-in — there is no rider yet to show an avatar for',
  'W3AvatarOnboardView.tsx': 'onboarding step — the flow owns forward and skip',
  'W3OnboardNumbersPage.tsx': 'onboarding step — the flow owns forward and skip',
  // moments
  'W3WeekReviewView.tsx': 'full-bleed review deck with its own single way out',
  'W3RideCelebrateView.tsx': 'celebration — a settings menu interrupts the moment',
  'W3ConnectCelebrateView.tsx': 'celebration — as above',
  'W3WrappedView.tsx': 'story deck, chapter-paced like the morning deck',
  // not screens
  'W3LoadError.tsx': 'an error state rendered inside another screen shell',
  'W3RideDetailView.tsx': 'the embedded tail of the ride page; the page owns the shell',
}

/** A file that paints the full-screen frame is a screen. */
function isScreen(src: string): boolean {
  return src.includes('w3-frame')
}

const files = readdirSync(W3)
  .filter((n) => /\.tsx$/.test(n))
  // Preview routes are dev-only harnesses, not screens a rider reaches.
  .filter((n) => !/Preview\.tsx$/.test(n))

describe('every W3 screen carries the shared header', () => {
  const screens = files.filter((n) => isScreen(readFileSync(path.join(W3, n), 'utf8')))

  it('finds screens to check at all (guards against the glob silently going empty)', () => {
    expect(screens.length).toBeGreaterThan(10)
  })

  for (const name of screens) {
    const reason = NO_BAR[name]
    it(reason ? `${name} — deliberately bare: ${reason}` : `${name} mounts W3TopBar`, () => {
      const src = readFileSync(path.join(W3, name), 'utf8')
      if (reason) {
        // An exempt screen must stay exempt for the stated reason rather than
        // quietly growing a private header again.
        expect(reason.length).toBeGreaterThan(10)
        return
      }
      expect(src).toContain('W3TopBar')
    })
  }

  it('has no stale exemptions — every name listed still exists and is a screen', () => {
    const stale = Object.keys(NO_BAR).filter((n) => !screens.includes(n))
    expect(stale).toEqual([])
  })
})
