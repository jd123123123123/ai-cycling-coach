/**
 * Which design system the athlete lands in. A persisted preference so the
 * choice survives reloads, plus ?ds= so either system is one URL away without
 * digging through settings.
 */
export type DesignSystem = 'v4' | 'editorial2'

const KEY = 'designSystem'

function isDesignSystem(v: unknown): v is DesignSystem {
  return v === 'v4' || v === 'editorial2'
}

export function readDesignSystem(): DesignSystem {
  try {
    const raw = localStorage.getItem(KEY)
    return isDesignSystem(raw) ? raw : 'editorial2'
  } catch {
    return 'editorial2'
  }
}

export function writeDesignSystem(ds: DesignSystem): void {
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
