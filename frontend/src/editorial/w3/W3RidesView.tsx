import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { updateGoals } from '../../api/athletes'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { T, FONT } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { useHeroPanel } from './W3HeroShell'
import { useActivityRhythm } from '../../hooks/useActivityRhythm'
import W3TopBar from './W3TopBar'
import {RideJournal, RideSummary} from './W3RideJournal'
import './w3.css'
export type W3RideFilter = 'all' | 'outdoor' | 'indoor' | 'race'

export interface W3RideCard {
  id: number | null                 // real activity id → /e/w3-ride/:id
  title: string
  dateLabel: string                 // "TUE 12 AUG" (real)
  km: string                        // "40.34" | "—"
  speed: string                     // "31.5" | "—"
  power: string                     // "248" | "—"
  dur: string                       // "1:16" | "—"
  note: string | null               // real derived fact (elevation / TSS) | null
  indoor: boolean
  race: boolean
  recent: boolean                   // within the last 7 days
  polyline: [number, number][] | null
}

export interface W3RidesVm {
  title: string
  loggedLabel: string
  count: string                     // "142 rides" (real)
  seasonLabel: string
  totalKm: string                   // "4 812" (real)
  totalUnit: string
  ofGoalLabel: string
  bars: number[]                    // real, normalised 0..1 monthly distance
  /** The same twelve months, in the units a tapped bar has to speak. */
  barMonths: { km: number; label: string; year: number }[]
  barsAccentFrom: number            // index from which bars render acid
  avgSpeed: string                  // real | "—"
  avgPower: string                  // real | "—"
  saddleTime: string                // real | "—"
  rides: W3RideCard[]               // real; the View filters + groups
  /** A record that fell within the last 7 days — announced at the top of the
   *  archive instead of silently changing a row. Null on most days. */
  prAnnounce?: { title: string; sub: string; id: number } | null
  /** The rider's own season goal, or null → the dock renders the set-a-goal
   *  invitation instead. Never a placeholder target. */
  goal: {
    chip: string
    ofGoalPct: string
    progress: number                // 0..1
    currentKm: number
    targetKm: number
    projectedKm: number
    realityLabel: string
    projectionLabel: string
    toGoLabel: string
    paceLabel: string
    paceAhead: boolean
  } | null
}

export default function W3RidesView({vm}:{vm:W3RidesVm}){
 const nav=useNavigate(),[goalSheet,setGoalSheet]=useState(false)
 const {data:rhythm}=useActivityRhythm()
 const dock=<RideSummary vm={vm} rhythm={rhythm} onSetGoal={()=>setGoalSheet(true)}/>
 const {inShell,portal}=useHeroPanel(dock)
 const content=<RideJournal vm={vm} onOpen={id=>nav(`/e/w3-ride/${id}`)}/>
 const sheet=goalSheet?<SeasonGoalSheet onClose={()=>setGoalSheet(false)}/>:null
 if(inShell)return <>{portal}{content}{sheet}</>
 return <div className="w3-root"><div className="w3-frame" style={{fontFamily:FONT,minHeight:'100dvh',background:T.bg}}><W3StatusBar/><W3TopBar title="Fahrten"/><div style={{padding:'8px 20px 0'}}>{dock}</div>{content}<W3TabBar/>{sheet}</div></div>
}
/** The season-goal editor: one number, the rider's own. Writes
 *  `goals.season_km_goal` via PUT /athletes/me/goals and refreshes the
 *  profile, so the dock's meter fills against a target somebody actually set.
 *  "Entfernen" sends 0, which clears the key server-side. */
function SeasonGoalSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: profile } = useAthleteProfile()
  const existing = profile?.goals?.season_km_goal ?? null
  const [km, setKm] = useState(existing ?? 5000)
  const [busy, setBusy] = useState(false)
  const save = async (value: number) => {
    if (busy) return
    setBusy(true)
    try {
      await updateGoals({ season_km_goal: value })
      await qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      onClose()
    } finally { setBusy(false) }
  }
  const STEP = 500
  return (
    <div role="dialog" aria-label="Saisonziel"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: `${T.bg}CC`, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: T.surface, borderRadius: '24px 24px 0 0',
          padding: '22px 20px calc(20px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT,
        }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Dein Saisonziel</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.quiet, lineHeight: 1.4 }}>
          Kilometer in den letzten 12 Monaten. Das Ziel gehört dir — der Zähler misst nur dagegen, wenn du eins setzt.
        </span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <button type="button" aria-label="Weniger" onClick={() => setKm((v) => Math.max(STEP, v - STEP))}
            style={{ width: 44, height: 44, borderRadius: 100, border: 0, background: T.surface2, color: T.ink, fontSize: 22, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1, color: T.acid, fontVariantNumeric: 'tabular-nums', minWidth: 130, textAlign: 'center' }}>
            {km.toLocaleString('de-DE')} km
          </span>
          <button type="button" aria-label="Mehr" onClick={() => setKm((v) => Math.min(50_000, v + STEP))}
            style={{ width: 44, height: 44, borderRadius: 100, border: 0, background: T.surface2, color: T.ink, fontSize: 22, cursor: 'pointer' }}>+</button>
        </div>
        <button type="button" disabled={busy} onClick={() => void save(km)}
          style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontSize: 15.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: FONT, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Speichere…' : 'Ziel speichern'}
        </button>
        {existing != null && (
          <button type="button" disabled={busy} onClick={() => void save(0)}
            style={{ height: 40, borderRadius: 100, border: 0, background: 'none', color: T.quiet, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            Ziel entfernen
          </button>
        )}
      </div>
    </div>
  )
}
