import { motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Wrench, Zap } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { GhostBike } from './W3BikeHero'
import { gearArt, type Gear, type GearItem } from '../../api/gear'

/**
 * W3 · GARAGE — the bike on its stage, wearing what the rider equipped.
 *
 * THE BIKE IS THE SCREEN. Same lit studio sweep as Today's hero (pen frames
 * `YIU3g`/`qv4Aw`), because this is the same object in the same room — and the
 * image it shows is the BUILT bike: equip gravel tyres and the photograph has
 * gravel tyres, through `bike_build`'s image-conditioned edit. That loop is the
 * whole reason the economy is worth playing. A number going up is a number; a
 * machine visibly becoming yours is a possession.
 *
 * THE SLOTS ARE UNDER IT, always five, always visible. One item per slot is the
 * rule that makes the loadout a decision rather than a checklist, and a rule
 * the rider cannot see is one they only ever meet as a surprise.
 *
 * "WAS ES BRINGT" states the arithmetic plainly: what the loadout adds, and on
 * WHICH rides. A conditional bonus the rider cannot predict is a lottery, so
 * the conditions are listed, not just the total — and the total is honest about
 * the fact that no single ride earns all of them.
 */

const nf = (n: number) => n.toLocaleString('de-DE')

export interface W3GarageStageProps {
  gear: Gear | null
  /** The BUILT bike — the rider's render wearing their loadout — or null. */
  bikeImage: string | null
  bikeName: string
  /** True while a new build is being composed after an equip change. */
  building: boolean
  onOpenSlot: (slot: string) => void
  onOpenWorkshop: () => void
  /** Unharvested Service Bonus, for the workshop teaser. Null while unknown. */
  workshopBonus: number | null
}

function SlotSocket({ label, worn, onTap }: {
  label: string
  worn: GearItem | undefined
  onTap: () => void
}) {
  return (
    <button onClick={onTap} aria-label={label}
      style={{
        flex: 1, minWidth: 0, border: 0, padding: 0, cursor: 'pointer',
        background: 'transparent', fontFamily: FONT,
        display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center',
      }}>
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: 14, overflow: 'hidden',
        background: worn ? T.heroChip : T.heroDock,
        border: worn ? `1.5px solid ${T.acid}` : `1.5px dashed ${T.heroOff}`,
        display: 'grid', placeItems: 'center', position: 'relative',
      }}>
        {worn ? (
          <>
            <img src={gearArt(worn.id)} alt={worn.name_de}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{
              position: 'absolute', bottom: 3, right: 3, height: 15, padding: '0 5px',
              borderRadius: 100, background: '#000000A6', display: 'grid', placeItems: 'center',
              fontSize: 8, fontWeight: 800, color: T.acid,
            }}>+{worn.pct}</span>
          </>
        ) : (
          <span style={{ fontSize: 18, color: T.heroOff, fontWeight: 300 }}>+</span>
        )}
      </div>
      <span style={{
        fontSize: 7.5, fontWeight: 700, letterSpacing: 0.6, color: worn ? T.acid : T.quiet,
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
    </button>
  )
}

export default function W3GarageStage({
  gear, bikeImage, bikeName, building, onOpenSlot, onOpenWorkshop, workshopBonus,
}: W3GarageStageProps) {
  const reduce = useReducedMotion()
  const floor = `linear-gradient(180deg, ${T.heroFloor[0]} 0%, ${T.heroFloor[1]} 40%, ${T.heroFloor[2]} 76%, ${T.heroFloor[3]} 100%)`

  const slotOrder = Object.keys(gear?.slots ?? {})
  const worn = (gear?.items ?? []).filter((i) => i.equipped)
  const total = worn.reduce((s, i) => s + i.pct, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: FONT, background: T.heroBg }}>

      {/* ── the bike, as a framed photograph ──────────────────────────────
           NOT blended onto the dark floor, and that took two attempts to get
           right. Every bike render carries a light-grey studio ground baked in
           (`ISOLATED_BIKE_STYLE`), so compositing it onto a near-black stage
           means fighting the image: `screen` blend plus a mask either left a
           bright rounded rectangle with a hard bottom edge, or — once the mask
           was tightened enough to kill that — bleached the bike itself to a
           grey ghost, because the mask was eating the subject along with its
           background.

           So the ground is kept and framed instead. This is the same treatment
           the gear tiles use, and the reference's own past-ride hero: a
           full-bleed photograph with rounded corners sitting ON the dark page,
           rather than a cut-out pretending to float in it. The bike keeps its
           real contrast and its own light. ── */}
      <div style={{ padding: '0 16px' }}>
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '4 / 3',
          borderRadius: 24, overflow: 'hidden', background: floor,
          display: 'grid', placeItems: 'center',
        }}>
        {bikeImage ? (
          <motion.img
            key={bikeImage.slice(-24)}
            src={bikeImage} alt={bikeName}
            initial={reduce ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: building ? 0.45 : 1, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
              position: 'relative', width: '100%', height: '100%', objectFit: 'cover',
            }} />
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}><GhostBike /></div>
        )}

        {/* Stated while a new build renders, because the edit is slow enough to
            look like nothing happened otherwise. */}
        {building && (
          <span style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            height: 26, padding: '0 14px', borderRadius: 100, background: '#000000A6',
            backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center',
            fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.acid,
          }}>WIRD UMGEBAUT …</span>
        )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 20px 26px' }}>

        {/* ── the five slots ── */}
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          {slotOrder.map((slot) => (
            <SlotSocket key={slot}
              label={gear?.slots[slot] ?? slot}
              worn={worn.find((i) => i.slot === slot)}
              onTap={() => onOpenSlot(slot)} />
          ))}
        </div>

        {/* ── was es bringt ── */}
        <div style={{
          background: T.heroDock, borderRadius: 24, padding: 18,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={13} color={T.acid} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: T.acid }}>
              WAS ES BRINGT
            </span>
            <span style={{
              marginLeft: 'auto', fontFamily: 'Archivo, "Inter Tight", sans-serif',
              fontSize: 26, fontWeight: 700, color: total > 0 ? T.ink : T.heroOff,
              fontVariantNumeric: 'tabular-nums',
            }}>+{total}%</span>
          </div>

          {worn.length === 0 ? (
            <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
              Noch nichts angelegt. Jedes Teil zählt nur auf Fahrten, zu denen es passt —
              deshalb lohnt es sich, vor der Ausfahrt umzubauen.
            </span>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {worn.map((i) => (
                  <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <img src={gearArt(i.id)} alt=""
                      style={{ width: 30, height: 30, borderRadius: 9, objectFit: 'cover', flex: 'none' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                      <span style={{
                        fontSize: 12.5, fontWeight: 700, color: T.ink,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{i.name_de}</span>
                      {/* The CONDITION, not just the number. A bonus the rider
                          cannot predict is a lottery, not a loadout. */}
                      <span style={{
                        fontSize: 10.5, fontWeight: 500, color: T.quiet,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{i.why}</span>
                    </div>
                    <span style={{
                      flex: 'none', fontSize: 13, fontWeight: 800, color: T.acid,
                      fontVariantNumeric: 'tabular-nums',
                    }}>+{i.pct}%</span>
                  </div>
                ))}
              </div>
              {/* The honest caveat. Summing conditional bonuses into one number
                  implies they all pay together, and they almost never do. */}
              <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
                Zusammen +{total} % — aber nur auf einer Fahrt, die zu allen passt.
                Sonst zählt, was gerade dazu passt.
              </span>
            </>
          )}
        </div>

        {/* ── the workshop, as a teaser with its real number ── */}
        <button onClick={onOpenWorkshop}
          style={{
            width: '100%', border: 0, cursor: 'pointer', background: T.heroDock,
            borderRadius: 20, padding: '15px 18px', fontFamily: FONT,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
          <Wrench size={16} color={T.acid} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, textAlign: 'left' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Werkstatt</span>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: T.quiet }}>
              {workshopBonus != null && workshopBonus > 0
                ? `${nf(workshopBonus)} warten auf dich`
                : 'Zustand deiner Teile'}
            </span>
          </div>
          <ChevronRight size={17} color={T.quiet} style={{ marginLeft: 'auto', flex: 'none' }} />
        </button>
      </div>
    </div>
  )
}
