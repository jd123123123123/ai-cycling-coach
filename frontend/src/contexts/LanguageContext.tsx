/**
 * LanguageContext — shares the current coach language mode across the app.
 *
 * - `simple` (default): plain-English coach output. No FTP/TSS/CTL/Z-numbers.
 * - `technical`: full vocabulary, with ≤5-word parenthetical explanations.
 *
 * State persists in localStorage['coach.language'] so a returning browser
 * restores the last selection.
 *
 * Design notes:
 *   - Any component that fetches coach data (brief, why, chat, transparency)
 *     reads the current `language` from this context and includes it in the
 *     React Query key, so switching language triggers a refetch.
 *   - Setting `language` also eagerly invalidates coach-related caches via
 *     `queryClient` — this is handled in `LanguageToggle.tsx` (not the
 *     context) because the context should stay independent of the query
 *     client for testability.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type CoachLanguage = 'simple' | 'technical'

const LOCAL_STORAGE_KEY = 'coach.language'
const DEFAULT_LANGUAGE: CoachLanguage = 'simple'

function readInitial(): CoachLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw === 'simple' || raw === 'technical') return raw
  } catch {
    /* SSR / sandboxed contexts — silently fall back */
  }
  return DEFAULT_LANGUAGE
}

interface LanguageContextValue {
  language: CoachLanguage
  setLanguage: (next: CoachLanguage) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<CoachLanguage>(readInitial)

  const setLanguage = useCallback((next: CoachLanguage) => {
    setLanguageState(next)
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, next)
    } catch {
      /* storage quota / private mode — the in-memory state is still correct */
    }
  }, [])

  // If another tab updates the same key, mirror the change into this tab.
  // Keeps "toggle in one tab" predictable for power users.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== LOCAL_STORAGE_KEY) return
      if (e.newValue === 'simple' || e.newValue === 'technical') {
        setLanguageState(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage }),
    [language, setLanguage],
  )

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  )
}

/**
 * Read-only access to the current language. Safe to call from any descendant
 * of <LanguageProvider>. Throws if no provider is above — misuse loud.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (ctx === null) {
    throw new Error('useLanguage must be used within a <LanguageProvider>')
  }
  return ctx
}
