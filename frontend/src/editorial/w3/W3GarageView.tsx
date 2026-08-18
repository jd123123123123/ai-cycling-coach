import { motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Store } from 'lucide-react'
import { T, FONT, EASE, Kicker } from './w3tokens'
import { S, lux, luxTile, TNUM } from './w3surfaces'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { W3Coin, W3Price } from './W3Coin'
import { artFit, itemById, type ShopItem } from './w3shop'
import { SLOTS, type PartSlot } from './w3parts'
import { TIERS } from './w3bikes'
import type { Loadout } from '../../api/shop'

/**
 * W3 · GARAGE — the bike you ride, and everything you own.
 *
 * This screen REPLACED the photo-upload studio on the GARAGE tab. The studio
 * asked a rider to photograph their real bike and paid an image model to
 * restyle it, which made the bike a fixed possession: nothing to earn, nothing
 * to spend RideCoin on, and a paid render sitting on the critical path of
 * onboarding. The ladder inverts all three — the bike is the progression, the
 * shop is the sink the economy was missing, and the art is static so a swap is
 * instant and free. That argument is `w3bikes.ts`'s own header; this screen is
 * where it finally reaches the rider.
 *
 * Everyone lands here already owning something: the server grants the free
 * starter bike on first read, so the garage is never an empty room with a
 * "buy something" sign. The starter is deliberately a rust bucket — a first
 * bike you want to replace is a better hook than a neutral one you don't mind.
 */

export interface W3GarageProps {
  balance: number | null
  owned: Set<string>
  loadout: Loadout | undefined
  /** Item id being equipped right now. */
  busyId: string | null
  onEquip: (item: ShopItem) => void
  onOpenShop: () => void
}

const TIER_LABEL = new Map(TIERS.map((t) => [t.tier, t.label]))

export default function W3GarageView({ balance, owned, loadout, busyId, onEquip, onOpenShop }: W3GarageProps) {
  const reduce = useReducedMotion()
  const bike = itemById(loadout?.bike)

  // Owned bikes, cheapest first — the ladder read as a collection. The one
  // being ridden is pulled out into the hero, so it isn't repeated here.
  const ownedBikes = [...owned]
    .map((id) => itemById(id))
    .filter((i): i is ShopItem => i != null && i.kind === 'bike')
    .sort((a, b) => a.price - b.price)

  return (
    <div className="w3-frame" style={{ fontFamily: FONT, background: T.bg, color: T.ink, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <W3StatusBar />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.md, padding: `10px 20px ${S.lg}px` }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.7, color: T.ink }}>Garage</span>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 100, background: T.surface2 }}>
          {balance == null
            ? <><W3Coin size={16} muted /><span style={{ ...TNUM, fontSize: 14, fontWeight: 700, color: T.quiet }}>—</span></>
            : <W3Price amount={balance} size={16} />}
        </div>
      </div>

      {/* ── The bike you ride ──────────────────────────────────────────────
          A spotlit stage rather than a card on a card: the bike is the subject
          of this screen and everything else is annotation. */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...lux(26), overflow: 'hidden' }}>
          {/* The stage. The art is pinned to the box with `inset: 0` rather
              than sized in percentages: a percentage height on a centred grid
              child resolves against the auto row, which the square image had
              already grown to — the bike overflowed its 210px stage by 59px and
              sat on top of its own name. */}
          <div style={{ position: 'relative', height: 232, overflow: 'hidden' }}>
            {bike ? (
              <motion.img
                key={bike.id}
                src={bike.art}
                alt={bike.name}
                initial={reduce ? false : { opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: EASE }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: artFit(bike) }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Noch kein Rad</span>
              </div>
            )}
            {/* The bike art's studio backdrop is light, and the card below it is
                not. This gradient is the join: it fades the bottom of the photo
                into the card so the two read as one lit object rather than a
                photo pasted onto a panel. */}
            <div aria-hidden style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: 88,
              background: `linear-gradient(180deg, transparent, ${T.cardTop})`,
            }} />
          </div>

          <div style={{ padding: `0 ${S.xl}px ${S.xl}px`, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Kicker>{bike?.tier ? TIER_LABEL.get(bike.tier) ?? 'DEIN RAD' : 'DEIN RAD'}</Kicker>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1.08, color: T.ink }}>
              {bike?.name ?? '—'}
            </span>
            {bike && <span style={{ fontSize: 12.5, fontWeight: 500, color: T.mid }}>{bike.blurb}</span>}
          </div>
        </div>
      </div>

      {/* ── What it's wearing ─────────────────────────────────────────────── */}
      <div style={{ padding: `${S.section}px 20px 0`, display: 'flex', flexDirection: 'column', gap: S.md }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, color: T.ink }}>ANGELEGT</span>
        <div style={{ display: 'flex', gap: S.sm }}>
          {SLOTS.map(({ slot, label }) => (
            <SlotTile key={slot} slot={slot} label={label} loadout={loadout} />
          ))}
        </div>
      </div>

      {/* ── The collection ────────────────────────────────────────────────── */}
      <div style={{ padding: `${S.section}px 20px 0`, display: 'flex', flexDirection: 'column', gap: S.md }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: S.sm }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, color: T.ink }}>DEINE RÄDER</span>
          <span style={{ ...TNUM, fontSize: 10.5, fontWeight: 600, color: T.quiet }}>
            {ownedBikes.length} {ownedBikes.length === 1 ? 'RAD' : 'RÄDER'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
          {ownedBikes.map((b) => {
            const ridden = b.id === loadout?.bike
            return (
              <button key={b.id}
                onClick={ridden ? undefined : () => onEquip(b)}
                disabled={ridden || busyId === b.id}
                style={{
                  ...luxTile(18), flexDirection: 'row', alignItems: 'center', gap: S.md,
                  padding: S.md, width: '100%', textAlign: 'left', fontFamily: FONT,
                  border: `1px solid ${ridden ? T.acid : 'transparent'}`,
                  cursor: ridden ? 'default' : 'pointer',
                }}>
                <div style={{ flex: 'none', width: 68, height: 50, borderRadius: 11, background: T.surface2, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                  <img src={b.art} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: artFit(b) }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: T.quiet }}>
                    {TIER_LABEL.get(b.tier ?? 'starter') ?? ''}
                  </span>
                </div>
                <span style={{
                  flex: 'none', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9,
                  color: ridden ? T.acid : T.quiet,
                  background: ridden ? T.acidDim : T.surface2,
                  padding: '5px 9px', borderRadius: 100,
                }}>{ridden ? 'GEFAHREN' : 'AUFSTEIGEN'}</span>
              </button>
            )
          })}
        </div>

        {/* To the shop */}
        <button onClick={onOpenShop}
          style={{
            ...luxTile(18), flexDirection: 'row', alignItems: 'center', gap: S.md,
            padding: `${S.lg}px ${S.md}px`, width: '100%', textAlign: 'left',
            fontFamily: FONT, cursor: 'pointer', border: `1px solid ${T.rule}`,
          }}>
          <div style={{ flex: 'none', width: 40, height: 40, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}>
            <Store size={19} color={T.acid} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Zum Shop</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: T.mid }}>Räder und Teile für deine RideCoin.</span>
          </div>
          <ChevronRight size={18} color={T.quiet} />
        </button>
      </div>

      <W3TabBar />
    </div>
  )
}

/** One of the four cosmetic slots. A slot the rider has never bought into shows
 *  "Serie" — the bike's own stock part — rather than a pretend upgrade. */
function SlotTile({ slot, label, loadout }: { slot: PartSlot; label: string; loadout: Loadout | undefined }) {
  const worn = itemById(loadout?.[slot])
  return (
    <div style={{ ...luxTile(14), flex: 1, minWidth: 0, padding: S.sm, gap: 6, alignItems: 'center' }}>
      <div style={{ width: '100%', height: 38, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {worn
          ? <img src={worn.art} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: artFit(worn) }} />
          : <span style={{ fontSize: 15, fontWeight: 700, color: T.d2 }}>—</span>}
      </div>
      <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.7, color: T.quiet, textAlign: 'center' }}>{label}</span>
      <span style={{
        fontSize: 9, fontWeight: 600, color: worn ? T.mid : T.quiet, textAlign: 'center',
        width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{worn?.name ?? 'Serie'}</span>
    </div>
  )
}
