import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Asterisk, Check, Lock } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { gearArt, type Gear, type GearItem, type GearRarity } from '../../api/gear'

/**
 * W3 · GARAGE — the gear shop, as a grid of objects.
 *
 * BUILT AS PICTURES, NOT A LIST. The reference shop grid (pen frames, "Select
 * bike") is square product renders on soft pastel grounds with the caption
 * BELOW the tile, and that shape is doing real work: the object is the thing
 * being chosen, so the object gets the space. A row of names with numbers
 * beside them is a spreadsheet of the same information and nobody browses it
 * twice.
 *
 * Every state a tile can be in is carried VISUALLY before it is carried in
 * text — equipped is a lime frame and a tick, owned is a quiet full-colour
 * tile, unaffordable is desaturated behind a lock, and rarity is the colour of
 * the ground the object is standing on. A rider can read the whole grid without
 * reading a single word.
 *
 * THE LOADOUT RAIL is the other half. Five slots, always visible, each showing
 * the object worn in it or an empty socket. It exists because "one item per
 * slot" is the rule that makes the whole economy a decision, and a rule the
 * rider cannot see is a rule they will experience only as a surprise.
 *
 * Pure function of props; `W3GearPanel` owns the fetch and the mutations.
 */

const nf = (n: number) => n.toLocaleString('de-DE')

/** Rarity → the accent it is drawn in. Matches the tinted grounds the art was
 *  generated on (`scripts/generate_gear_art.py`), so the frame and the
 *  photograph inside it agree. */
const RARITY_HUE: Record<GearRarity, string> = {
  common: T.rareCommon,
  rare: T.rareRare,
  legendary: T.acid,
}
const RARITY_DE: Record<GearRarity, string> = {
  common: 'STANDARD',
  rare: 'SELTEN',
  legendary: 'LEGENDÄR',
}

// ── the loadout rail ────────────────────────────────────────────────────────
function LoadoutRail({ gear, slotOrder, onPick }: {
  gear: Gear
  slotOrder: string[]
  onPick: (slot: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
      {slotOrder.map((slot) => {
        const worn = gear.items.find((i) => i.slot === slot && i.equipped)
        return (
          <button key={slot} onClick={() => onPick(slot)}
            aria-label={gear.slots[slot]}
            style={{
              flex: 1, minWidth: 0, border: 0, padding: 0, cursor: 'pointer',
              background: 'transparent', fontFamily: FONT,
              display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center',
            }}>
            <div style={{
              width: '100%', aspectRatio: '1', borderRadius: 14, overflow: 'hidden',
              background: worn ? T.heroChip : T.heroDock,
              border: worn ? `1.5px solid ${T.acid}` : `1.5px dashed ${T.heroOff}`,
              display: 'grid', placeItems: 'center',
            }}>
              {worn
                ? <img src={gearArt(worn.id)} alt={worn.name_de}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <span style={{ fontSize: 18, color: T.heroOff, fontWeight: 300 }}>+</span>}
            </div>
            <span style={{
              fontSize: 7.5, fontWeight: 700, letterSpacing: 0.6, color: worn ? T.acid : T.quiet,
              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{gear.slots[slot]}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── one tile ────────────────────────────────────────────────────────────────
function Tile({ item, busy, onTap }: { item: GearItem; busy: boolean; onTap: () => void }) {
  const hue = RARITY_HUE[item.rarity]
  const locked = !item.owned && !item.affordable

  return (
    <button onClick={onTap} disabled={busy}
      style={{
        border: 0, padding: 0, background: 'transparent', cursor: busy ? 'default' : 'pointer',
        fontFamily: FONT, textAlign: 'left', display: 'flex', flexDirection: 'column',
        gap: 7, minWidth: 0, opacity: busy ? 0.6 : 1,
      }}>
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '1',
        borderRadius: 16, overflow: 'hidden', background: T.heroDock,
        // Equipped is the loudest thing on the grid: a full lime frame.
        border: item.equipped ? `2px solid ${T.acid}` : `1px solid ${T.rule}`,
      }}>
        <img src={gearArt(item.id)} alt=""
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            // Locked items are desaturated rather than hidden — a goal you can
            // see is worth riding toward; one you cannot is not a goal.
            filter: locked ? 'grayscale(1) brightness(0.55)' : 'none',
          }} />

        {/* Rarity, as a colour on the tile itself rather than a word under it. */}
        <span style={{
          position: 'absolute', top: 8, left: 8, height: 18, padding: '0 7px',
          borderRadius: 100, background: '#00000066', backdropFilter: 'blur(6px)',
          display: 'grid', placeItems: 'center',
          fontSize: 7, fontWeight: 800, letterSpacing: 0.9, color: hue,
        }}>{RARITY_DE[item.rarity]}</span>

        {/* The bonus, big, on the art. It is the reason to want the thing. */}
        <span style={{
          position: 'absolute', top: 8, right: 8, height: 20, padding: '0 8px',
          borderRadius: 100, background: '#00000073', backdropFilter: 'blur(6px)',
          display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 800, color: T.ink,
        }}>+{item.pct}%</span>

        {item.equipped && (
          <span style={{
            position: 'absolute', bottom: 8, right: 8, width: 24, height: 24,
            borderRadius: 100, background: T.acid, display: 'grid', placeItems: 'center',
          }}>
            <Check size={14} color={T.heroInk} strokeWidth={3} />
          </span>
        )}
        {locked && (
          <span style={{
            position: 'absolute', bottom: 8, right: 8, width: 24, height: 24,
            borderRadius: 100, background: '#00000099', display: 'grid', placeItems: 'center',
          }}>
            <Lock size={12} color={T.mid} />
          </span>
        )}
      </div>

      {/* Caption BELOW the tile, never over the art — the reference's own rule,
          and what keeps the object readable at this size. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, padding: '0 2px' }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: T.ink,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name_de}</span>
        {item.owned ? (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: item.equipped ? T.acid : T.quiet }}>
            {item.equipped ? 'GETRAGEN' : 'IM BESITZ'}
          </span>
        ) : (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 10.5, fontWeight: 700, color: item.affordable ? T.ink : T.quiet,
            fontVariantNumeric: 'tabular-nums',
          }}>
            <Asterisk size={10} color={item.affordable ? T.lilac : T.quiet} />
            {nf(item.price_rc)}
          </span>
        )}
      </div>
    </button>
  )
}

// ── the detail sheet ────────────────────────────────────────────────────────
/** Where the words live. Deliberately behind a tap: the grid is for browsing by
 *  eye, and the rule + flavour are what you read once you have picked something
 *  out. Putting them on every tile would turn the grid back into a list. */
function Sheet({ item, busy, onBuy, onEquip, onUnequip, onClose }: {
  item: GearItem
  busy: boolean
  onBuy: () => void
  onEquip: () => void
  onUnequip: () => void
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const hue = RARITY_HUE[item.rarity]

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: '#000000C4',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center', fontFamily: FONT,
    }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.36, ease: EASE }}
        style={{
          width: '100%', maxWidth: 390, background: T.heroBg,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: `14px 20px calc(24px + env(safe-area-inset-bottom))`,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
        <span style={{ width: 40, height: 4, borderRadius: 100, background: T.heroOff, alignSelf: 'center' }} />

        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <img src={gearArt(item.id)} alt=""
            style={{ width: 92, height: 92, borderRadius: 16, objectFit: 'cover', flex: 'none' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 1, color: hue }}>
              {RARITY_DE[item.rarity]} · {item.slot_label}
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>
              {item.name_de}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
              height: 24, padding: '0 10px', borderRadius: 100, background: T.acidDim,
              fontSize: 12, fontWeight: 800, color: T.acid,
            }}>+{item.pct}%</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: T.ink }}>
            {item.why}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 400, lineHeight: 1.5, color: T.mid, fontStyle: 'italic' }}>
            {item.flavour_de}
          </span>
        </div>

        {item.owned ? (
          <button onClick={item.equipped ? onUnequip : onEquip} disabled={busy}
            style={{
              width: '100%', height: 52, borderRadius: 100, border: 0, cursor: 'pointer',
              background: item.equipped ? T.heroChip : T.acid,
              color: item.equipped ? T.ink : T.heroInk,
              fontFamily: FONT, fontSize: 15, fontWeight: 700, opacity: busy ? 0.6 : 1,
            }}>
            {item.equipped ? 'Ablegen' : 'Anlegen'}
          </button>
        ) : (
          <button onClick={onBuy} disabled={busy || !item.affordable}
            style={{
              width: '100%', height: 52, borderRadius: 100, border: 0,
              cursor: item.affordable ? 'pointer' : 'default',
              background: item.affordable ? T.acid : T.heroDock,
              color: item.affordable ? T.heroInk : T.quiet,
              fontFamily: FONT, fontSize: 15, fontWeight: 700, opacity: busy ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
            <Asterisk size={16} color={item.affordable ? T.heroInk : T.quiet} />
            {item.affordable ? `Für ${nf(item.price_rc)} kaufen` : `${nf(item.price_rc)} — noch nicht genug`}
          </button>
        )}

        {/* Only when it matters. A rider who can afford it does not need to be
            told what things cost. */}
        {!item.owned && !item.affordable && (
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet, textAlign: 'center' }}>
            Fahr weiter — oder hol dir den Bonus aus der Werkstatt.
          </span>
        )}
      </motion.div>
    </div>
  )
}

export interface W3GearProps {
  gear: Gear | null
  loading: boolean
  busyId: string | null
  onBuy: (id: string) => void
  onEquip: (id: string) => void
  onUnequip: (id: string) => void
}

export default function W3Gear({ gear, loading, busyId, onBuy, onEquip, onUnequip }: W3GearProps) {
  const [slot, setSlot] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const slotOrder = useMemo(() => Object.keys(gear?.slots ?? {}), [gear])
  const shown = useMemo(
    () => (gear?.items ?? []).filter((i) => slot === null || i.slot === slot),
    [gear, slot],
  )
  const open = gear?.items.find((i) => i.id === openId) ?? null

  if (loading || !gear) {
    return (
      <div style={{ padding: '0 20px 26px' }}>
        <div style={{ background: T.heroDock, borderRadius: 20, height: 220 }} />
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 18,
      padding: '0 20px 26px', fontFamily: FONT, background: T.heroBg,
    }}>
      <LoadoutRail gear={gear} slotOrder={slotOrder}
        onPick={(s) => setSlot((cur) => (cur === s ? null : s))} />

      {/* Slot filter. "ALLE" first, so the default is the full grid. */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
        {[null, ...slotOrder].map((s) => {
          const active = slot === s
          return (
            <button key={s ?? 'all'} onClick={() => setSlot(s)}
              style={{
                flex: 'none', height: 32, padding: '0 14px', borderRadius: 100, border: 0,
                cursor: 'pointer', fontFamily: FONT, fontSize: 11, fontWeight: 700,
                letterSpacing: 0.6,
                background: active ? T.acid : T.heroChip,
                color: active ? T.heroInk : T.mid,
              }}>
              {s === null ? 'ALLE' : gear.slots[s]}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {shown.map((item) => (
          <Tile key={item.id} item={item} busy={busyId === item.id}
            onTap={() => setOpenId(item.id)} />
        ))}
      </div>

      {open && (
        <Sheet item={open} busy={busyId === open.id}
          onBuy={() => onBuy(open.id)}
          onEquip={() => onEquip(open.id)}
          onUnequip={() => onUnequip(open.id)}
          onClose={() => setOpenId(null)} />
      )}
    </div>
  )
}
