import type { Locale } from './strings'

/**
 * browserDefaultLocale — maps a BCP-47 browser language tag to a supported
 * UI locale. A de-DE (or de-AT/de-CH/…) browser gets German chrome on first
 * visit instead of silently defaulting to English (review finding: the
 * onboarding + auth pages rendered EN-only for German browsers until the
 * user found the dashboard toggle). Pure so it is unit-testable.
 */
export function browserDefaultLocale(languageTag: string | undefined | null): Locale {
  if (typeof languageTag === 'string' && languageTag.toLowerCase().startsWith('de')) {
    return 'de'
  }
  return 'en'
}
