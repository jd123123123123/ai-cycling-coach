import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check, Loader2, MapPin } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { S, luxTile, TNUM } from './w3surfaces'
import { W3Price } from './W3Coin'
import { gearArt, type GearItem } from '../../api/gear'
import type { Backdrop, Place } from '../../api/garage'

/**
 * The garage's lower half: pick a slot up top, browse that slot down here.
 *
 * ONE ORDER, EVERY SLOT: what you own first, what you could own after. A shop
 * that opens on things you cannot have makes the garage feel like a storefront;
 * a wardrobe that hides the shop makes the currency pointless. Owned-then-buyable
 * is the order that reads as "here is your stuff, and here is what's next".
 *
 * BACKGROUNDS ARE A SLOT LIKE ANY OTHER, and that is the point of putting them
 * here rather than on their own screen. A rider choosing tyres and a rider
 * choosing where their bike stands are doing the same thing — dressing the
 * machine — and the only real difference is that a place has a second gate money
 * cannot open. That difference shows up as a different button, not a different
 * screen.
 *
 * NOTHING IS HIDDEN FOR BEING UNAFFORDABLE. An item you cannot buy yet is a
 * reason to ride, so it is drawn at full contrast with its price and simply does
 * not respond. The one thing drawn differently is a place with no stamp: it has
 * no price at all, because it is not for sale.
 */

export type SlotId = string
export const STAGE_SLOT = '__stage__'

export interface W3SlotBrowserVm {
  slots: { id: SlotId; label: string }[]
  gear: GearItem[]
  places: Place[]
  backdrops: Backdrop[]
  balance: number | null
  busyId: string | null
  onBuyGear: (id: string) => void
  onEquipGear: (id: string) => void
  onBuyPlace: (slug: string) => void
  onSelectStage: (id: string) => void
}

function Row({ art, name, note, right, dim, onClick }: {
  art?: string
  name: string
  note: string
  right: React.ReactNode
  dim?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        ...luxTile(16), flexDirection: 'row', alignItems: 'center', gap: S.md,
        padding: S.md, width: '100%', textAlign: 'left', fontFamily: FONT, border: 0,
        cursor: onClick ? 'pointer' : 'default', opacity: dim ? 0.55 : 1,
      }}
    >
      <div style={{
        flex: 'none', width: 54, height: 54, borderRadius: 12,
        background: T.surface2, overflow: 'hidden', display: 'grid', placeItems: 'center',
      }}>
        {art
          ? <img src={art} alt="" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <MapPin size={20} color={T.quiet} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{
          fontSize: 13.5, fontWeight: 700, color: T.ink,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</span>
        <span style={{ fontSize: 11, color: T.mid, lineHeight: 1.35 }}>{note}</span>
      </div>
      <div style={{ flex: 'none' }}>{right}</div>
    </button>
  )
}

function Tag({ children, tone = 'quiet' }: { children: React.ReactNode; tone?: 'acid' | 'quiet' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 12px',
      borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
      background: tone === 'acid' ? T.acidDim : T.surface2,
      color: tone === 'acid' ? T.acid : T.quiet,
    }}>{children}</span>
  )
}

export default function W3SlotBrowser({ vm }: { vm: W3SlotBrowserVm }) {
  const reduce = useReducedMotion()
  const [slot, setSlot] = useState<SlotId>(vm.slots[0]?.id ?? STAGE_SLOT)

  const isStage = slot === STAGE_SLOT
  const gearHere = vm.gear.filter((g) => g.slot === slot)
  const ownedGear = gearHere.filter((g) => g.owned)
  const shopGear = gearHere.filter((g) => !g.owned)
  const ownedPlaces = vm.places.filter((p) => p.owned)
  const shopPlaces = vm.places.filter((p) => !p.owned)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
      {/* ── the slot rail ── */}
      <div style={{
        display: 'flex', gap: S.sm, overflowX: 'auto', padding: '2px 20px',
        scrollbarWidth: 'none',
      }}>
        {[...vm.slots, { id: STAGE_SLOT, label: 'HINTERGRUND' }].map((s) => {
          const on = s.id === slot
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSlot(s.id)}
              style={{
                flex: 'none', height: 34, padding: '0 16px', borderRadius: 100, border: 0,
                fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                background: on ? T.acid : T.surface, color: on ? T.heroInk : T.mid,
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={slot}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: EASE }}
          style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: S.lg }}
        >
          {/* ── what the rider owns ── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, color: T.ink }}>
              DEINS
            </span>

            {isStage ? (
              ownedPlaces.length + vm.backdrops.filter((b) => b.unlocked).length === 0 ? (
                <p style={{ fontSize: 12, color: T.quiet, margin: 0 }}>Noch nichts hier.</p>
              ) : (
                <>
                  {vm.backdrops.filter((b) => b.unlocked).map((b) => (
                    <Row
                      key={b.id} name={b.name_de} note="Freigefahren"
                      onClick={b.selected ? undefined : () => vm.onSelectStage(b.id)}
                      right={b.selected ? <Tag tone="acid"><Check size={12} /> AKTIV</Tag> : <Tag>WÄHLEN</Tag>}
                    />
                  ))}
                  {ownedPlaces.map((p) => (
                    <Row
                      key={p.slug} art={p.plate_url ?? undefined} name={p.name}
                      note={p.rides === 1 ? '1 × gefahren' : `${p.rides} × gefahren`}
                      onClick={p.selected ? undefined : () => vm.onSelectStage(p.slug)}
                      right={p.selected ? <Tag tone="acid"><Check size={12} /> AKTIV</Tag> : <Tag>WÄHLEN</Tag>}
                    />
                  ))}
                </>
              )
            ) : ownedGear.length === 0 ? (
              <p style={{ fontSize: 12, color: T.quiet, margin: 0 }}>
                Noch nichts in diesem Slot — unten steht, was es gibt.
              </p>
            ) : (
              ownedGear.map((g) => (
                <Row
                  key={g.id} art={gearArt(g.id)} name={g.name_de} note={g.why}
                  onClick={g.equipped ? undefined : () => vm.onEquipGear(g.id)}
                  right={
                    g.equipped
                      ? <Tag tone="acid"><Check size={12} /> ANGELEGT</Tag>
                      : vm.busyId === g.id
                        ? <Loader2 size={16} className="w3-spin" color={T.quiet} />
                        : <Tag>ANLEGEN</Tag>
                  }
                />
              ))
            )}
          </section>

          {/* ── what it would take ── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, color: T.ink }}>
                ZU HABEN
              </span>
              {vm.balance != null && (
                <span style={{ ...TNUM, fontSize: 11, color: T.quiet }}>
                  <W3Price amount={vm.balance} size={11} muted />
                </span>
              )}
            </div>

            {isStage ? (
              shopPlaces.length === 0 ? (
                <p style={{ fontSize: 12, color: T.quiet, margin: 0 }}>
                  Die Karte wächst, wenn Fahrer:innen unterwegs sind.
                </p>
              ) : (
                shopPlaces.map((p) => (
                  <Row
                    key={p.slug} art={p.plate_url ?? undefined} name={p.name}
                    dim={!p.stamped}
                    note={p.stamped
                      ? (p.rides === 1 ? '1 × gefahren' : `${p.rides} × gefahren`)
                      : 'Da warst du noch nicht'}
                    // A place without a stamp has NO price: it is not for sale,
                    // and pricing it would say the opposite.
                    onClick={p.stamped ? () => vm.onBuyPlace(p.slug) : undefined}
                    right={p.stamped
                      ? (vm.busyId === p.slug
                          ? <Loader2 size={16} className="w3-spin" color={T.quiet} />
                          : <W3Price amount={p.price_rc} size={13} />)
                      : <Tag><MapPin size={12} /> FAHR HIN</Tag>}
                  />
                ))
              )
            ) : shopGear.length === 0 ? (
              <p style={{ fontSize: 12, color: T.quiet, margin: 0 }}>
                Alles aus diesem Slot gehört dir.
              </p>
            ) : (
              shopGear.map((g) => (
                <Row
                  key={g.id} art={gearArt(g.id)} name={g.name_de} note={g.why}
                  dim={!g.affordable}
                  onClick={g.affordable ? () => vm.onBuyGear(g.id) : undefined}
                  right={vm.busyId === g.id
                    ? <Loader2 size={16} className="w3-spin" color={T.quiet} />
                    : <W3Price amount={g.price_rc} size={13} muted={!g.affordable} />}
                />
              ))
            )}
          </section>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
