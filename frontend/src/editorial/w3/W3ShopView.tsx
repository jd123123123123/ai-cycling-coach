import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import { T, FONT, Kicker } from './w3tokens'
import { S, lux, luxTile, hairline, TNUM } from './w3surfaces'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { W3Coin, W3Price } from './W3Coin'
import { artFit, bikesByTier, partsBySlot, isEquipped, itemById, type ShopItem } from './w3shop'
import type { Loadout } from '../../api/shop'

/**
 * W3 · SHOP — the RideCoin sink.
 *
 * Pure presentation: `W3ShopPage` owns the wallet, the ownership list and the
 * two mutations. Every price and every piece of art here is static and shipped
 * with the app, so the whole catalogue browses with no network at all; the only
 * per-rider facts on screen are the balance, what's owned, and what's worn.
 *
 * WHAT IS DELIBERATELY NOT HERE. The pen's shop frame (`jFMwp`) also shows a
 * second currency, real-money top-ups, per-bike SPEED/AERO/COMFORT ratings,
 * "owned by 4% of riders", level gates and season countdowns. None of those
 * exist in the economy: there is one currency, it is earned by riding, and a
 * bike has a price and a blurb and nothing else. Inventing a SPEED number for a
 * bike would be exactly the fabricated data the app refuses everywhere else, so
 * the shop shows what is real and stays quiet about the rest.
 *
 * THE ONE HONEST NUMBER A SHOP OWES YOU is what you'll have left. "Guthaben
 * danach" is on the buy button's own sheet, because the moment a rider is about
 * to spend is the moment that number matters and the only moment it is free to
 * compute.
 */

export type ShopTab = 'bikes' | 'parts'

export interface W3ShopProps {
  balance: number | null
  owned: Set<string>
  loadout: Loadout | undefined
  /** Item id currently being bought/equipped — drives the spinner. */
  busyId: string | null
  /** A failed purchase, already turned into a rider-facing sentence. */
  error: string | null
  onBuy: (item: ShopItem) => void
  onEquip: (item: ShopItem) => void
  onBack: () => void
  onDismissError: () => void
}

const nf = new Intl.NumberFormat('de-DE')

/** The state an item is in for THIS rider — one derivation, so a tile, the
 *  sheet and the CTA can never disagree about whether something is affordable. */
export type ItemState = 'equipped' | 'owned' | 'affordable' | 'tooExpensive'

// eslint-disable-next-line react-refresh/only-export-components -- pure derivation, exported so it can be tested directly
export function stateOf(item: ShopItem, owned: Set<string>, loadout: Loadout | undefined, balance: number | null): ItemState {
  if (isEquipped(loadout, item)) return 'equipped'
  if (owned.has(item.id)) return 'owned'
  if (balance != null && balance >= item.price) return 'affordable'
  return 'tooExpensive'
}

// ── One row in the catalogue ────────────────────────────────────────────────
function ItemRow({ item, state, busy, onOpen }: {
  item: ShopItem; state: ItemState; busy: boolean; onOpen: () => void
}) {
  const lit = state === 'equipped'
  return (
    <button
      onClick={onOpen}
      style={{
        ...luxTile(18),
        flexDirection: 'row', alignItems: 'center', gap: S.md,
        padding: S.md, width: '100%', textAlign: 'left', cursor: 'pointer',
        border: `1px solid ${lit ? T.acid : 'transparent'}`,
        fontFamily: FONT,
      }}
    >
      {/* Art. `contain` because a bike and a saddle have wildly different
          aspect ratios and cropping either one loses the thing being sold. */}
      <div style={{
        flex: 'none', width: 76, height: 56, borderRadius: 12, background: T.surface2,
        display: 'grid', placeItems: 'center', overflow: 'hidden',
      }}>
        <img src={item.art} alt="" loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: artFit(item) }} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </span>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.mid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.blurb}
        </span>
      </div>

      <div style={{ flex: 'none', display: 'flex', alignItems: 'center' }}>
        {busy ? <Loader2 size={16} color={T.mid} className="w3-spin" />
          : state === 'equipped' ? <Chip label="ANGELEGT" acid />
          : state === 'owned' ? <Chip label="IM BESITZ" />
          : item.price === 0 ? <Chip label="GRATIS" acid />
          : <W3Price amount={item.price} size={15} muted={state === 'tooExpensive'} />}
      </div>
    </button>
  )
}

function Chip({ label, acid = false }: { label: string; acid?: boolean }) {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9,
      color: acid ? T.acid : T.quiet,
      background: acid ? T.acidDim : T.surface2,
      padding: '5px 9px', borderRadius: 100, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── The detail sheet ────────────────────────────────────────────────────────
// A full-screen overlay rather than the pen's separate ITEM route: the decision
// to spend belongs next to the list it was made from, and an overlay keeps the
// rider's place in a 25-item ladder instead of restoring scroll on the way back.
function ItemSheet({ item, state, balance, busy, onBuy, onEquip, onClose }: {
  item: ShopItem; state: ItemState
  balance: number | null; busy: boolean
  onBuy: () => void; onEquip: () => void; onClose: () => void
}) {
  const reduce = useReducedMotion()
  const after = balance != null ? balance - item.price : null
  const short = balance != null ? item.price - balance : null

  // Escape closes, and the list behind stops scrolling while the sheet is up.
  // Without the scroll lock a drag on the sheet scrolls the catalogue
  // underneath it, so dismissing lands the rider somewhere they never were.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: T.bg,
        display: 'flex', flexDirection: 'column', fontFamily: FONT,
        maxWidth: 390, margin: '0 auto',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Hero */}
        <div style={{ position: 'relative', width: '100%', height: 300, background: T.surface, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          <img src={item.art} alt={item.name}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: artFit(item) }} />
          {/* Bought parts are seen ON the bike in the garage, where the build is
              photographed. Faking that here would mean composing a picture for
              something the rider has not bought — an image-model call per browse
              rather than per build, which is the one thing this cache exists to
              avoid. So the shop sells the object and the garage shows the bike. */}
          {item.kind === 'part' && (
            <span style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, whiteSpace: 'nowrap',
              color: T.quiet, background: T.sheet, padding: '5px 10px', borderRadius: 100,
            }}>AN DEINEM RAD ZU SEHEN, SOBALD ES ANGELEGT IST</span>
          )}
          <button onClick={onClose} aria-label="Schließen"
            style={{ position: 'absolute', top: 14, left: 14, width: 36, height: 36, borderRadius: 100, background: '#00000080', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <X size={18} color={T.ink} />
          </button>
        </div>

        <div style={{ padding: `${S.xl}px 20px 0`, display: 'flex', flexDirection: 'column', gap: S.md }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Kicker>{item.kind === 'bike' ? 'RAD' : 'TEIL'}</Kicker>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1.06, color: T.ink }}>{item.name}</span>
            <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{item.blurb}</span>
          </div>

          {/* The receipt. Only shown when there is something to pay — an owned
              item has no arithmetic worth printing. */}
          {(state === 'affordable' || state === 'tooExpensive') && (
            <div style={{ ...lux(18), padding: S.lg, gap: S.sm }}>
              <Line label="Preis" value={item.price} />
              <div style={hairline()} />
              <Line label="Dein Guthaben" value={balance} />
              {after != null && after >= 0 && (
                <>
                  <div style={hairline()} />
                  <Line label="Guthaben danach" value={after} strong />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <div style={{ flex: 'none', padding: `${S.lg}px 20px calc(${S.xl}px + env(safe-area-inset-bottom))`, borderTop: `1px solid ${T.rule}`, display: 'flex', flexDirection: 'column', gap: S.sm }}>
        {state === 'equipped' ? (
          <Cta disabled label="ANGELEGT" icon={<Check size={17} color={T.bg} />} />
        ) : state === 'owned' ? (
          <Cta onClick={onEquip} busy={busy} label="ANLEGEN" />
        ) : state === 'affordable' ? (
          <Cta onClick={onBuy} busy={busy} label={`KAUFEN FÜR ${nf.format(item.price)}`} coin />
        ) : (
          <>
            <Cta disabled label={`DIR FEHLEN ${nf.format(short ?? 0)}`} coin muted />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, textAlign: 'center' }}>
              RideCoin verdienst du beim Fahren — 1 RC pro TSS.
            </span>
          </>
        )}
      </div>
    </motion.div>
  )
}

function Line({ label, value, strong = false }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.md }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: strong ? T.ink : T.mid }}>{label}</span>
      {value == null
        ? <span style={{ ...TNUM, fontSize: 14, fontWeight: 700, color: T.quiet }}>—</span>
        : <W3Price amount={value} size={16} color={strong ? T.acid : T.ink} />}
    </div>
  )
}

function Cta({ label, onClick, busy = false, disabled = false, coin = false, muted = false, icon }: {
  label: string; onClick?: () => void; busy?: boolean; disabled?: boolean
  coin?: boolean; muted?: boolean; icon?: React.ReactNode
}) {
  const dead = disabled || busy
  return (
    <button
      onClick={dead ? undefined : onClick}
      disabled={dead}
      style={{
        width: '100%', height: 54, borderRadius: 100, border: 0,
        background: muted || disabled ? T.surface2 : T.acid,
        color: muted || disabled ? T.quiet : T.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: S.sm,
        fontFamily: FONT, fontSize: 13.5, fontWeight: 700, letterSpacing: 0.6,
        cursor: dead ? 'default' : 'pointer',
      }}
    >
      {busy ? <Loader2 size={18} color={T.bg} className="w3-spin" /> : (
        <>
          {icon}
          {/* `dark` on the live acid button, muted on the grey one. */}
          {coin && <W3Coin size={18} muted={muted || disabled} tone="dark" />}
          <span>{label}</span>
        </>
      )}
    </button>
  )
}

// ── The screen ──────────────────────────────────────────────────────────────
export default function W3ShopView({
  balance, owned, loadout, busyId, error, onBuy, onEquip, onBack, onDismissError,
}: W3ShopProps) {
  const [tab, setTab] = useState<ShopTab>('bikes')
  const [openId, setOpenId] = useState<string | null>(null)

  // The catalogue is static, so these are computed once per tab rather than on
  // every render — the sheet's busy/error transitions were re-walking all 50
  // entries and rebuilding both group arrays each time.
  const groups = useMemo(() => (tab === 'bikes'
    ? bikesByTier().map((g) => ({ key: g.tier as string, label: g.label, note: g.note, items: g.items }))
    : partsBySlot().map((g) => ({ key: g.slot as string, label: g.label, note: g.note, items: g.items }))
  ), [tab])

  const open = useMemo(() => (openId ? itemById(openId) : null), [openId])

  return (
    <div className="w3-frame" style={{ fontFamily: FONT, background: T.bg, color: T.ink, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <W3StatusBar />

      {/* Header — the balance is the single most important number on a shop
          screen, so it sits in the header on every scroll position. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.md, padding: `10px 20px ${S.lg}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S.md, minWidth: 0 }}>
          <button onClick={onBack} aria-label="Zurück"
            style={{ flex: 'none', width: 36, height: 36, borderRadius: 100, background: T.surface2, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={18} color={T.ink} />
          </button>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Shop</span>
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 100, background: T.surface2 }}>
          {balance == null
            ? <><W3Coin size={16} muted /><span style={{ ...TNUM, fontSize: 14, fontWeight: 700, color: T.quiet }}>—</span></>
            : <W3Price amount={balance} size={16} />}
        </div>
      </div>

      {/* Segmented control */}
      <div style={{ padding: '0 20px', display: 'flex', gap: S.sm }}>
        {([['bikes', 'RÄDER'], ['parts', 'TEILE']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              flex: 1, height: 40, borderRadius: 100, border: 0, cursor: 'pointer', fontFamily: FONT,
              fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8,
              background: tab === k ? T.acid : T.surface2,
              color: tab === k ? T.bg : T.mid,
            }}>{label}</button>
        ))}
      </div>

      {error && (
        <div style={{ margin: `${S.lg}px 20px 0`, padding: S.md, borderRadius: 14, background: T.surface2, display: 'flex', alignItems: 'center', gap: S.sm }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.warn }}>{error}</span>
          <button onClick={onDismissError} aria-label="Schließen" style={{ background: 'transparent', border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X size={15} color={T.quiet} />
          </button>
        </div>
      )}

      {/* Catalogue */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.xxl, padding: `${S.xl}px 20px 0` }}>
        {groups.map((g) => (
          <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: S.sm }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, color: T.ink }}>{g.label}</span>
              <span style={{ flex: 1, fontSize: 10.5, fontWeight: 600, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.note}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
              {g.items.map((item) => (
                <ItemRow key={item.id} item={item}
                  state={stateOf(item, owned, loadout, balance)}
                  busy={busyId === item.id}
                  onOpen={() => setOpenId(item.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <W3TabBar />

      <AnimatePresence>
        {open && (
          <ItemSheet
            key={open.id}
            item={open}
            state={stateOf(open, owned, loadout, balance)}

            balance={balance}
            busy={busyId === open.id}
            onBuy={() => onBuy(open)}
            onEquip={() => onEquip(open)}
            onClose={() => setOpenId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
