import { createContext, useContext, type ReactNode, createElement } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import { COPY, EDITORIAL_DEFAULT_LOCALE, type CopyKey, type Locale } from './copy'

/**
 * Bridges the app-wide `contexts/LocaleContext` into EDITORIAL II's own
 * default. `useLocale()` (imported read-only, like any other outside-the-
 * tree import) already falls back to the GLOBAL default ('en') when no
 * `LocaleProvider` is mounted — see `LocaleContext.tsx`'s own `useLocale`.
 * That fallback is indistinguishable, BY RETURN VALUE ALONE, from a real,
 * mounted provider whose user's browser simply isn't German (`readInitial`'s
 * own `browserDefaultLocale` also lands on 'en' for anything non-German) —
 * so `useLocale().locale === 'en'` can mean three different things, and a
 * naive "just forward it" (this file's first pass) provides 'en' in ALL
 * three, silently overriding this design system's own default the moment
 * `EditorialRoot` mounts `CopyLocaleProvider` — caught only by actually
 * rendering the visual harness (TabBar/DayRail, real descendants of the
 * provider, rendered English) alongside `TodayView`'s own `useCopy()` call
 * (which — before the fix below in `TodayView.tsx` making it a true
 * descendant too — read this context's OWN default and rendered German),
 * a split-locale bug static gates never would have caught.
 *
 * The fix: only the STORED, EXPLICIT choice (`contexts/LocaleContext`'s own
 * `localStorage` key, `'ui.locale'` — read directly here, not re-derived
 * from `useLocale()`'s return shape, since that shape cannot distinguish
 * "explicit" from "guessed/absent") overrides EDITORIAL_DEFAULT_LOCALE.
 * A user who has never touched the language toggle — which includes every
 * bare component test, the visual harness, and a first-ever visit — gets
 * German, matching the owner's ruling that EDITORIAL II SHIPS in German,
 * not merely "falls back to it when nothing else is configured." A user who
 * has explicitly chosen a language (in either direction) keeps that choice
 * here too — `useLocale()` is still the source for that value, since once a
 * real `LocaleProvider` is mounted (always true in the shipped app — see
 * `App.tsx`) its `locale` correctly reflects the same stored key. Duplicating
 * the `'ui.locale'` string is a minor coupling, accepted because the
 * alternative (exporting the raw Context object from `contexts/LocaleContext`
 * so this file could `useContext` it directly) would mean editing a file
 * outside `editorial/`, which task rules forbid.
 */
const CopyLocaleContext = createContext<Locale>(EDITORIAL_DEFAULT_LOCALE)

const UI_LOCALE_STORAGE_KEY = 'ui.locale'

/** Has the user (in this browser) ever explicitly set a locale? Mirrors
 *  `LocaleContext.tsx`'s own `readInitial` STORAGE branch only — deliberately
 *  NOT its `browserDefaultLocale(navigator.language)` branch, which is a
 *  guess, not a choice, and guesses non-German browsers into 'en' exactly
 *  like the no-provider fallback does. */
function explicitLocaleChoice(): Locale | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)
    if (raw === 'en' || raw === 'de') return raw
  } catch {
    /* ignore */
  }
  return null
}

/** Mounted once, by `EditorialRoot`, so every real screen gets the app's
 *  actual locale choice once one has been made. Reads `contexts/
 *  LocaleContext` (read-only) for that choice's VALUE; see the block
 *  comment above for why presence is resolved from storage instead. */
export function CopyLocaleProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale()
  const resolved = explicitLocaleChoice() != null ? locale : EDITORIAL_DEFAULT_LOCALE
  return createElement(CopyLocaleContext.Provider, { value: resolved }, children)
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    name in vars ? String(vars[name]) : match
  ))
}

/** Pure — usable outside React (e.g. `buildTodayModel`, which must stay a
 *  plain function, not a hook). `useCopy()` below is a thin hook wrapper
 *  around this for components. */
export function translate(locale: Locale, key: CopyKey, vars?: Record<string, string | number>): string {
  return interpolate(COPY[key][locale], vars)
}

export interface Copy {
  locale: Locale
  t: (key: CopyKey, vars?: Record<string, string | number>) => string
}

/** The one hook every EDITORIAL II component/page reaches for instead of a
 *  hardcoded string. Presentational components may import this (and
 *  `contexts/`) without breaking the "no `hooks/` imports" rule — this
 *  lives in `editorial/i18n/`, not the app-wide `hooks/` directory. */
export function useCopy(): Copy {
  const locale = useContext(CopyLocaleContext)
  return {
    locale,
    t: (key, vars) => translate(locale, key, vars),
  }
}
