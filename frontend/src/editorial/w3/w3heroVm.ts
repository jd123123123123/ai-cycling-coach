import type { Garage, TodayStage } from '../../api/garage'
import type { W3StageVm } from './W3TodayStage'
import { blockLine } from './w3block'
import { formatMultiplier, streakMultiplier } from '../../api/rewards'
import { itemById } from './w3shop'

/**
 * WHAT THE HERO SHOWS, derived once.
 *
 * The room is shared by more than one screen now (`W3HeroShell`), so the rider,
 * the machine and the numbers above it cannot be assembled by whichever screen
 * happens to be mounted. They are assembled HERE, from the raw payloads, and
 * `W3HeroRoute` does nothing but hand them over.
 *
 * It is a pure function so it can be TESTED, and it is tested because the one
 * field that reads as a detail — `bikeInScene` — is really a size switch, and
 * getting it wrong ships a bike that fills the screen. See the note on it.
 */

export interface HeroSources {
  stage: TodayStage | null | undefined
  garage: Garage | null | undefined
  collection: { render?: string | null; loadout: { bike?: string | null } } | null | undefined
  meso: { block_position: string; block_index_in_meso: number } | null | undefined
  streak: number | null | undefined
  balance: number | null | undefined
  displayName: string | null | undefined
}

export function heroVm(s: HeroSources): W3StageVm {
  const collectible = s.collection?.render ?? itemById(s.collection?.loadout.bike)?.art ?? null
  return {
    handle: s.displayName ? `@${s.displayName}` : '@rider',
    role: blockLine(s.meso ?? null),
    // The bust wearing its helmet and glasses when one has been composed, the
    // bare-headed collectible until then.
    rider: s.stage?.rider_image ?? s.garage?.rider?.image_base64 ?? null,
    // THE CONFIGURED BIKE FIRST: the machine wearing its equipped parts and
    // standing in the stage the rider chose. The plain garage render is the
    // fallback, and the claimed collectible the last resort — never a stock
    // bike presented as theirs.
    bike: s.stage?.bike_image ?? s.garage?.bike?.image_base64 ?? collectible,
    // A COMPOSED render is one the Today endpoint returned that ISN'T the plain
    // garage collectible.
    //
    // THIS IS A SIZE SWITCH, not a label. A scene reaches its own frame and is
    // drawn full bleed; a studio cut-out stands on the floor line at its own
    // scale with its shadows. `bike_image != null` looks like the same test and
    // is not — every rider has a bike_image, so that version calls every
    // machine a scene and blows it up to fill the stage.
    bikeInScene: Boolean(s.stage?.bike_image && s.stage.bike_image !== s.garage?.bike?.image_base64),
    bikeName: s.stage?.bike_name ?? s.garage?.bike?.name ?? 'Dein Bike',
    coins: s.balance != null ? s.balance.toLocaleString('de-DE') : null,
    streak: s.streak ?? null,
    bonus: s.streak == null ? null : formatMultiplier(streakMultiplier(s.streak)),
    stages: s.stage?.stages,
    stage: s.stage?.stage,
  }
}
