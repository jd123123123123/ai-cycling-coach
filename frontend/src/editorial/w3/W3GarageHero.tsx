import W3TodayStage, { STAGE_PLATE } from './W3TodayStage'
import { useGroundColour } from './useGroundColour'
import W3PartsDock from './W3PartsDock'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { T, FONT } from './w3tokens'
import type { Gear } from '../../api/gear'
import './w3.css'

/**
 * W3 · GARAGE — the same room as Today, answering the garage's question.
 *
 * IT WAS A DIFFERENT APP. Today opens on the machine standing in a lit room,
 * full-bleed, with one panel floating over the floor. The garage — the same
 * bike, the screen you go to in order to LOOK at it — framed it as a small
 * photograph in a card on a flat page. Two screens about one object, in two
 * visual languages, and the garage was the weaker one.
 *
 * Same stage, same floor, same panel geometry. Only the panel's CONTENT
 * changes, because only the question changes: Today's asks what the day
 * demands of the rider, the garage's asks what the bike is wearing.
 *
 * ── WHY THIS IS SAFE NOW, WHEN IT WAS NOT ────────────────────────────────
 * The old card carried a real argument: bike renders have a light-grey studio
 * ground baked in, and compositing one onto a near-black stage used to mean
 * fighting the image — a screen blend left a bright rounded rectangle, and a
 * mask tight enough to kill that bleached the bike to a grey ghost. That is no
 * longer the input. The renders are CUT OUT (`services/cutout`), which is why
 * Today can stand the same machine on the same floor with two real tyre
 * shadows under it. The framed photograph was the right answer to a problem
 * that has since been solved upstream.
 *
 * The page ground is read off the stage plate, exactly as Today reads it, so
 * both screens end in the same colour and the app is one room rather than two.
 */

export interface W3GarageHeroProps {
  handle: string
  role: string | null
  rider: string | null
  bike: string | null
  bikeName: string
  /** True when `bike` is a composed scene rather than the studio collectible. */
  bikeInScene?: boolean
  coins: string | null
  streak: number | null
  bonus: string | null
  gear: Gear | null
  /** True while a new build renders after an equip change. */
  building?: boolean
  workshopBonus: number | null
  onOpenSlot: (slot: string) => void
  onOpenWorkshop: () => void
}

export default function W3GarageHero(p: W3GarageHeroProps) {
  const ground = useGroundColour(STAGE_PLATE)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{
          position: 'relative',
          height: 'calc(100dvh - 92px - env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column',
          background: ground ?? T.heroBg,
        }}>
          <W3StatusBar />

          <W3TodayStage
            fullBleed
            vm={{
              handle: p.handle,
              role: p.role,
              rider: p.rider,
              bike: p.bike,
              bikeName: p.bikeName,
              bikeInScene: p.bikeInScene,
              coins: p.coins,
              streak: p.streak,
              bonus: p.bonus,
              // The stage's own "being composed" state, so an equip change
              // reads the same here as a scene change does on Today.
              rendering: p.building,
            }} />

          {/* The pen's bottom slot, at the same height Today puts its panel:
              the bike stands on a floor line at 76 % of the stage, and a panel
              starting higher than that cuts across the machine beside it. */}
          <div style={{
            position: 'relative', zIndex: 2, marginTop: 'auto',
            padding: '10px 16px 18px', flex: 'none',
          }}>
            <W3PartsDock
              gear={p.gear}
              onOpenSlot={p.onOpenSlot}
              onOpenWorkshop={p.onOpenWorkshop}
              workshopBonus={p.workshopBonus} />
          </div>
        </div>

        <W3TabBar />
      </div>
    </div>
  )
}
