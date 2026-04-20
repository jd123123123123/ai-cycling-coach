/**
 * useLanguage — thin re-export of the hook from LanguageContext.
 *
 * The state + provider live in `contexts/LanguageContext.tsx` (alongside other
 * contexts). We re-export the hook from `hooks/` so consumers follow the
 * existing convention: components import hooks from `../../hooks/*`.
 */
export { useLanguage, type CoachLanguage } from '../contexts/LanguageContext'
