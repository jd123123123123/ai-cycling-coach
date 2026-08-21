import { Outlet } from 'react-router-dom'
import W3HeroShell from './W3HeroShell'
import { useGarage, useSelectStage, useTodayStage } from '../../hooks/useGarage'
import { useWallet } from '../../hooks/useWallet'
import { useStreak } from '../../hooks/useStreak'
import { useAuth } from '../../contexts/AuthContext'
import { useGarageCollection } from '../../hooks/useShop'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { itemById } from './w3shop'
import { blockLine } from './w3block'
import { formatMultiplier, streakMultiplier } from '../../api/rewards'

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
 * belong to the rider rather than to Today or to the garage, so they are read
 * here once instead of by each page. Every nested page keeps its own data for
 * its own question; none of them re-reads the machine.
 */
export default function W3HeroRoute() {
  const { data: garage } = useGarage()
  const { data: stage } = useTodayStage()
  const { data: wallet } = useWallet()
  const { data: streak } = useStreak()
  const { user } = useAuth()
  // The stage rail belongs to whoever owns the stage, and that is now this
  // layout. Left on the Today page it would be a control over an element the
  // page no longer renders — dead in the room, and dead in the garage.
  const selectStage = useSelectStage()
  // Everything the hero SHOWS is read here, including the three things Today
  // used to derive for it. They describe the rider, not the screen: the tier
  // line is the training block they are in, the multiplier is what their streak
  // earns, and the collectible is the bike they claimed. All three are as true
  // in the garage as on Today, and W3Guard has already warmed the caches.
  const { data: collection } = useGarageCollection()
  const { data: week } = useCurrentWeek()

  return (
    <W3HeroShell
      vm={{
        handle: user?.display_name ? `@${user.display_name}` : '@rider',
        role: blockLine(week?.meso_block ?? null),
        rider: stage?.rider_image ?? garage?.rider?.image_base64 ?? null,
        // The composed scene when there is one, the studio collectible
        // otherwise. Never a stock bike presented as theirs.
        bike: stage?.bike_image ?? garage?.bike?.image_base64
          ?? collection?.render ?? itemById(collection?.loadout.bike)?.art ?? null,
        // A COMPOSED render is one the Today endpoint returned that ISN'T the
        // plain garage collectible. The distinction decides the treatment, and
        // the two treatments are different SIZES: a scene reaches its own frame
        // and goes full bleed, a studio cut-out stands on the floor line at its
        // own scale. `bike_image != null` looked equivalent and is not — every
        // rider without a composed build has a bike_image, and calling it a
        // scene blew the machine up to fill the stage.
        bikeInScene: Boolean(stage?.bike_image && stage.bike_image !== garage?.bike?.image_base64),
        bikeName: stage?.bike_name ?? garage?.bike?.name ?? 'Dein Bike',
        stages: stage?.stages,
        stage: stage?.stage,
        onSelectStage: selectStage.mutate,
        rendering: selectStage.isPending,
        coins: wallet?.balance != null ? wallet.balance.toLocaleString('de-DE') : null,
        streak: streak?.streak ?? null,
        bonus: streak?.streak == null ? null : formatMultiplier(streakMultiplier(streak.streak)),
      }}>
      <Outlet />
    </W3HeroShell>
  )
}
