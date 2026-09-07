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
  // The stage rail belongs to whoever owns the stage, and that is now this
  // layout. Left on the Today page it would be a control over an element the
  // page no longer renders — dead in the room, and dead in the garage.
  const selectStage = useSelectStage()

  // Every other door in the room, opened before it is knocked on.
  useWarmRoom()

  return (
    <W3HeroShell
      vm={{
        ...heroVm({
          stage, garage, collection,
          meso: week?.meso_block ?? null,
          streak: streak?.streak ?? null,
          balance: wallet?.balance ?? null,
          ledger: wallet?.ledger ?? null,
          displayName: user?.display_name ?? null,
        }),
        onSelectStage: selectStage.mutate,
        rendering: selectStage.isPending,
      }}>
      <Outlet />
    </W3HeroShell>
  )
}
