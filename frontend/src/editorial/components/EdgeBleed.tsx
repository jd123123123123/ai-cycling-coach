import type { ReactNode } from 'react'

/**
 * Mechanic M — edge-bleed ground (roadbook, 2026-08-06, adapted).
 *
 * The state accent bleeds in from the top and bottom edges rather than
 * tinting the ground flat. The --g-* grounds are already this idea at
 * roughly 3%; --st-a26 is the same dial at 26%, so this is a value the
 * system owns rather than a new concept borrowed whole.
 *
 * Both washes are pointer-transparent and sit behind the content, so no
 * tap target anywhere on the screen changes because of them.
 */
export default function EdgeBleed({ children }: { children: ReactNode }) {
  return (
    <div data-edge-bleed="" style={{ position: 'relative', width: '100%' }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: '0 0 auto 0', height: 180, pointerEvents: 'none', zIndex: 0,
          background: 'linear-gradient(to bottom, var(--st-a26), transparent)',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 'auto 0 0 0', height: 180, pointerEvents: 'none', zIndex: 0,
          background: 'linear-gradient(to top, var(--st-a26), transparent)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>{children}</div>
    </div>
  )
}
