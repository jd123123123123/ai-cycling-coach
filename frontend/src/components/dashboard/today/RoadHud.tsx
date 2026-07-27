/**
 * RoadHud — Today's Road's accessible + textual surface, mounted by
 * DashboardShell. Split out from DashboardShell so the mounting behaviour
 * (render / honest-absence / travel passthrough) is testable without also
 * standing up CoachChat, CommandPalette, MobileBottomNav, and everything
 * else DashboardShell renders.
 *
 * Honest absence: with no samples there is no session to scrub through, so
 * this renders nothing rather than an empty glass pill (matches the
 * honest-absence pattern used everywhere else in this codebase).
 */
import type { RoadPayload } from '../AuraContext'
import { glassCardStyle } from '../glassCard'
import RoadReadout from './RoadReadout'

export interface RoadHudProps {
  road: RoadPayload | null
  /** Current scrub position (0..1), from TodayRoad's onTravel. */
  travel: number
  de: boolean
}

export default function RoadHud({ road, travel, de }: RoadHudProps) {
  if (!road || road.profile.samples.length === 0) return null
  return (
    <div
      className="rounded-full px-4 py-2"
      style={{ ...glassCardStyle, position: 'sticky', top: 8, zIndex: 5, alignSelf: 'flex-start' }}
    >
      <RoadReadout profile={road.profile} blocks={road.blocks} travel={travel} de={de} />
    </div>
  )
}
