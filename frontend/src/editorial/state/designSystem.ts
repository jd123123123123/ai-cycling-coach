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
    return isDesignSystem(raw) ? raw : 'v4'
  } catch {
    return 'v4'
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

export const LANDING: Record<DesignSystem, string> = {
  v4: '/dashboard',
  editorial2: '/e/today',
}

/** Root-redirect target. A ?ds= in the URL both wins and sticks. */
export function resolveLandingPath(search: string): string {
  const fromUrl = designSystemFromSearch(search)
  if (fromUrl) writeDesignSystem(fromUrl)
  return LANDING[fromUrl ?? readDesignSystem()]
}
