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
  /** The wallet's recent ledger lines — used ONLY to say what landed today. */
  ledger?: { amount: number; at: string | null }[] | null
  /** The rider's own choice of what stands on stage. 'collection' puts the
   *  bought catalogue bike up even when a photographed machine exists — the
   *  15 000-RC sink must be able to change what the rider actually sees. */
  stageBike?: 'photo' | 'collection' | null
  displayName: string | null | undefined
}

/** RideCoin credited today, from the real ledger. Null when nothing landed —
 *  a "+0" would be noise; silence is the honest zero here. */
export function earnedToday(ledger: { amount: number; at: string | null }[] | null | undefined, now = new Date()): number | null {
  if (!ledger?.length) return null
  const day = now.toISOString().slice(0, 10)
  const sum = ledger.reduce((s, l) => {
    if (l.amount <= 0 || !l.at) return s
    return l.at.slice(0, 10) === day ? s + l.amount : s
  }, 0)
  return sum > 0 ? sum : null
}

export function heroVm(s: HeroSources): W3StageVm {
  const collectible = s.collection?.render ?? itemById(s.collection?.loadout.bike)?.art ?? null
  const wantsCollection = s.stageBike === 'collection' && collectible != null
  return {
    handle: s.displayName ? `@${s.displayName}` : '@rider',
    role: blockLine(s.meso ?? null),
    // The bust wearing its helmet and glasses when one has been composed, the
    // bare-headed collectible until then.
    rider: s.stage?.rider_image ?? s.garage?.rider?.image_base64 ?? null,
    // THE CONFIGURED BIKE FIRST: the machine wearing its equipped parts and
    // standing in the stage the rider chose. The plain garage render is the
    // fallback, and the claimed collectible the last resort — never a stock
    // bike presented as theirs. The rider may explicitly put their BOUGHT
    // collection bike on stage instead (goals.stage_bike = 'collection'):
    // owned is owned, and a sink whose purchase changes nothing visible is a
    // refund request.
    bike: wantsCollection
      ? collectible
      : s.stage?.bike_image ?? s.garage?.bike?.image_base64 ?? collectible,
    // A COMPOSED render is one the Today endpoint returned that ISN'T the plain
    // garage collectible.
    //
    // THIS IS A SIZE SWITCH, not a label. A scene reaches its own frame and is
    // drawn full bleed; a studio cut-out stands on the floor line at its own
    // scale with its shadows. `bike_image != null` looks like the same test and
    // is not — every rider has a bike_image, so that version calls every
    // machine a scene and blows it up to fill the stage.
    // Forcing the collection bike also forces the STUDIO treatment: catalogue
    // art and build renders are cut-outs (services/cutout), so they stand on
    // the floor line with their shadows — the size switch must describe the
    // art actually drawn, not the art skipped.
    bikeInScene: wantsCollection
      ? false
      : Boolean(s.stage?.bike_image && s.stage.bike_image !== s.garage?.bike?.image_base64),
    bikeName: wantsCollection
      ? itemById(s.collection?.loadout.bike)?.name ?? 'Dein Bike'
      : s.stage?.bike_name ?? s.garage?.bike?.name ?? 'Dein Bike',
    coins: s.balance != null ? s.balance.toLocaleString('de-DE') : null,
    // What landed TODAY, beside the stock figure — the moment of attribution
    // the silent chip was missing. Real ledger lines only.
    coinsDelta: (() => {
      const rc = earnedToday(s.ledger)
      return rc != null ? `+${rc.toLocaleString('de-DE')} heute` : null
    })(),
    streak: s.streak ?? null,
    bonus: s.streak == null ? null : formatMultiplier(streakMultiplier(s.streak)),
    stages: s.stage?.stages,
    stage: s.stage?.stage,
  }
}
