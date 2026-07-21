import { describe, expect, it } from 'vitest'
import { browserDefaultLocale } from '../../i18n/browserLocale'

/**
 * First-visit locale detection — a de-DE browser must get German chrome on
 * the auth pages and onboarding without hunting for the dashboard toggle
 * (review finding: onboarding/login/register rendered EN-only for German
 * browsers).
 */
describe('browserDefaultLocale', () => {
  it('maps German language tags to de', () => {
    expect(browserDefaultLocale('de')).toBe('de')
    expect(browserDefaultLocale('de-DE')).toBe('de')
    expect(browserDefaultLocale('de-AT')).toBe('de')
    expect(browserDefaultLocale('DE-CH')).toBe('de')
  })

  it('defaults everything else to en', () => {
    expect(browserDefaultLocale('en-US')).toBe('en')
    expect(browserDefaultLocale('fr-FR')).toBe('en')
    expect(browserDefaultLocale('')).toBe('en')
    expect(browserDefaultLocale(undefined)).toBe('en')
    expect(browserDefaultLocale(null)).toBe('en')
  })
})
