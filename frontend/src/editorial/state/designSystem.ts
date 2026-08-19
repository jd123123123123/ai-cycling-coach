/**
 * Which design system the athlete lands in.
 *
 * `?ds=` still reaches either system, but ONLY `editorial2` is remembered.
 *
 * WHY v4 IS NO LONGER STICKY. This began as a symmetric preference, from when
 * both systems were live choices. Once W3 became the only thing anything links
 * to, that symmetry turned into a trap: anyone who had ever opened `?ds=v4` —
 * which is the documented way to reach the old app, so everyone testing it did
 * — had `designSystem: 'v4'` written to their browser and was then pinned to
 * the retired app across every later release, with nothing in the product able
 * to move them off it. Reported from production 2026-08-19: a rider logged in
 * after a deploy and saw neither the new app nor the new onboarding, because
 * their root redirect had been answering `/dashboard` for weeks.
 *
 * So v4 is now opt-in per navigation: `?ds=v4` lands you there for that visit,
 * a reload returns you to W3, and a browser already carrying the stale value is
 * healed the next time it reads it.
 */
export type DesignSystem = 'v4' | 'editorial2'

const KEY = 'designSystem'

function isDesignSystem(v: unknown): v is DesignSystem {
  return v === 'v4' || v === 'editorial2'
}

export function readDesignSystem(): DesignSystem {
  try {
    const raw = localStorage.getItem(KEY)
    // A stored 'v4' is stale by definition now — clear it rather than honour
    // it, so a pinned browser fixes itself instead of needing a console.
    if (raw === 'v4') {
      localStorage.removeItem(KEY)
      return 'editorial2'
    }
    return isDesignSystem(raw) ? raw : 'editorial2'
  } catch {
    return 'editorial2'
  }
}

export function writeDesignSystem(ds: DesignSystem): void {
  // Deliberately one-way: only the default is remembered. Persisting 'v4' is
  // what stranded riders on the old app, and the escape hatch does not need
  // memory to work — the URL carries it.
  if (ds !== 'editorial2') return
  try {
    localStorage.setItem(KEY, ds)
  } catch {
    /* private mode — fall back to the default on the next read */
  }
}

export function designSystemFromSearch(search: string): DesignSystem | null {
  const raw = new URLSearchParams(search).get('ds')
  return isDesignSystem(raw) ? raw : null
}

/**
 * Where each system lands.
 *
 * `editorial2` — the W3 app — is now the DEFAULT and the only one anything
 * links to. The v4 dashboard is not deleted (it still holds surfaces the W3 app
 * has not replaced, and deleting it would be a much larger, riskier change than
 * hiding it), but nothing navigates there any more: it takes a deliberate
 * `?ds=v4` to reach it. `editorial2` also moved off the older `/e/today` onto
 * the W3 Today, which is the screen the tab bar and every W3 route assume.
 */
export const LANDING: Record<DesignSystem, string> = {
  v4: '/dashboard',
  editorial2: '/e/w3-today',
}

/** Root-redirect target. A ?ds= in the URL both wins and sticks. */
export function resolveLandingPath(search: string): string {
  const fromUrl = designSystemFromSearch(search)
  if (fromUrl) writeDesignSystem(fromUrl)
  return LANDING[fromUrl ?? readDesignSystem()]
}
