import { motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Lock, MapPin, Package, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Workshop, WorkshopComponent } from '../../api/workshop'
import { STAGE_THEMES, FLOOR } from './w3stageThemes'
import { T, FONT, EASE, band, Kicker, DASH } from './w3tokens'
import { hairline, lux, luxTile, TNUM } from './w3surfaces'
import { backdropArt } from './w3backdropArt'

/**
 * W3 · THE GARAGE, BELOW THE FOLD — rebuilt as a room worth walking into.
 *
 * WHAT THE OLD LANE WAS, and why every persona bounced off it: five identical
 * grey list rows at equal weight (the audited "tool drawer" disease). A rider
 * arrived holding RideCoin and the lane never said what it buys, what is next,
 * or why any of it matters to their riding. Zero reward signal in the one room
 * of the app that IS the reward.
 *
 * WHAT IT IS NOW — four differently-shaped chapters, every number real:
 *
 *  01 GUTHABEN   the balance as the hero numeral, and the NEXT UNLOCK under it
 *                with the house segment meter — a goal gradient, not a menu.
 *                "Noch 450 RC · etwa 5 Fahrten" converts coins into the unit
 *                the rider actually spends: rides.
 *  02 ZUSTAND    the bike's life as the mechanic's instruments: the chain-life
 *                bar, the banked Service-Bonus, the measured watts a dirty
 *                chain costs, and the one value sentence that links
 *                maintenance to earning (+12 % on a fresh drivetrain).
 *  03 SAMMLUNG   the 26-bike ladder AS A SHELF — owned lit, the active one
 *                ringed, the rest priced or waiting. The collection was hidden
 *                behind a text row saying "Räder"; a collection you cannot see
 *                is not a collection.
 *  04 BÜHNE      how the room looks: backdrop swatches, the Kulisse, and the
 *                photo/collection switch — one chapter, because they are one
 *                decision about the same picture.
 *
 * The honesty contract holds everywhere: no invented numbers, absences say so,
 * and acid is spent once per chapter — the numeral, the meter, the ring.
 */

/** Only what is actually asking for attention. Dormant parts (a bike put away
 *  for the winter) and parts we have never been told about are not jobs. */
function due(w: Workshop | null): WorkshopComponent[] {
  return (w?.components ?? [])
    .filter((c) => !c.dormant && (c.status === 'due' || c.status === 'overdue'))
    .sort((a, b) => (a.status === 'overdue' ? -1 : 1) - (b.status === 'overdue' ? -1 : 1))
}

/** The elapsed figure in the unit its own clock is measured in. */
function elapsed(c: WorkshopComponent): string | null {
  if (c.clock === 'days') return c.days_since == null ? null : `seit ${c.days_since} Tagen`
  return `seit ${Math.round(c.km_since).toLocaleString('de-DE')} km`
}

const nf = new Intl.NumberFormat('de-DE')

/** The house segment meter: 22 lit steps, the next one brighter — the same
 *  near-miss instrument the Wins dock uses. */
function SegMeter({ frac, hue = T.acid }: { frac: number; hue?: string }) {
  const SEGS = 22
  const filled = Math.max(0, Math.min(SEGS, Math.round(frac * SEGS)))
  return (
    <div style={{ display: 'flex', gap: 3, height: 10, width: '100%', alignItems: 'center' }} aria-hidden>
      {Array.from({ length: SEGS }).map((_, i) => (
        <span key={i} style={{
          flex: 1, borderRadius: 2,
          height: i <= filled ? 10 : 5,
          background: i < filled
            ? `linear-gradient(180deg, ${hue} 0%, ${hue}D9 100%)`
            : i === filled ? `${hue}55` : T.d1,
          boxShadow: i < filled ? `inset 0 1px 0 ${T.ink}40, 0 0 7px ${hue}40` : 'none',
        }} />
      ))}
    </div>
  )
}

function Row({ icon: Icon, title, note, right, onClick, accent }: {
  icon: LucideIcon
  title: string
  note: string | null
  right?: string | null
  onClick: () => void
  accent?: string
}) {
  const hue = accent ?? T.ink
  return (
    <button onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 13,
        padding: '13px 15px', border: 0, cursor: 'pointer', fontFamily: FONT,
        background: T.tile, borderRadius: 18, textAlign: 'left',
      }}>
      <span style={{
        width: 34, height: 34, borderRadius: 100, flex: 'none', display: 'grid', placeItems: 'center',
        background: accent ? T.acidDim : T.surface2,
      }}>
        <Icon size={16} color={hue} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {note && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note}</span>}
      </span>
      {right && <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: hue }}>{right}</span>}
      <ChevronRight size={15} color={T.quiet} style={{ flex: 'none' }} />
    </button>
  )
}

/** The current room, as its own art, one tap from the picker. */
function StageRow({ id, name, onOpen }: { id: string; name: string; onOpen: () => void }) {
  const art = backdropArt(id)
  return (
    <button onClick={onOpen}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 13,
        padding: '13px 15px', border: 0, cursor: 'pointer', fontFamily: FONT,
        background: T.tile, borderRadius: 18, textAlign: 'left',
      }}>
      <span style={{
        ...hairline(),
        width: 46, height: 34, borderRadius: 9, flex: 'none',
        background: art.css,
      }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Kulisse</span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </span>
      <ChevronRight size={15} color={T.quiet} style={{ flex: 'none' }} />
    </button>
  )
}

/** A plain maps link, on purpose — the maps app resolves "nearby" better than
 *  any coordinate we could cache, and it costs no permission prompt. */
const REPAIR_SEARCH = 'https://www.google.com/maps/search/Fahrradwerkstatt+in+der+N%C3%A4he/'

/** One rung of the collection shelf. */
export interface W3ShelfBike {
  id: string
  name: string
  price: number
  art: string
  owned: boolean
  active: boolean
}

export interface W3GarageLaneProps {
  workshop: Workshop | null
  onOpenWorkshop: () => void
  onOpenGear: () => void
  onOpenShop: () => void
  /** The BIKE ladder — the economy's only large sink. */
  onOpenBikes: () => void
  /** The room the bike is standing in right now, and its name. */
  stage: { id: string; name: string } | null
  onOpenStages: () => void
  stageBike?: {
    value: 'photo' | 'collection'
    busy: boolean
    onSet: (v: 'photo' | 'collection') => void
  } | null
  stageTheme?: {
    value: string
    busy: boolean
    onSet: (id: string) => void
  } | null

  // ── the reward layer, finally IN the room ─────────────────────────────
  /** RideCoin balance. Null while the wallet is unanswered → the numeral
   *  dashes rather than claiming a zero. */
  balance?: number | null
  /** RC credited today, from real ledger lines. Null/0 → no chip. */
  earnedToday?: number | null
  /** The cheapest thing the rider does not own yet, across gear and bikes. */
  nextUnlock?: { name: string; price: number; kind: 'gear' | 'bike' } | null
  /** Mean RC of the rider's actual ride-earn ledger lines, or null before the
   *  first earning ride — the honest divisor for "etwa N Fahrten". */
  avgEarnPerRide?: number | null
  /** Sum of equipped gear percentages — what the loadout pays on a matching
   *  ride. Null/0 → the sentence is an invitation instead. */
  equippedBonusPct?: number | null
  /** The bike ladder for the shelf, in catalogue order. */
  bikes?: W3ShelfBike[]
}

export default function W3GarageLane(p: W3GarageLaneProps) {
  const reduce = useReducedMotion()
  const jobs = due(p.workshop)
  const bonus = p.workshop?.total_bonus_rc ?? null
  const chain = p.workshop?.chain_life ?? null

  // ── 01 · the goal gradient ────────────────────────────────────────────
  const bal = p.balance ?? null
  const next = p.nextUnlock ?? null
  const toGo = next && bal != null ? Math.max(0, next.price - bal) : null
  const affordable = next != null && bal != null && bal >= next.price
  const ridesToGo = toGo != null && toGo > 0 && p.avgEarnPerRide && p.avgEarnPerRide > 0
    ? Math.max(1, Math.ceil(toGo / p.avgEarnPerRide))
    : null

  const ownedBikes = (p.bikes ?? []).filter((b) => b.owned).length

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{ display: 'flex', flexDirection: 'column', paddingTop: 26, background: T.bg }}>

      {/* ── the opening: what this room IS, in one breath ── */}
      <div style={{ ...band(22) }}>
        <Kicker>Garage</Kicker>
        <h1 style={{
          margin: '6px 0 0', fontFamily: FONT, fontSize: 38, fontWeight: 700,
          letterSpacing: -1.4, lineHeight: 1.05, color: T.ink,
        }}>
          Verdient ist<br /><span style={{ color: T.acid }}>deins.</span>
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: T.mid, maxWidth: 320 }}>
          Jede Fahrt zahlt RideCoin. Hier steht, was du damit machst — und was dein Rad davon hat.
        </p>
      </div>

      {/* ── 01 · GUTHABEN & NÄCHSTES ZIEL ── */}
      <div style={{ ...band(18) }}>
        <div style={{ ...lux(28), padding: '22px 20px 20px', gap: 16, position: 'relative', overflow: 'hidden' }}>
          {/* The chapter's own light: one soft acid pool behind the numeral —
              a lit instrument, not a wallpaper glow. */}
          <span aria-hidden style={{
            position: 'absolute', left: -40, top: -60, width: 240, height: 200,
            background: `radial-gradient(closest-side, ${T.acid}14, transparent)`,
            pointerEvents: 'none',
          }} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Kicker>01 — Dein Guthaben</Kicker>
            {(p.earnedToday ?? 0) > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: T.acid,
                padding: '3px 9px', borderRadius: 100, background: T.acidDim, ...TNUM,
              }}>+{nf.format(p.earnedToday as number)} heute</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <span style={{
              ...TNUM, fontSize: 56, fontWeight: 700, letterSpacing: -2.4, lineHeight: 0.88,
              color: T.acid, textShadow: `0 0 24px ${T.acid}33`,
            }}>{bal != null ? nf.format(bal) : DASH}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.quiet }}>RC</span>
          </div>

          {next && bal != null && (
            <div style={{ ...luxTile(18), padding: '13px 14px 12px', gap: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>NÄCHSTES ZIEL</span>
                <span style={{ ...TNUM, fontSize: 11, fontWeight: 700, color: T.mid }}>{nf.format(next.price)} RC</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{next.name}</span>
              <SegMeter frac={next.price > 0 ? Math.min(1, bal / next.price) : 1} />
              <span style={{ fontSize: 11, fontWeight: 600, color: affordable ? T.acid : T.quiet, ...TNUM }}>
                {affordable
                  ? 'Du kannst es dir leisten — hol es dir.'
                  : ridesToGo != null
                    ? `Noch ${nf.format(toGo as number)} RC · etwa ${ridesToGo} ${ridesToGo === 1 ? 'Fahrt' : 'Fahrten'}`
                    : `Noch ${nf.format(toGo ?? next.price)} RC — jede Fahrt zahlt ~1 RC pro TSS.`}
              </span>
            </div>
          )}

          <button onClick={next?.kind === 'bike' ? p.onOpenBikes : p.onOpenGear}
            style={{
              height: 46, borderRadius: 100, border: 0, cursor: 'pointer', fontFamily: FONT,
              background: affordable ? T.acid : T.tile,
              color: affordable ? T.bg : T.ink, fontSize: 13.5, fontWeight: 700,
            }}>
            {affordable ? 'Im Shop ansehen' : 'Zum Shop'}
          </button>
        </div>
      </div>

      {/* ── 02 · DEIN RAD LEBT ── */}
      <div style={{ ...band(18) }}>
        <div style={{ ...lux(28), padding: '22px 20px 18px', gap: 14 }}>
          <Kicker>02 — Zustand</Kicker>

          {p.workshop == null ? (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.quiet }}>Der Zustand wird geladen.</span>
          ) : (
            <>
              {chain && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Kette</span>
                    <span style={{ ...TNUM, fontSize: 11, fontWeight: 600, color: T.quiet }}>
                      {chain.km_left >= 0
                        ? `noch ${nf.format(Math.round(chain.km_left))} km bis 0,5 %`
                        : `${nf.format(Math.round(-chain.km_left))} km über der Kante`}
                    </span>
                  </div>
                  {/* The continuous bar — a proportion, not countables. */}
                  <div style={{ height: 8, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 100,
                      width: `${Math.round(Math.min(1, chain.progress) * 100)}%`,
                      background: chain.status === 'fresh' ? T.acid : chain.status === 'due' ? T.warn : T.bad,
                    }} />
                  </div>
                </div>
              )}

              {jobs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {jobs.map((c) => (
                    <Row key={c.id} icon={Wrench}
                      title={c.action_de}
                      note={[c.name_de, elapsed(c)].filter(Boolean).join(' · ')}
                      right={c.status === 'overdue' ? 'ÜBERFÄLLIG' : 'FÄLLIG'}
                      accent={c.status === 'overdue' ? T.warn : T.acid}
                      onClick={p.onOpenWorkshop} />
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid }}>
                  Nichts steht an. Alles gewartet — fahr sie.
                </span>
              )}

              {p.workshop.drivetrain_watts != null && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: T.warn, lineHeight: 1.4 }}>
                  Deine Kette kostet dich gerade rund {Math.round(p.workshop.drivetrain_watts)} Watt — echte Reibung, kein Spielabzug.
                </span>
              )}
              {p.workshop.weather_ahead && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: T.ink, lineHeight: 1.45 }}>
                  {p.workshop.weather_ahead}
                </span>
              )}

              {/* Banked value is a TILE, not a whisper: the room's second
                  faucet deserves its own surface. */}
              {bonus != null && bonus > 0 && (
                <div style={{ ...luxTile(16), padding: '12px 14px', flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 100, flex: 'none',
                    display: 'grid', placeItems: 'center', background: T.acidDim,
                    color: T.acid, fontSize: 15, fontWeight: 700,
                  }}>✱</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.35 }}>
                    <span style={{ ...TNUM, color: T.acid, fontWeight: 700 }}>{nf.format(bonus)} RC</span> Service-Bonus warten — abholen zahlt aus.
                  </span>
                </div>
              )}

              {/* The value link: maintenance PAYS. One sentence, always true. */}
              <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, lineHeight: 1.45 }}>
                {p.workshop.drivetrain_fresh
                  ? 'Frischer Antrieb: +12 % RideCoin auf jede Fahrt — läuft gerade.'
                  : 'Frisch geschmiert fährt +12 % RideCoin auf jede Fahrt ein.'}
              </span>
              <button onClick={p.onOpenWorkshop}
                style={{
                  height: 44, borderRadius: 100, border: 0, cursor: 'pointer', fontFamily: FONT,
                  background: T.tile, color: T.ink, fontSize: 13, fontWeight: 700, width: '100%',
                }}>Zur Werkstatt</button>
            </>
          )}
        </div>
      </div>

      {/* ── 03 · DIE SAMMLUNG ── */}
      {(p.bikes?.length ?? 0) > 0 && (
        <div style={{ ...band(18) }}>
          <div style={{ ...lux(28), padding: '22px 0 18px', gap: 13 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 18px' }}>
              <Kicker>03 — Deine Räder</Kicker>
              <span style={{ ...TNUM, fontSize: 11, fontWeight: 700, color: T.quiet }}>
                {ownedBikes} VON {p.bikes!.length}
              </span>
            </div>
            {/* The shelf: the ladder you can SEE. Owned lit, the active one
                ringed, the next ones priced, the rest waiting. */}
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 18px 4px' }}>
              {p.bikes!.map((b) => (
                <button key={b.id} onClick={p.onOpenBikes}
                  aria-label={`${b.name}${b.owned ? '' : ` · ${nf.format(b.price)} RC`}`}
                  style={{
                    flex: 'none', width: 104, border: 0, cursor: 'pointer', fontFamily: FONT,
                    background: 'transparent', padding: 0, textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                  {/* A SHOP WINDOW, not a thumbnail: catalogue art is shot on
                      studio paper, so the card IS paper — full colour when
                      owned, greyed behind glass until then. */}
                  <span style={{
                    position: 'relative', width: 104, height: 74, borderRadius: 16, overflow: 'hidden',
                    background: T.paper, display: 'block',
                    boxShadow: b.active
                      ? `0 0 0 2px ${T.acid}, 0 6px 18px ${T.acid}22`
                      : `0 4px 14px #00000059`,
                  }}>
                    <img src={b.art} alt="" loading="lazy"
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                        transform: 'scale(1.12)',
                        filter: b.owned ? 'none' : 'grayscale(1) brightness(0.96)',
                        opacity: b.owned ? 1 : 0.8,
                      }} />
                    {!b.owned && (
                      <span style={{
                        position: 'absolute', right: 6, top: 6, width: 19, height: 19, borderRadius: 7,
                        background: '#000000A6', display: 'grid', placeItems: 'center',
                      }}><Lock size={10} color={T.d4} /></span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: b.owned ? T.ink : T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: 104 }}>
                    {b.name}
                  </span>
                  <span style={{ ...TNUM, fontSize: 9.5, fontWeight: 700, color: b.active ? T.acid : b.owned ? T.quiet : T.mid, display: 'block' }}>
                    {b.active ? 'AUF DER BÜHNE' : b.owned ? 'DEINS' : `${nf.format(b.price)} RC`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 04 · DEINE BÜHNE ── */}
      <div style={{ ...band(18) }}>
        <div style={{ ...lux(28), padding: '22px 20px 18px', gap: 13 }}>
          <Kicker>04 — Deine Bühne</Kicker>

          {p.stageTheme && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Hintergrund</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>
                  {STAGE_THEMES.find((t) => t.id === p.stageTheme!.value)?.name ?? 'Studio'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, opacity: p.stageTheme.busy ? 0.6 : 1 }}>
                {STAGE_THEMES.map((t) => {
                  const on = p.stageTheme!.value === t.id
                  return (
                    <button key={t.id} type="button" disabled={p.stageTheme!.busy}
                      onClick={() => !on && p.stageTheme!.onSet(t.id)}
                      aria-label={`Hintergrund ${t.name}`} aria-pressed={on}
                      style={{
                        flex: 'none', width: 58, height: 42, borderRadius: 10, padding: 0,
                        border: 0, cursor: on ? 'default' : 'pointer', overflow: 'hidden',
                        background: t.swatch,
                        boxShadow: on ? `0 0 0 2px ${T.acid}` : `inset 0 0 0 1px ${T.d1}`,
                        position: 'relative',
                      }}>
                      <span aria-hidden style={{
                        position: 'absolute', left: 0, right: 0, top: `${FLOOR * 100}%`,
                        height: 1, background: '#00000038',
                      }} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {p.stage && <StageRow id={p.stage.id} name={p.stage.name} onOpen={p.onOpenStages} />}

          {p.stageBike && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Auf der Bühne</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>Welches Rad im Raum steht</span>
              </span>
              <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 100, background: T.surface2, opacity: p.stageBike.busy ? 0.6 : 1 }}>
                {([['photo', 'Dein Foto'], ['collection', 'Sammlung']] as const).map(([v, l]) => {
                  const on = p.stageBike!.value === v
                  return (
                    <button key={v} type="button" disabled={p.stageBike!.busy}
                      onClick={() => !on && p.stageBike!.onSet(v)}
                      style={{
                        height: 28, padding: '0 12px', borderRadius: 100, border: 0,
                        cursor: on ? 'default' : 'pointer', fontFamily: FONT,
                        fontSize: 11, fontWeight: 700,
                        background: on ? T.acid : 'transparent',
                        color: on ? T.bg : T.quiet,
                      }}>{l}</button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── the quiet tail: the two errands ── */}
      <div style={{ ...band(30), gap: 8 }}>
        <Row icon={Package} title="Ausrüstung" note={
          (p.equippedBonusPct ?? 0) > 0
            ? `Dein Loadout zahlt +${p.equippedBonusPct} % auf passende Fahrten`
            : 'Teile mit echtem Bonus auf jede passende Fahrt'
        } onClick={p.onOpenGear} />
        <a href={REPAIR_SEARCH} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <Row icon={MapPin} title="Werkstatt in deiner Nähe" note="Für alles, was Hände braucht — öffnet die Karte" onClick={() => {}} />
        </a>
      </div>
    </motion.div>
  )
}
