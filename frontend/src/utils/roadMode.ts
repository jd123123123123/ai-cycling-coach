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

// Compiler-enforced mapping: TypeScript requires every RoadMode member as a key.
// Without all modes, tsc raises TS2345. This prevents -1 values reaching the shader's
// u_mode uniform, which would silently select the wrong landscape.
const ROAD_MODE_INDEX: Record<RoadMode, number> = {
  'prescribed': 0,
  'ridden': 1,
  'flat-calm': 2,
  'flat-done': 3,
  'flat-unlit': 4,
  'bare': 5,
}

/** Stable float index handed to the shader as u_mode. */
export function roadModeIndex(mode: RoadMode): number {
  return ROAD_MODE_INDEX[mode]
}
