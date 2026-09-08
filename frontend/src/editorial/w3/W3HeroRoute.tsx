import { Outlet } from 'react-router-dom'
import W3HeroShell from './W3HeroShell'
import { useGarage, useSelectStage, useTodayStage } from '../../hooks/useGarage'
import { useWallet } from '../../hooks/useWallet'
import { useStreak } from '../../hooks/useStreak'
import { useAuth } from '../../contexts/AuthContext'
import { useGarageCollection } from '../../hooks/useShop'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { heroVm } from './w3heroVm'
import { useWarmRoom } from './useWarmRoom'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { grimeFrom } from './w3BikeSoul'
import { stageThemeById } from './w3stageThemes'

/**
 * The layout route that owns the room.
 *
 * Every screen nested under this one shares ONE mounted stage: the same bike,
 * the same avatar, the same chips, the same floor. Navigating between them
 * swaps the panel over the floor and the content below and touches nothing
 * else — which is the difference between a place and a set of pages about a
 * place.
 *
 * IT FETCHES THE ROOM, NOT THE SCREENS. The bike, the rider and the balance
 * belong to the rider rather than to any one screen, so they are read here once
 * instead of by each page — including the three Today used to derive for the
 * hero (the tier line, the streak multiplier, the collectible fallback). Every
 * nested page keeps its own data for its own question; none of them re-reads
 * the machine.
 *
 * WHAT IT SHOWS is assembled by `heroVm`, a pure function with tests, because
 * one of those fields is a size switch wearing the clothes of a label.
 */
export default function W3HeroRoute() {
  const { data: garage } = useGarage()
  const { data: stage } = useTodayStage()
  const { data: wallet } = useWallet()
  const { data: streak } = useStreak()
  const { data: collection } = useGarageCollection()
  const { data: week } = useCurrentWeek()
  const { user } = useAuth()
  const { data: profile } = useAthleteProfile()
  // The stage rail belongs to whoever owns the stage, and that is now this
  // layout. Left on the Today page it would be a control over an element the
  // page no longer renders — dead in the room, and dead in the garage.
  const selectStage = useSelectStage()

  // Every other door in the room, opened before it is knocked on.
  useWarmRoom()

  // ── the bike is MADE OF the rider's training ──────────────────────────
  // `w3BikeSoul.grimeFrom` shipped with the retired garage-old and died with
  // it. The last week's real kilometres put road on the machine here, on the
  // most-seen screen: a rider who rode 300km sees it; a bike that has not
  // moved stays clean, which is the honest, motivating signal.
  const weekAgo = new Date(Date.now() - 7 * 864e5)
  const { data: weekActs } = useActivitiesRange(weekAgo, new Date())
  const km7d = weekActs
    ? weekActs.activities
        .filter((a) => a.sport === 'cycling')
        .reduce((s, a) => s + (a.distance_meters ?? 0), 0) / 1000
    : null
  const grime = grimeFrom(km7d)

  return (
    <W3HeroShell
      vm={{
        ...heroVm({
          stage, garage, collection,
          meso: week?.meso_block ?? null,
          streak: streak?.streak ?? null,
          balance: wallet?.balance ?? null,
          ledger: wallet?.ledger ?? null,
          stageBike: profile?.goals?.stage_bike ?? null,
          displayName: user?.display_name ?? null,
        }),
        onSelectStage: selectStage.mutate,
        rendering: selectStage.isPending,
        grime,
        // The room's backdrop — the rider's own pick, from the same goals
        // JSON the stage-bike switch lives in. Default: the studio.
        theme: stageThemeById(profile?.goals?.stage_theme),
      }}>
      <Outlet />
    </W3HeroShell>
  )
}
