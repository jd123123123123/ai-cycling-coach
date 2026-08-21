import { motion, useReducedMotion } from 'motion/react'
import { Wrench, ChevronRight } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { gearArt, type Gear, type GearItem } from '../../api/gear'

/**
 * W3 · GARAGE — the slots, in the place Today keeps its readiness panel.
 *
 * THE SAME SLOT ON THE SCREEN MEANS THE SAME THING. Today's first screen is the
 * bike standing in its room with one panel floating over the floor, and that
 * panel answers "what does today ask of you". The garage is the same room and
 * the same machine, so it gets the same panel in the same place — and it
 * answers the question the garage is for: what is this bike wearing, and what
 * else could it wear. Framing the bike as a photograph in a card, as this
 * screen used to, made the garage look like a different app from the one the
 * rider had just been on.
 *
 * IT IS THE SAME DOCK, NOT A LOOKALIKE: flat tone, radius 28, no drawn edge —
 * `w3surfaces.lux()` argues why. An empty slot is a dashed outline rather than
 * a filled tile, because an empty slot is an INVITATION and a filled one is a
 * statement, and the two must not look alike at a glance.
 *
 * Every percentage on it is the server's own (`gear.items[].pct`); the total is
 * their sum and never a rounded-up headline.
 */

function Socket({ label, worn, onTap, delay, reduce }: {
  label: string
  worn: GearItem | undefined
  onTap: () => void
  delay: number
  reduce: boolean | null
}) {
  return (
    <motion.button
      onClick={onTap}
      aria-label={worn ? `${label}: ${worn.name_de} — ändern` : `${label} — leer, etwas einsetzen`}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay }}
      style={{
        flex: 1, minWidth: 0, border: 0, padding: 0, cursor: 'pointer',
        background: 'transparent', fontFamily: FONT,
        display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
      }}>
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: 15, overflow: 'hidden',
        background: worn ? T.tile : T.heroBg,
        border: worn ? `1.5px solid ${T.acid}` : `1.5px dashed ${T.heroOff}`,
        display: 'grid', placeItems: 'center', position: 'relative',
      }}>
        {worn ? (
          <>
            <img src={gearArt(worn.id)} alt="" aria-hidden
                 style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{
              position: 'absolute', bottom: 3, right: 3, height: 15, padding: '0 5px',
              borderRadius: 100, background: `${T.heroInk}D9`, display: 'grid', placeItems: 'center',
              fontSize: 8, fontWeight: 800, color: T.acid,
            }}>+{worn.pct}</span>
          </>
        ) : (
          <span style={{ fontSize: 19, color: T.heroOff, fontWeight: 300 }}>+</span>
        )}
      </div>
      <span style={{
        fontSize: 7.5, fontWeight: 700, letterSpacing: 0.6, color: worn ? T.acid : T.quiet,
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
    </motion.button>
  )
}

export interface W3PartsDockProps {
  gear: Gear | null
  onOpenSlot: (slot: string) => void
  onOpenWorkshop: () => void
  /** Unharvested Service Bonus. Null while unknown, 0 when there is none — and
   *  only a positive figure earns the line. */
  workshopBonus: number | null
}

export default function W3PartsDock({ gear, onOpenSlot, onOpenWorkshop, workshopBonus }: W3PartsDockProps) {
  const reduce = useReducedMotion()
  const slots = Object.entries(gear?.slots ?? {})
  const worn = (gear?.items ?? []).filter((i) => i.equipped)
  const total = worn.reduce((s, i) => s + i.pct, 0)

  return (
    <div style={{
      background: T.heroDock, borderRadius: 28, boxShadow: '0 2px 10px #00000040',
      padding: '13px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12,
      fontFamily: FONT, width: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>AUSRÜSTUNG</span>
        {/* The total is the sum of what is actually fitted. Absent when nothing
            is — a "+0 %" reads as a broken calculation rather than an empty
            bike. */}
        {total > 0 && (
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4, color: T.acid, fontVariantNumeric: 'tabular-nums' }}>
            +{total} %
          </span>
        )}
      </div>

      {slots.length > 0 ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {slots.map(([slot, label], i) => (
            <Socket key={slot} label={label} delay={0.05 + i * 0.05} reduce={reduce}
              worn={worn.find((w) => w.slot === slot)}
              onTap={() => onOpenSlot(slot)} />
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
          Deine Teile erscheinen hier, sobald der Shop geladen hat.
        </span>
      )}

      {/* The workshop, only when it has something waiting. A row that always
          says "0 wartet" trains the eye to skip the row. */}
      {workshopBonus != null && workshopBonus > 0 && (
        <button onClick={onOpenWorkshop} style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
          padding: '10px 12px', borderRadius: 16, border: 0, cursor: 'pointer',
          background: T.heroBg, fontFamily: FONT, textAlign: 'left',
        }}>
          <Wrench size={14} color={T.acid} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: T.mid }}>
            In der Werkstatt warten <span style={{ color: T.ink, fontWeight: 700 }}>{workshopBonus.toLocaleString('de-DE')}</span>
          </span>
          <ChevronRight size={14} color={T.quiet} />
        </button>
      )}
    </div>
  )
}
