import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, Loader2, MapPin } from 'lucide-react'
import { T, FONT, EASE, Kicker } from './w3tokens'
import { S, lux, hairline, TNUM } from './w3surfaces'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { W3Price } from './W3Coin'
import type { Backdrop, Place } from '../../api/garage'

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
}

function PlateFrame({ url, name, dim }: { url: string | null; name: string; dim: boolean }) {
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
          color: T.quiet, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        }}>
          NOCH KEIN BILD
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
      <PlateFrame url={place.plate_url} name={place.name} dim={locked} />

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

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, fontFamily: FONT }}>
      <W3StatusBar />

      <div style={{ padding: `0 ${S.xl}px ${S.xxl}px` }}>
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

        <p style={{ fontSize: 12, color: T.mid, lineHeight: 1.5, margin: `0 0 ${S.xl}px` }}>
          Jeder Ort hier wurde von jemandem erfahren. Wo du selbst warst, kannst du kaufen —
          und dein Rad steht dann dort.
        </p>

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

        {/* The hand-written stages: earned by what the rider DID, never bought,
            so they are a separate list with no prices anywhere in it. */}
        <Kicker>KULISSEN</Kicker>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm, marginTop: S.md }}>
          {p.backdrops.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => { if (b.unlocked && !b.selected) p.onSelect(b.id) }}
              disabled={!b.unlocked || b.selected}
              style={{
                ...lux(16), padding: `${S.md}px ${S.lg}px`, border: 0, textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: S.md, fontFamily: FONT,
                cursor: b.unlocked && !b.selected ? 'pointer' : 'default',
                opacity: b.unlocked ? 1 : 0.55,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{b.name_de}</span>
                <span style={{ fontSize: 11, color: b.unlocked ? T.mid : T.quiet }}>
                  {b.unlocked ? 'Freigefahren' : b.unlock_de}
                </span>
              </div>
              {b.selected && <Check size={16} color={T.acid} />}
            </button>
          ))}
        </div>
      </div>

      <W3TabBar />
    </div>
  )
}
