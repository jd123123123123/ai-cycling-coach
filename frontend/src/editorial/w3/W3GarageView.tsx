import { motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Store } from 'lucide-react'
import { T, FONT, EASE, Kicker } from './w3tokens'
import { S, luxTile, TNUM } from './w3surfaces'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { W3Coin, W3Price } from './W3Coin'
import { artFit, itemById, type ShopItem } from './w3shop'
import { LIGHT_WASH, type BikeSoul } from './w3BikeSoul'
import W3BikeStage from './W3BikeStage'
import { SLOTS, type PartSlot } from './w3parts'
import W3SlotBrowser, { type W3SlotBrowserVm } from './W3SlotBrowser'
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
  stagePreview?: React.ReactNode
  balance: number | null
  owned: Set<string>
  loadout: Loadout | undefined
  /** Item id being equipped right now. */
  busyId: string | null
  /** What this bike has been through — the light in the room, the road still on
   *  it, and the one honest line about it. Null until the ride feed answers;
   *  the hero then renders unlit rather than inventing a mood. */
  soul: BikeSoul | null
  /** The composed photograph of this exact build, or null — in which case the
   *  hero shows the bike's own catalogue photo, which is the same bike without
   *  its cosmetics rather than a stand-in for one. */
  render: string | null
  /** True while this build is being photographed. */
  rendering?: boolean
  onEquip: (item: ShopItem) => void
  onOpenShop: () => void
  /** The lower half: a slot to browse, and what is in it. Optional so the
   *  preview harnesses — which have no server — still render the garage. */
  slots?: W3SlotBrowserVm
}

const TIER_LABEL = new Map(TIERS.map((t) => [t.tier, t.label]))

export default function W3GarageView({
  stagePreview, balance, owned, loadout, busyId, soul, render, rendering, onEquip, onOpenShop, slots,
}: W3GarageProps) {
  const reduce = useReducedMotion()
  const bike = itemById(loadout?.bike)
  // The bike AS RIDDEN. The composed build when it exists — that photograph is
  // the whole point, because it is the one picture that actually shows what the
  // rider bought — and the bike's own catalogue photo until then.
  const hero = render ?? bike?.art ?? null

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
      {/* FULL BLEED, NOT A CARD. The stage was inset 20px and rounded into a
          `lux` card, so the bike — the subject of the whole screen — sat in a
          box in the middle of it. It now runs edge to edge and the annotation
          hangs below, which is the arrangement the rider asked for twice. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflow: 'hidden' }}>
          {/* The stage. The art is pinned to the box with `inset: 0` rather
              than sized in percentages: a percentage height on a centred grid
              child resolves against the auto row, which the square image had
              already grown to — the bike overflowed its 210px stage by 59px and
              sat on top of its own name. */}
          {/* 232 → 46svh. A fixed 232px stage is a letterbox on a 844px phone
              and a postage stamp on anything taller; the bike should take the
              upper half of the screen on every device. */}
          <div style={{ position: 'relative', height: '46svh', minHeight: 260, overflow: 'hidden' }}>
            {bike && hero ? (
              <motion.div
                // Keyed on the picture, so the composed build cross-fades in
                // when it lands instead of popping.
                key={hero.slice(-40)}
                initial={reduce ? false : { opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.42, ease: EASE }}
                style={{ position: 'absolute', inset: 0 }}
              >
                {/* One stage, shared with the shop and the first-bike screen,
                    so the same bike never looks like two different objects. */}
                {stagePreview ?? <W3BikeStage src={hero} alt={bike.name} rendering={rendering} />}
              </motion.div>
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Noch kein Rad</span>
              </div>
            )}
            {/* ── The light in the room ────────────────────────────────────
                A tint and a vignette keyed to the real hour. The art is a fixed
                studio photograph, so this is the only thing that can make a
                6am garage feel different from a 9pm one — and it is what stops
                the hero being the same dead JPEG every single day. */}
            {soul && (
              <>
                <div aria-hidden style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: LIGHT_WASH[soul.light].tint,
                }} />
                <div aria-hidden style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: `radial-gradient(120% 90% at 50% 42%, transparent 40%, ${T.bg} 140%)`,
                  opacity: LIGHT_WASH[soul.light].vignette,
                }} />
              </>
            )}

            {/* ── The road it is still carrying ────────────────────────────
                Speckle weighted to the bottom, where spray actually lands, at
                an opacity that IS the rider's last week of riding. A bike that
                has not moved gets none of this — the clean bike is the honest
                answer, and the motivating one. */}
            {soul && soul.grime > 0.02 && (
              <div aria-hidden style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                opacity: soul.grime, mixBlendMode: 'multiply',
                // IRREGULAR ON PURPOSE. A tiled dot pattern renders as a visible
                // halftone screen — it read as a printing artefact laid over the
                // photo, not as dirt. Road spray has no period: a few soft blobs
                // at odd positions, weighted to where the wheels throw it.
                background:
                  'radial-gradient(58% 30% at 14% 94%, #4A3F3273, transparent 72%),' +
                  'radial-gradient(44% 24% at 61% 99%, #4A3F3266, transparent 74%),' +
                  'radial-gradient(32% 20% at 88% 90%, #5B4B3A59, transparent 72%),' +
                  'radial-gradient(26% 16% at 37% 86%, #5B4B3A40, transparent 76%),' +
                  'linear-gradient(180deg, transparent 58%, #4A3F324D 100%)',
              }} />
            )}

            {/* The bike art's studio backdrop is light, and the card below it is
                not. This gradient is the join: it fades the bottom of the photo
                into the card so the two read as one lit object rather than a
                photo pasted onto a panel. */}
            <div aria-hidden style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: 88,
              background: `linear-gradient(180deg, transparent, ${T.cardTop})`,
            }} />

            {/* ── The odometer, ON the bike ────────────────────────────────
                Not a stat card beside it: bikes carry their own mileage, and
                putting the number on the object is what turns a catalogue photo
                into the thing you did those kilometres on. */}
            {soul?.km != null && (
              <div style={{
                position: 'absolute', left: S.lg, bottom: S.md,
                display: 'flex', alignItems: 'baseline', gap: 5,
                padding: '5px 10px', borderRadius: 8,
                background: '#0B0B0BA6', border: `1px solid ${T.rule}`,
              }}>
                <span style={{ ...TNUM, fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>
                  {Math.round(soul.km).toLocaleString('de-DE')}
                </span>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>KM</span>
              </div>
            )}
          </div>

          <div style={{ padding: `0 ${S.xl}px ${S.xl}px`, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Kicker>{bike?.tier ? TIER_LABEL.get(bike.tier) ?? 'DEIN RAD' : 'DEIN RAD'}</Kicker>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1.08, color: T.ink }}>
              {bike?.name ?? '—'}
            </span>
            {bike && <span style={{ fontSize: 12.5, fontWeight: 500, color: T.mid }}>{bike.blurb}</span>}
            {soul && (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: soul.stance === 'idle' ? T.warn : T.acid, paddingTop: 2 }}>
                {soul.line}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── What it's wearing ─────────────────────────────────────────────── */}
      {/* Four read-only tiles used to sit here, and a rider who tapped one got
          nothing. The slot is now the control: picking one swaps the half of
          the screen below it for that slot's contents, owned first. */}
      <div style={{ padding: `${S.section}px 0 0`, display: 'flex', flexDirection: 'column', gap: S.md }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1.1, color: T.ink, padding: '0 20px',
        }}>ANGELEGT</span>
        {slots
          ? <W3SlotBrowser vm={slots} />
          : (
            <div style={{ display: 'flex', gap: S.sm, padding: '0 20px' }}>
              {SLOTS.map(({ slot, label }) => (
                <SlotTile key={slot} slot={slot} label={label} loadout={loadout} />
              ))}
            </div>
          )}
      </div>

      {/* ── The collection ────────────────────────────────────────────────── */}
      <div style={{ padding: `${S.section}px 20px 0`, display: 'flex', flexDirection: 'column', gap: S.md }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: S.sm }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, color: T.ink }}>DEINE RÄDER</span>
          <span style={{ ...TNUM, fontSize: 10.5, fontWeight: 600, color: T.quiet }}>
            {ownedBikes.length} {ownedBikes.length === 1 ? 'RAD' : 'RÄDER'}
          </span>
        </div>

        {/* THE PICKER, AS A GRID. It was a vertical list of rows, which reads
            as a settings screen: you scan labels, not machines. A rider with
            several bikes is choosing between OBJECTS, so the object is the
            thing to show — two up, each in its own lit tile, the one being
            ridden ringed in acid. Tapping one mounts it. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.sm }}>
          {ownedBikes.map((b) => {
            const ridden = b.id === loadout?.bike
            return (
              <button key={b.id}
                onClick={ridden ? undefined : () => onEquip(b)}
                disabled={ridden || busyId === b.id}
                style={{
                  ...luxTile(18), flexDirection: 'column', alignItems: 'stretch', gap: S.sm,
                  padding: S.sm, textAlign: 'left', fontFamily: FONT,
                  border: `1px solid ${ridden ? T.acid : 'transparent'}`,
                  cursor: ridden ? 'default' : 'pointer',
                }}>
                {/* The bike's own catalogue photo, not the composed build: this
                    tile is "which bike", and the build belongs to whichever one
                    is being ridden — shown once, in the hero above. */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: 12, background: T.surface2, overflow: 'hidden' }}>
                  <img src={b.art} alt="" loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: artFit(b) }} />
                  {busyId === b.id && (
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#00000080' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.acid }}>WIRD GEHOLT …</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 4px 4px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {TIER_LABEL.get(b.tier ?? 'starter') ?? ''}
                    </span>
                    <span style={{
                      flex: 'none', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9,
                      color: ridden ? T.acid : T.quiet,
                      background: ridden ? T.acidDim : T.surface2,
                      padding: '4px 8px', borderRadius: 100,
                    }}>{ridden ? 'GEFAHREN' : 'AUFSTEIGEN'}</span>
                  </div>
                </div>
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
