/**
 * roadMode — which landscape Today's Road draws, derived from the SAME
 * flagship state the rest of the Today tab already uses. Never invents a
 * workout: without a real profile the road degrades to a bare horizon.
 */
import type { FlagshipState } from '../components/dashboard/tabs/TodayTab'

export type RoadMode =
  | 'prescribed'   // the terrain of today's planned session
  | 'ridden'       // the road actually ridden (real power stream)
  | 'flat-calm'    // planned rest — a calm valley, no waterline
  | 'flat-done'    // trained today, but no stream to draw
  | 'flat-unlit'   // rest recommended — the road ahead deliberately unlit
  | 'bare'         // nothing honest to draw

export function roadMode(
  state: FlagshipState,
  opts: { hasProfile: boolean; hasRidden: boolean },
): RoadMode {
  switch (state) {
    case 'pending': return 'bare'
    case 'rest': return 'flat-unlit'
    case 'planned-rest': return 'flat-calm'
    case 'post': return opts.hasRidden ? 'ridden' : 'flat-done'
    case 'ready':
    case 'controlled': return opts.hasProfile ? 'prescribed' : 'bare'
  }
}

const ORDER: RoadMode[] = ['prescribed', 'ridden', 'flat-calm', 'flat-done', 'flat-unlit', 'bare']

/** Stable float index handed to the shader as u_mode. */
export function roadModeIndex(mode: RoadMode): number {
  return ORDER.indexOf(mode)
}
