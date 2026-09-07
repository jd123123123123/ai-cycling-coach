import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Lock } from 'lucide-react'
import { useGarageCollection, useBuyItem, useEquipItem } from '../../hooks/useShop'
import { bikesByTier, partsBySlot, equippedInSlot, artFit, type ShopItem } from './w3shop'
import { T, FONT, DASH, band, Kicker } from './w3tokens'
import { S, lux, TNUM } from './w3surfaces'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import W3Loading from './W3Loading'
import W3LoadError from './W3LoadError'
import './w3.css'

/**
 * W3 · THE BIKE SHOP — the ladder, and the only place RideCoin leaves the
 * economy in any quantity.
 *
 * WHY THIS SCREEN DID NOT EXIST, WHICH IS THE WHOLE POINT. Everything it needs
 * was already built and shipped: 26 bikes with prices in `w3bikes.ts`, the
 * server's drift-guarded mirror in `w3catalog.py`, `shop.purchase` debiting
 * through `rewards.spend`, and `useBuyItem` wired to `POST /shop/buy/{id}` —
 * with ZERO callers. The catalogue described itself in its own source as "the
 * sink the economy was missing", and a rider could not reach a single item in
 * it. `/e/w3-shop` redirected to the parts wall; the garage's "Zum Shop" card
 * did the same.
 *
 * So riders earned RideCoin from every ride, watched the balance climb, and had
 * nothing to spend it on. That is the shape of an economy that stops meaning
 * anything after a fortnight.
 *
 * THE PRICE IS THE SERVER'S. `purchase` looks every price up in its own
 * catalogue and ignores what the client believes — so the numbers here are a
 * display of the ladder, never an input to it. A tile that says 4 500 and a
 * server that says 15 000 is a bug in the mirror, and `TestCatalogDrift` fails
 * the build before it can ship.
 *
 * THE LADDER IS SHOWN WHOLE, INCLUDING WHAT IS OUT OF REACH. A shop that hides
 * everything unaffordable answers "what can I buy" and never "what am I riding
 * towards", and the second question is the one that brings somebody back. Out
 * of reach is drawn dimmed with its price and the gap to it, not hidden.
 */

const CARD_H = 132

type Status = 'worn' | 'owned' | 'affordable' | 'locked'

function statusOf(item: ShopItem, owned: Set<string>, worn: string | null, balance: number): Status {
  if (item.id === worn) return 'worn'
  if (owned.has(item.id)) return 'owned'
  return balance >= item.price ? 'affordable' : 'locked'
}

const nf = new Intl.NumberFormat('de-DE')

function BikeTile({ item, status, busy, onBuy, onWear }: {
  item: ShopItem
  status: Status
  busy: boolean
  onBuy: () => void
  onWear: () => void
}) {
  const reduce = useReducedMotion()
  const locked = status === 'locked'
  return (
    <div style={{
      ...lux(22), padding: 0, overflow: 'hidden', minWidth: 0,
      opacity: locked ? 0.55 : 1,
    }}>
      <div style={{ position: 'relative', width: '100%', height: CARD_H, background: T.tile, overflow: 'hidden' }}>
        <motion.img
          src={item.art} alt=""
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: artFit(item),
            // The ladder's art carries its own light-grey studio backdrop, so a
            // bike tile bleeds to its edges; a part would be `contain`ed. That
            // difference is `artFit`'s whole job — see `w3shop`.
            filter: locked ? 'grayscale(0.7)' : 'none',
          }} />
        {status === 'worn' && (
          <span style={{
            position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 100, background: T.acid,
            fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.bg,
          }}>
            <Check size={10} color={T.bg} />ANGELEGT
          </span>
        )}
      </div>

      <div style={{ padding: `${S.md}px ${S.lg - 4}px ${S.lg - 4}px`, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{
          fontSize: 13.5, fontWeight: 600, letterSpacing: -0.2, color: T.ink,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name}</span>
        <span style={{
          fontSize: 10.5, fontWeight: 500, color: T.quiet, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.blurb}</span>

        <div style={{ marginTop: 7 }}>
          {status === 'worn' ? (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: T.acid }}>Dein Rad</span>
          ) : status === 'owned' ? (
            <button type="button" onClick={onWear} disabled={busy}
              style={{
                width: '100%', height: 32, borderRadius: 100, border: 0, cursor: busy ? 'default' : 'pointer',
                background: T.surface2, color: T.ink, fontFamily: FONT,
                fontSize: 11, fontWeight: 600, opacity: busy ? 0.6 : 1,
              }}>{busy ? '…' : 'Aufsteigen'}</button>
          ) : status === 'affordable' ? (
            <button type="button" onClick={onBuy} disabled={busy}
              style={{
                width: '100%', height: 32, borderRadius: 100, border: 0, cursor: busy ? 'default' : 'pointer',
                background: T.acid, color: T.bg, fontFamily: FONT,
                fontSize: 11, fontWeight: 600, opacity: busy ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
              {busy ? '…' : <><span style={{ ...TNUM }}>{nf.format(item.price)}</span><span style={{ fontSize: 10 }}>RC</span></>}
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: T.quiet }}>
              <Lock size={11} color={T.quiet} />
              <span style={{ ...TNUM }}>{nf.format(item.price)}</span> RC
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function W3BikeShop() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch, isFetching } = useGarageCollection()
  const buy = useBuyItem()
  const wear = useEquipItem()
  const [busyId, setBusyId] = useState<string | null>(null)

  const balance = data?.balance ?? 0
  const owned = useMemo(() => new Set(data?.owned ?? []), [data])
  const worn = data?.loadout.bike ?? null
  const tiers = useMemo(() => bikesByTier(), [])
  const partSlots = useMemo(() => partsBySlot(), [])

  // The cheapest thing not yet owned — what the balance is actually working
  // towards, which is the one number that makes a balance mean anything.
  const nextUp = useMemo(() => {
    const all = tiers.flatMap((t) => t.items)
    return all
      .filter((b) => b.price > 0 && !owned.has(b.id) && b.price > balance)
      .sort((a, b) => a.price - b.price)[0] ?? null
  }, [tiers, owned, balance])

  if (isLoading && !data) return <W3Loading label="Die Halle öffnet…" />
  if (isError && !data) {
    return (
      <W3LoadError
        title="Der Shop lädt nicht"
        detail="Wir konnten den Katalog gerade nicht abrufen. Dein Guthaben ist sicher — das ist nur die Verbindung."
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    )
  }

  const run = (m: { mutate: (id: string, o: object) => void }) => (id: string) => {
    setBusyId(id)
    m.mutate(id, { onSettled: () => setBusyId(null) })
  }

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, background: T.bg, minHeight: '100dvh', paddingBottom: 120 }}>
        <W3StatusBar />
        <W3TopBar title="Shop" onBack={() => navigate('/e/w3-garage')} />

        {/* The balance, and what it is for. A number on its own is a score; a
            number with the next rung under it is a reason to ride. */}
        <div style={{ ...band(S.lg) }}>
          <div style={{ ...lux(26), padding: S.xl, gap: 6 }}>
            <Kicker>Dein Guthaben</Kicker>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ ...TNUM, fontSize: 40, fontWeight: 600, letterSpacing: -1.4, color: T.acid, lineHeight: 1 }}>
                {nf.format(balance)}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>RC</span>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet, lineHeight: 1.4 }}>
              {nextUp
                ? `Noch ${nf.format(nextUp.price - balance)} RC bis „${nextUp.name}“.`
                : 'Du kannst dir hier alles leisten.'}
            </span>
          </div>
        </div>

        {tiers.map((t) => (
          <div key={t.tier} style={{ ...band(S.lg), gap: S.md }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Kicker>{t.label}</Kicker>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>{t.note}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.md }}>
              {t.items.map((item) => (
                <BikeTile
                  key={item.id}
                  item={item}
                  status={statusOf(item, owned, worn, balance)}
                  busy={busyId === item.id}
                  onBuy={() => run(buy)(item.id)}
                  onWear={() => run(wear)(item.id)} />
              ))}
            </div>
          </div>
        ))}

        {/* ── TEILE — the mid-price sink between 600-RC gear and the bike
            ladder. 24 priced cosmetics with generated art that NO screen
            rendered until now: a catalogue the rider could not reach was a
            sink the economy did not have. Same buy/wear verbs, per slot;
            "worn" is what the loadout's slot column actually points at. */}
        {partSlots.map((sl) => (
          <div key={sl.slot} style={{ ...band(S.lg), gap: S.md }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Kicker>{sl.label}</Kicker>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>{sl.note}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.md }}>
              {sl.items.map((item) => (
                <BikeTile
                  key={item.id}
                  item={item}
                  status={statusOf(item, owned, equippedInSlot(data?.loadout, sl.slot), balance)}
                  busy={busyId === item.id}
                  onBuy={() => run(buy)(item.id)}
                  onWear={() => run(wear)(item.id)} />
              ))}
            </div>
          </div>
        ))}

        {/* The starter bike is granted, never sold — so if the catalogue ever
            ships an empty ladder the screen says so rather than rendering a
            heading over nothing. */}
        {tiers.length === 0 && (
          <div style={{ ...band(S.lg) }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: T.quiet }}>
              Der Katalog ist gerade leer. {DASH}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
