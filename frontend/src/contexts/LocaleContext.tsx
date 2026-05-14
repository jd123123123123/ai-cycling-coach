import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { type Locale, type StringKey, tFor } from '../i18n/strings'

/**
 * LocaleContext — UI-string locale (EN / DE). Independent of LanguageContext
 * which controls coach voice mode (simple / technical) and stays in the
 * legacy CoachLanguage type. Persisted in localStorage so a returning
 * browser keeps the selection.
 *
 * AI prose (brief.verdict / rationale / tomorrow_plan / pattern observations)
 * still arrives from the backend in whatever language the LLM produced it in —
 * surfacing locale to the brief prompt is the next step. This context handles
 * the *chrome* (eyebrows, button labels, stat names, dialog copy).
 */

const STORAGE_KEY = 'ui.locale'
const DEFAULT_LOCALE: Locale = 'en'

function readInitial(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'en' || raw === 'de') return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE
}

interface LocaleContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: StringKey) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readInitial())

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      /* ignore */
    }
  }, [locale])

  const setLocale = useCallback((l: Locale) => setLocaleState(l), [])
  const t = useCallback((key: StringKey) => tFor(locale, key), [locale])

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (ctx) return ctx
  // Fallback so components don't crash if the provider isn't mounted yet.
  return {
    locale: 'en',
    setLocale: () => {},
    t: (key) => tFor('en', key),
  }
}

export function useT(): (key: StringKey) => string {
  return useLocale().t
}
