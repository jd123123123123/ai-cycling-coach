/**
 * AuraContext — lets the Today flagship publish its state-keyed readiness-aura
 * colour up to the DashboardShell, which renders the aura as a full-screen
 * backdrop behind ALL of <main> (including the header bar), matching the pen's
 * flagship frames where the aura fills the whole screen. Only the Today tab
 * sets a colour; every other tab leaves it null → no aura.
 */
import { createContext, useContext } from 'react'

export interface AuraContextValue {
  /** Set the current aura colour (hex), or null to clear it. */
  setAura: (color: string | null) => void
}

export const AuraContext = createContext<AuraContextValue>({ setAura: () => {} })

export const useAura = () => useContext(AuraContext)
