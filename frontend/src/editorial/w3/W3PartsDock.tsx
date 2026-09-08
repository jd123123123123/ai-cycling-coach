import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Wrench, ChevronRight, Check, Coins, Loader2 } from 'lucide-react'
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

function Socket({ label, worn, onTap, delay, reduce, open }: {
  label: string
  worn: GearItem | undefined
  onTap: () => void
  delay: number
  reduce: boolean | null
  /** True while this socket's tray is the one showing underneath. */
  open: boolean
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
        // An OPEN socket is outlined whether or not it holds anything: the tray
        // below is about this slot, and the rider has to be able to see which
        // one they opened without reading the labels back.
        border: open
          ? `1.5px solid ${T.acid}`
          : worn ? `1.5px solid ${T.acid}` : `1.5px dashed ${T.heroOff}`,
        boxShadow: open ? `0 0 0 3px ${T.acid}26` : undefined,
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
        fontSize: 7.5, fontWeight: 700, letterSpacing: 0.6, color: open || worn ? T.acid : T.quiet,
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
    </motion.button>
  )
}


/** One candidate for the open slot: what it is, what it buys, and the one verb
 *  that applies to it right now. */
function PartRow({ item, busy, onEquip, onUnequip, onBuy }: {
  item: GearItem
  busy: boolean
  onEquip: (id: string) => void
  onUnequip: (id: string) => void
  onBuy: (id: string) => void
}) {
  // ONE VERB PER ROW. An item is in exactly one of four states and each has a
  // single sensible action, so the row never offers a choice between two
  // buttons the rider has to read to tell apart.
  const action = item.equipped
    ? { label: 'Abnehmen', run: () => onUnequip(item.id), lit: true }
    : item.owned
      ? { label: 'Anlegen', run: () => onEquip(item.id), lit: false }
      : item.affordable
        ? { label: `${item.price_rc.toLocaleString('de-DE')}`, run: () => onBuy(item.id), lit: false, coins: true }
        : { label: `${item.price_rc.toLocaleString('de-DE')}`, run: null, lit: false, coins: true }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', borderRadius: 14,
      background: item.equipped ? `${T.acid}14` : T.heroBg,
      opacity: action.run == null ? 0.5 : 1,
    }}>
      <div style={{
        width: 34, height: 34, flex: 'none', borderRadius: 10, overflow: 'hidden',
        background: T.tile, display: 'grid', placeItems: 'center',
      }}>
        <img src={gearArt(item.id)} alt="" aria-hidden
             style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: T.ink,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.name_de}</span>
        {/* The firing rule, not the flavour: "+8 % am Berg" is the reason to
            fit it and the flavour line is the reason to enjoy it. There is one
            line of room here and the rule wins it. */}
        <span style={{
          fontSize: 10, fontWeight: 600, color: T.quiet,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>+{item.pct} % · {item.why}</span>
      </div>

      <button
        onClick={action.run ?? undefined}
        disabled={busy || action.run == null}
        aria-label={`${item.name_de} — ${action.label}`}
        style={{
          flex: 'none', height: 28, padding: '0 11px', borderRadius: 100, border: 0,
          display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT,
          cursor: busy || action.run == null ? 'default' : 'pointer',
          background: action.lit ? T.acid : T.heroChip,
          color: action.lit ? T.heroInk : T.ink,
          fontSize: 10.5, fontWeight: 700,
        }}>
        {busy ? <Loader2 size={11} className="animate-spin" />
          : item.equipped ? <Check size={11} />
            : 'coins' in action && action.coins
              ? <Coins size={11} color={action.lit ? T.heroInk : T.acid} /> : null}
        {action.label}
      </button>
    </div>
  )
}

/** The open slot's shelf, directly under the sockets.
 *
 *  WHY IT IS HERE AND NOT A SCREEN. Fitting a part is a comparison — this wheel
 *  against the one already on the bike — and a comparison cannot be made across
 *  a navigation. The bike is standing right above this list; changing what it
 *  wears and watching it change is one motion, and it was three taps and two
 *  page loads. `/e/w3-gear` still exists for browsing the whole catalogue,
 *  which is a different job.
 */
function SlotTray({ label, items, busyId, reduce, onEquip, onUnequip, onBuy, onOpenAll }: {
  label: string
  items: GearItem[]
  busyId: string | null
  reduce: boolean | null
  onEquip: (id: string) => void
  onUnequip: (id: string) => void
  onBuy: (id: string) => void
  onOpenAll?: () => void
}) {
  const SHOWN = 4
  const rest = Math.max(0, items.length - SHOWN)
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={reduce ? undefined : { opacity: 0, height: 0 }}
      transition={{ duration: 0.26, ease: EASE }}
      style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>
          {label.toUpperCase()}
        </span>
        {items.length === 0 ? (
          <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
            Für diesen Platz gibt es noch nichts.
          </span>
        ) : (
          // Capped, and the cap is stated rather than silent: this is a panel
          // floating over the bike, not a catalogue, and a shelf that grows
          // past the machine defeats the reason it lives here.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {items.slice(0, SHOWN).map((it) => (
              <PartRow key={it.id} item={it} busy={busyId === it.id}
                onEquip={onEquip} onUnequip={onUnequip} onBuy={onBuy} />
            ))}
            {rest > 0 && (
              <button onClick={onOpenAll} style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '7px 9px', borderRadius: 12, border: 0, cursor: 'pointer',
                background: 'transparent', fontFamily: FONT, textAlign: 'left',
              }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: 700, color: T.quiet }}>
                  Noch {rest} {rest === 1 ? 'weiteres Teil' : 'weitere Teile'} im Shop
                </span>
                <ChevronRight size={12} color={T.quiet} />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export interface W3PartsDockProps {
  gear: Gear | null
  onOpenWorkshop: () => void
  /** Unharvested Service Bonus. Null while unknown, 0 when there is none — and
   *  only a positive figure earns the line. */
  workshopBonus: number | null
  /** The whole catalogue, for the parts the shelf could not fit. */
  onOpenGear?: () => void
  /** Which item is mid-flight, so exactly one row shows a spinner. */
  busyId?: string | null
  onEquip?: (id: string) => void
  onUnequip?: (id: string) => void
  onBuy?: (id: string) => void
}

export default function W3PartsDock({
  gear, onOpenWorkshop, workshopBonus, onOpenGear, busyId = null, onEquip, onUnequip, onBuy,
}: W3PartsDockProps) {
  const reduce = useReducedMotion()
  const slots = Object.entries(gear?.slots ?? {})
  const worn = (gear?.items ?? []).filter((i) => i.equipped)
  const total = worn.reduce((s, i) => s + i.pct, 0)
  // Which socket the rider opened. Null is the resting state — the dock is a
  // panel over a bicycle first and a shop second, so it opens closed.
  const [open, setOpen] = useState<string | null>(null)

  // The open slot's candidates, best offer first: what is on the bike, then
  // what is owned and could go on, then what is for sale and affordable, then
  // the rest. Within a group the bigger bonus leads.
  const openItems = (gear?.items ?? [])
    .filter((i) => i.slot === open)
    .sort((a, b) => {
      const rank = (i: GearItem) => (i.equipped ? 0 : i.owned ? 1 : i.affordable ? 2 : 3)
      return rank(a) - rank(b) || b.pct - a.pct
    })

  const noop = () => {}

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

      {slots.length > 0 && worn.length === 0 && !(gear?.items ?? []).some((i) => i.owned) ? (
        // ── THE FRESH RIDER'S DOCK ──────────────────────────────────────
        // Seven empty sockets with plus signs read as a form the rider failed
        // to fill in — bureaucracy as a first impression. A fresh garage shows
        // ONE thing instead: the cheapest real part, what it pays, and what it
        // costs. An invitation with a number on it, not an empty shelf.
        (() => {
          const first = (gear?.items ?? [])
            .filter((i) => !i.owned && i.price_rc > 0)
            .sort((a, b) => a.price_rc - b.price_rc)[0]
          if (!first) return (
            <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
              Deine Teile erscheinen hier, sobald der Shop geladen hat.
            </span>
          )
          return (
            <button onClick={onOpenGear}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                background: T.tile, border: 0, borderRadius: 18, padding: '12px 14px',
                cursor: 'pointer', fontFamily: FONT,
              }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>
                  DEIN ERSTES TEIL
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>
                  {first.name_de} <span style={{ color: T.acid }}>+{first.pct} %</span>
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, lineHeight: 1.35 }}>
                  {first.why}
                </span>
              </span>
              <span style={{
                flex: 'none', fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                padding: '6px 11px', borderRadius: 100,
                background: first.affordable ? T.acid : T.surface2,
                color: first.affordable ? T.bg : T.quiet,
              }}>{first.price_rc.toLocaleString('de-DE')} RC</span>
            </button>
          )
        })()
      ) : slots.length > 0 ? (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            {slots.map(([slot, label], i) => (
              <Socket key={slot} label={label} delay={0.05 + i * 0.05} reduce={reduce}
                worn={worn.find((w) => w.slot === slot)}
                open={open === slot}
                onTap={() => setOpen((cur) => (cur === slot ? null : slot))} />
            ))}
          </div>
          {/* Tapping the same socket again closes it: the shelf is a drawer,
              and a drawer with no way to shut it is a screen. */}
          <AnimatePresence initial={false}>
            {open != null && (
              <SlotTray key={open} label={gear?.slots[open] ?? ''} items={openItems}
                busyId={busyId} reduce={reduce} onOpenAll={onOpenGear}
                onEquip={onEquip ?? noop} onUnequip={onUnequip ?? noop} onBuy={onBuy ?? noop} />
            )}
          </AnimatePresence>
        </>
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
