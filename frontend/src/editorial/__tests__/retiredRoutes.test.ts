import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const app = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf8')
const guard = readFileSync(join(__dirname, '..', '..', 'components', 'ProtectedRoute.tsx'), 'utf8')

/**
 * A rider who signed up on the W3 screen was walked through the v4 wizard and
 * dropped on the v4 dashboard — a different app than the one they signed up
 * for. The old way in is closed, and it has to STAY closed: these routes are
 * one careless re-add away from returning, and nothing about the app would look
 * broken if they did.
 */
describe('the retired way in stays closed', () => {
  const RETIRED: [string, string][] = [
    ['/login', '/e/w3-login'],
    ['/register', '/e/w3-register'],
    ['/consent', '/e/w3-onboard-numbers'],
    ['/profile-setup', '/e/w3-onboard-numbers'],
    ['/onboarding', '/e/w3-onboard-welcome'],
    ['/dashboard', '/e/w3-today'],
  ]

  it.each(RETIRED)('%s forwards to %s', (from, to) => {
    expect(app).toContain(`<Route path="${from}" element={<LegacyRedirect to="${to}" />} />`)
  })

  it('renders none of the retired screens', () => {
    for (const gone of ['<LoginPage', '<RegisterPage', '<ConsentPage', '<ProfileSetupPage',
                        '<OnboardingWizard', '<DashboardPage']) {
      expect(app, `${gone} is mounted again`).not.toContain(gone)
    }
  })

  it('carries the query across the hop', () => {
    // `/register?ref=CODE` is the shape of link the referral feature asks
    // riders to share. Dropping the search here silently un-invites everyone
    // who followed an older one.
    expect(app).toContain('const { search } = useLocation()')
    expect(app).toContain('<Navigate to={`${to}${search}`} replace />')
  })

  it('sends an unauthenticated visit to the W3 sign-in', () => {
    expect(guard).toContain('<Navigate to="/e/w3-login" replace />')
    expect(guard).not.toContain('to="/login"')
  })

  /**
   * The free starter bike is gone: a rider's bike is the one they photograph and
   * name. Two screens still told the older story — `/e/w3-first-bike` (a shop
   * that CLAIMED a stock frame on the server) and `/e/w3-onboard-garage` (a
   * stock photo captioned as theirs). Nothing linked to either any more, which
   * is exactly why they could rot in place unnoticed while still answering.
   */
  it.each([['/e/w3-first-bike'], ['/e/w3-onboard-garage']])(
    '%s sends the rider to photograph their own bike', (from) => {
      expect(app).toContain(
        `<Route path="${from}" element={<Navigate to="/e/w3-bike-studio?next=%2Fe%2Fw3-today" replace />} />`)
    })

  it('has no screen left that hands out a bike', () => {
    for (const gone of ['<W3FirstBikePage', '<W3OnboardGaragePage',
                        '<W3FirstBikePreview', '<W3OnboardGaragePreview']) {
      expect(app, `${gone} is mounted again`).not.toContain(gone)
    }
    const shopApi = readFileSync(join(__dirname, '..', '..', 'api', 'shop.ts'), 'utf8')
    expect(shopApi, 'the claim call is back').not.toContain('claimFirstBike')
  })

  it('sends an incomplete rider into the W3 chain, never the v4 wizard', () => {
    expect(guard).toContain('<Navigate to="/e/w3-onboard-welcome" replace />')
    expect(guard).not.toContain('to="/onboarding"')
  })
})
