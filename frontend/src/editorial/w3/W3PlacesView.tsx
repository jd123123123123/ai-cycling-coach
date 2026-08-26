import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, Loader2, Lock, MapPin } from 'lucide-react'
import { T, FONT, EASE, Kicker } from './w3tokens'
import { S, lux, hairline, TNUM } from './w3surfaces'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { W3Price } from './W3Coin'
import type { Backdrop, Place } from '../../api/garage'
import { backdropArt } from './w3backdropArt'

/**
 * W3 · ORTE — the places riders have been, and the one RideCoin sink that is
 * about where you went rather than what you bolted on.
 *
 * TWO GATES, DRAWN AS TWO DIFFERENT THINGS, because they are not the same kind
 * of refusal and a shop that blurs them teaches the wrong lesson:
 *
 *   · NO STAMP — the rider has not ridden there. Shown as a locked plate with
 *     the place still named and still pictured. There is no price on it,
 *     because a price implies it is for sale and it is not: the only way in is
 *     to go. This is the half that makes the gallery worth scrolling when you
 *     own nothing.
 *   · NO COINS — they have been, and cannot afford it yet. Shown priced, with
 *     the button live and the balance visible, because that IS a shop.
 *
 * WHY LOCKED PLACES ARE SHOWN AT ALL. The catalogue is global: it grows as the
 * app's riders go places. A rider scrolling past a pass they have never climbed
 * is being told what is out there, not being sold something — and "someone
 * found this" is the most honest reason a place exists in a list.
 *
 * A PLACE WITHOUT A PICTURE IS STILL A PLACE. The shared plate is rendered once
 * for everybody, and a place discovered minutes ago may not have one yet. That
 * state is drawn as itself — the name over an empty frame — rather than hidden,
 * because hiding it would make the gallery lie about what the app knows.
 */

export interface W3PlacesProps {
  balance: number | null
  places: Place[]
  backdrops: Backdrop[]
  selected: string
  /** Buying, for this slug. */
  busySlug: string | null
  onBuy: (slug: string) => void
  onSelect: (id: string) => void
  onBack: () => void
  /** Rendered INSIDE the shop rather than as its own screen: no status bar, no
   *  back arrow, no page title, no balance — the shop already carries all four,
   *  and a second set of them halfway down a scroll reads as two apps stacked.
   *  See `W3GearScreen`, where this now lives. */
  embedded?: boolean
  /** What the last purchase failed with. Null when nothing has failed. */
  error?: string | null
}

function PlateFrame({ url, name, dim, mine }: {
  url: string | null; name: string; dim: boolean
  /** A place this rider has ridden or owns — its picture is being made now. */
  mine: boolean
}) {
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 16,
      overflow: 'hidden', ...hairline(), background: T.tile,
    }}>
      {url ? (
        <img
          src={url}
          alt={name}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            // A place the rider cannot have yet is shown dimmed rather than
            // blurred or padlocked: they should be able to see exactly what
            // they would be riding for.
            filter: dim ? 'grayscale(0.7) brightness(0.55)' : 'none',
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          padding: 10, textAlign: 'center',
          color: T.quiet, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, lineHeight: 1.5,
        }}>
          {/* A black square with NOCH KEIN BILD on it reads as a broken card.
              For the rider's OWN places it is also wrong: opening this screen
              queues exactly those first (`api/garage.py::get_backdrops`), so
              the picture is genuinely on its way and saying so is the truth. */}
          {mine ? 'BILD WIRD ERSTELLT' : 'NOCH KEIN BILD'}
        </div>
      )}
    </div>
  )
}

function PlaceCard({ place, busy, onBuy, onSelect }: {
  place: Place
  busy: boolean
  onBuy: (slug: string) => void
  onSelect: (id: string) => void
}) {
  const locked = !place.stamped && !place.owned

  return (
    <div style={{ ...lux(20), padding: S.md, display: 'flex', flexDirection: 'column', gap: S.sm }}>
      <PlateFrame url={place.plate_url} name={place.name} dim={locked} mine={!locked} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>
          {place.name}
        </span>
        {/* The stamp, stated as a fact about the rider rather than as a badge:
            how many times they have been is the thing they earned. */}
        <span style={{ fontSize: 11, color: locked ? T.quiet : T.mid, ...TNUM }}>
          {locked
            ? 'Noch nicht gefahren'
            : place.rides === 1 ? '1 × gefahren' : `${place.rides} × gefahren`}
        </span>
      </div>

      {place.owned ? (
        <button
          type="button"
          onClick={() => onSelect(place.slug)}
          disabled={place.selected}
          style={{
            height: 36, borderRadius: 100, border: 0, fontFamily: FONT, fontSize: 12,
            fontWeight: 700, letterSpacing: 0.4, cursor: place.selected ? 'default' : 'pointer',
            background: place.selected ? T.acidDim : T.surface2,
            color: place.selected ? T.acid : T.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {place.selected ? <><Check size={14} /> AKTIV</> : 'HIERHIN STELLEN'}
        </button>
      ) : locked ? (
        // No price. It is not for sale; it is somewhere to ride.
        <div style={{
          height: 36, borderRadius: 100, background: T.surface2, display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: T.quiet,
        }}>
          <MapPin size={13} /> FAHR HIN
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onBuy(place.slug)}
          disabled={busy}
          style={{
            height: 36, borderRadius: 100, border: 0, background: T.acid, color: T.heroInk,
            fontFamily: FONT, fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
            cursor: busy ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {busy
            ? <Loader2 size={14} className="w3-spin" />
            : <W3Price amount={place.price_rc} size={13} />}
        </button>
      )}
    </div>
  )
}

export default function W3PlacesView(p: W3PlacesProps) {
  const reduce = useReducedMotion()
  const stamped = p.places.filter((x) => x.stamped || x.owned)
  const rest = p.places.filter((x) => !x.stamped && !x.owned)
  const embedded = p.embedded === true

  return (
    <div style={embedded
      ? { fontFamily: FONT }
      : { minHeight: '100dvh', background: T.bg, fontFamily: FONT }}>
      {!embedded && <W3StatusBar />}

      {/* EMBEDDED STILL NEEDS ITS GUTTER. This was `0` on the theory that the
          shop supplies the inset — it does not: `W3Gear` pads itself, so the
          places half ran edge to edge under a grid that did not. A list of
          full-width rows hid it; a grid of tiles cut off at the right does not. */}
      <div style={{ padding: embedded ? `0 ${S.xl}px ${S.xl}px` : `0 ${S.xl}px ${S.xxl}px` }}>
        {!embedded && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: S.md, height: 52,
          }}>
            <button
              type="button" onClick={p.onBack} aria-label="Zurück"
              style={{
                width: 36, height: 36, borderRadius: 100, border: 0, background: T.surface,
                display: 'grid', placeItems: 'center', cursor: 'pointer', color: T.ink,
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.ink, margin: 0, letterSpacing: -0.3 }}>
              Orte
            </h1>
            <div style={{ marginLeft: 'auto' }}>
              {p.balance != null && <W3Price amount={p.balance} size={14} />}
            </div>
          </div>
        )}

        <p style={{ fontSize: 12, color: T.mid, lineHeight: 1.5, margin: `0 0 ${S.xl}px` }}>
          Jeder Ort hier wurde von jemandem erfahren. Wo du selbst warst, kannst du kaufen —
          und dein Rad steht dann dort.
        </p>

        {/* A refused purchase used to clear the spinner and say nothing at all,
            which is the one failure a rider is most likely to hit. */}
        {p.error && (
          <p style={{
            fontSize: 12, fontWeight: 600, color: T.warn, lineHeight: 1.45,
            margin: `0 0 ${S.md}px`,
          }}>{p.error}</p>
        )}

        {stamped.length > 0 && (
          <>
            <Kicker>DEINE ORTE</Kicker>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.md,
              margin: `${S.md}px 0 ${S.section}px`,
            }}>
              {stamped.map((place, i) => (
                <motion.div
                  key={place.slug}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: Math.min(i, 6) * 0.04 }}
                >
                  <PlaceCard
                    place={place} busy={p.busySlug === place.slug}
                    onBuy={p.onBuy} onSelect={p.onSelect}
                  />
                </motion.div>
              ))}
            </div>
          </>
        )}

        <Kicker>{stamped.length > 0 ? 'NOCH NICHT GEFAHREN' : 'AUF DER KARTE'}</Kicker>
        {rest.length === 0 ? (
          <p style={{ fontSize: 12, color: T.quiet, margin: `${S.md}px 0 0` }}>
            Noch keine weiteren Orte. Die Karte wächst, wenn Fahrer:innen unterwegs sind.
          </p>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.md,
            margin: `${S.md}px 0 ${S.section}px`,
          }}>
            {rest.map((place) => (
              <PlaceCard
                key={place.slug} place={place} busy={false}
                onBuy={p.onBuy} onSelect={p.onSelect}
              />
            ))}
          </div>
        )}

        {/* ── KULISSEN: THE ROOMS, SHOWN AS ROOMS ─────────────────────────
            This was a list of NAMES — "Passhöhe", "Küstenstraße" — with the
            unlock rule underneath and a tick on the current one. Choosing where
            your bike stands from a text list is not choosing: nothing on the
            row told a rider what they were picking, so the only way to see a
            room was to select it and go and look.

            They are tiles now, in the same shape and the same three states as
            the parts grid one section above — selected, owned, locked with what
            it takes. The art is drawn (`w3backdropArt`), not fetched: the
            places half of this screen already inlines a plate per row and is
            the heaviest read in the app, and repeating that here would cost a
            hundred kilobytes to show ten gradients.

            Earned, never bought — so there is no price anywhere in this grid,
            and the locked tiles say what to ride rather than what to pay. */}
        {/* The anchor the garage's Kulisse row jumps to. */}
        <div id="kulissen" style={{ scrollMarginTop: 74 }} />
        <Kicker>KULISSEN</Kicker>
        <span style={{ display: 'block', marginTop: 4, fontSize: 11, fontWeight: 500, color: T.quiet }}>
          Wo dein Rad steht. Freigefahren, nicht gekauft.
        </span>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.sm, marginTop: S.md,
        }}>
          {p.backdrops.map((b) => {
            const art = backdropArt(b.id)
            const pickable = b.unlocked && !b.selected
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => { if (pickable) p.onSelect(b.id) }}
                disabled={!pickable}
                aria-label={b.name_de}
                style={{
                  ...lux(16), padding: 0, border: 0, overflow: 'hidden', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', fontFamily: FONT,
                  cursor: pickable ? 'pointer' : 'default',
                  outline: b.selected ? `2px solid ${T.acid}` : 'none', outlineOffset: -2,
                }}
              >
                <div style={{
                  position: 'relative', width: '100%', aspectRatio: '16 / 10',
                  background: art.css,
                  // A room the rider has not opened is dimmed rather than
                  // hidden: the picture is the argument for going and riding it.
                  filter: b.unlocked ? 'none' : 'grayscale(0.7) brightness(0.55)',
                }}>
                  {b.selected && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8, width: 22, height: 22,
                      borderRadius: 100, background: T.acid, display: 'grid', placeItems: 'center',
                    }}>
                      <Check size={13} color={T.bg} strokeWidth={3} />
                    </span>
                  )}
                  {!b.unlocked && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8, width: 22, height: 22,
                      borderRadius: 100, background: T.glass, display: 'grid', placeItems: 'center',
                      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                    }}>
                      <Lock size={11} color={T.ink} />
                    </span>
                  )}
                </div>
                <div style={{ padding: `${S.sm}px ${S.md}px ${S.md}px`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name_de}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, lineHeight: 1.3,
                    color: b.selected ? T.acid : b.unlocked ? T.quiet : T.mid,
                  }}>
                    {b.selected ? 'Ausgewählt' : b.unlocked ? art.mood : b.unlock_de}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <W3TabBar />
    </div>
  )
}
