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
    // The plan step asks WHETHER to build a plan; the goal step asks WHAT FOR.
    // That question used to be missing entirely — onboarding collected an
    // annual distance target with no backend column and never once asked for
    // the rider's event, which is the single fact the periodisation engine
    // plans backwards from.
    ['W3OnboardPlanPage.tsx', '/e/w3-onboard-goal', 'plan → goal (the event ask)'],
    ['W3OnboardGoalPage.tsx', '/e/w3-onboard-goals', 'goal → goals (the year)'],
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
   * The event ask is SKIPPABLE and must stay so. Mid-signup a rider may simply
   * not have a race yet, and a required question there would collect a
   * fabricated date — which is worse than none, because the plan would then
   * periodise towards a day that means nothing.
   */
  it('lets a rider without a race yet past the event question', () => {
    const page = w3('W3OnboardGoalPage.tsx')
    expect(page, 'no way past the goal step').toContain('onSkip')
    expect(page, 'skipping must still advance the chain').toContain("navigate(NEXT)")
  })

  /** And it must actually persist, or it is a question asked for nothing. */
  it('writes the event where the engine reads it', () => {
    const page = w3('W3OnboardGoalPage.tsx')
    expect(page).toContain('target_event_date')
    expect(page).toContain('applyPlanChange')
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

/**
 * The three ways the journey ate its own tail.
 *
 * None of these was a broken screen either, and none was visible to a type
 * checker: every page rendered, every route resolved, and the flow still sent
 * the rider back to the start. They are asserted here as three separate
 * regressions because they had three separate causes.
 */
describe('the journey ends in the app, not at its own beginning', () => {
  /**
   * FINISHING ONBOARDING RESTARTED IT. `W3Guard` gates the whole app on a
   * localStorage flag, and only the rewards step's SKIP set it — never the
   * button that continues. So the rider who did the flow properly went
   * rewards → bike studio → /e/w3-today → guard → welcome, forever, while the
   * rider who skipped got in. The last step must mark the intro seen on BOTH
   * of its exits.
   */
  it('marks the intro seen on the way out, not only when skipped', () => {
    const rewards = w3('W3OnboardRewardsPage.tsx')
    const marks = rewards.match(/markW3OnboardingSeen\(\)/g) ?? []
    expect(marks.length, 'only one exit sets the flag — the other loops').toBeGreaterThanOrEqual(2)
    // The continue path specifically, not two calls inside the skip.
    const next = rewards.slice(rewards.indexOf('const next ='))
    expect(next, 'the continue path hands off without marking').toContain('markW3OnboardingSeen()')
  })

  /**
   * The guard is the thing that turns a missing flag into a loop, so it must
   * keep reading the flag the steps actually write.
   */
  it('the guard still gates on the flag the steps set', () => {
    expect(w3('W3Guard.tsx')).toContain('hasSeenW3Onboarding()')
    expect(w3('w3Onboarding.ts')).toContain('markW3OnboardingSeen')
  })

  /**
   * "Kein Plan — nur Analyse" is an offer to decline planning. Routing that
   * rider into the target-event and weekly-hours questions withdraws the offer
   * one screen after making it, and every field it collects feeds an engine
   * they just opted out of.
   */
  it('does not interrogate the rider who chose "Kein Plan"', () => {
    const plan = w3('W3OnboardPlanPage.tsx')
    expect(plan, 'insights is routed like a plan').toContain("mode === 'insights'")
    const nav = plan.slice(plan.indexOf('navigate(mode ==='))
    expect(nav).toContain('/e/w3-onboard-rewards')
  })

  /**
   * The hours branch of the goal step writes `days_available`; this screen then
   * asked for the same days and opened on a hardcoded week, so the rider
   * answered twice and the second answer overwrote the first.
   */
  it('opens the year step on the days already collected', () => {
    const goals = w3('W3OnboardGoalsPage.tsx')
    expect(goals, 'nothing reads the profile back').toContain('useAthleteProfile')
    expect(goals).toContain('fromDaysAvailable')
    expect(goals, 'a late seed would clobber a live edit').toContain('touched')
  })
})
