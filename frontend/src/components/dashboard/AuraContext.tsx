/**
 * AuraContext — lets the Today flagship publish its state-keyed readiness-aura
 * colour up to the DashboardShell, which renders the aura as a full-screen
 * backdrop behind ALL of <main> (including the header bar), matching the pen's
 * flagship frames where the aura fills the whole screen. Only the Today tab
 * sets a colour; every other tab leaves it null → no aura.
 *
 * The `setRoad` channel is the same idea for "Today's Road": when the Today
 * tab publishes a road payload it takes over the backdrop entirely (ground
 * level is Critical Power — see roadProfile.ts), otherwise the plain aura
 * shows.
 */
import { createContext, useContext } from 'react'
import type { RoadProfile } from '../../utils/roadProfile'
import type { RoadMode } from '../../utils/roadMode'

/** What the Today tab publishes so the shell can draw the landscape. */
export interface RoadPayload { profile: RoadProfile; mode: RoadMode; color: string }

export interface AuraContextValue {
  /** Set the current aura colour (hex), or null to clear it. */
  setAura: (color: string | null) => void
  /** Publish the day's road, or null to fall back to the plain aura. */
  setRoad: (road: RoadPayload | null) => void
}

export const AuraContext = createContext<AuraContextValue>({ setAura: () => {}, setRoad: () => {} })

export const useAura = () => useContext(AuraContext)
