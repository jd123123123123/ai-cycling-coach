import type { ReactNode } from 'react'

/** Shared W3 tokens + tiny primitives, so W3TodayView and W3Sections render
 *  from one source. Values transcribed from `w3.pen`. */
export const T = {
  bg: '#0B0B0B', surface: '#161616', surface2: '#202020',
  acid: '#C8FF00', acidDim: '#C8FF001F', acidDeep: '#8FBF00',
  ink: '#FFFFFF', mid: '#9BA0A6', quiet: '#6E7379',
  rule: '#FFFFFF14', stroke: '#FFFFFF1A',
  d2: '#FFFFFF33', d3: '#FFFFFF4D', d4: '#FFFFFF8C',
  training: '#2BE68F', evening: '#7B5CFF', cool: '#6B8CFF',
  warn: '#FFB020', bad: '#FF4356',
}
export const FONT = '"Inter Tight", ui-sans-serif, system-ui, sans-serif'
export const EASE = [0.22, 1, 0.36, 1] as const
export const grow = (delay: number) => ({ duration: 0.55, ease: EASE, delay })
export const DASH = '—'

export const Kicker = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>{children}</span>
)

/** Full-width band on w-bg (the pen's section wrapper). */
export const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', background: T.bg, padding: `0 20px ${padBottom}px` })
/** Surface card, r24. */
export const card = () => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column' as const, width: '100%' })
