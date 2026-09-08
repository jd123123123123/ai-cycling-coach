import { motion, useReducedMotion } from 'motion/react'
import { Bike, ChevronRight, MapPin, Package, Sparkles, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Workshop, WorkshopComponent } from '../../api/workshop'
import { STAGE_THEMES, FLOOR } from './w3stageThemes'
import { T, FONT, EASE, band, Kicker } from './w3tokens'
import { hairline } from './w3surfaces'
import { backdropArt } from './w3backdropArt'
import { lux } from './w3surfaces'

/**
 * W3 · THE GARAGE, BELOW THE FOLD.
 *
 * The garage became a room and, in becoming one, lost everything under it: a
 * full-screen stage with a parts rack floating over the floor and then nothing.
 * A room you cannot walk further into is a poster.
 *
 * So this is the lane beneath it, and it is deliberately NOT a menu of links to
 * screens. It answers the question the rider actually arrives with — is my bike
 * ready — and only then offers the doors:
 *
 *  1. WHAT IS DUE, named, with the clock that made it due. Real, from
 *     `/workshop`. Nothing due says nothing due; it does not manufacture a job.
 *  2. WHERE TO GET IT DONE. The one thing the app cannot do for the rider is
 *     turn a wrench, so it points at someone who can.
 *  3. THE DOORS — equipment, shop, places.
 */

/** Only what is actually asking for attention. Dormant parts (a bike put away
 *  for the winter) and parts we have never been told about are not jobs. */
function due(w: Workshop | null): WorkshopComponent[] {
  return (w?.components ?? [])
    .filter((c) => !c.dormant && (c.status === 'due' || c.status === 'overdue'))
    .sort((a, b) => (a.status === 'overdue' ? -1 : 1) - (b.status === 'overdue' ? -1 : 1))
}

/** The elapsed figure in the unit its own clock is measured in. Rendering a
 *  sealant top-up in kilometres is the confusion the two-clock model exists to
 *  remove — see `WorkshopComponent.clock`. */
function elapsed(c: WorkshopComponent): string | null {
  if (c.clock === 'days') return c.days_since == null ? null : `seit ${c.days_since} Tagen`
  return `seit ${Math.round(c.km_since).toLocaleString('de-DE')} km`
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

/**
 * THE ROOM THE BIKE IS STANDING IN, one tap from the bike.
 *
 * Changing the backdrop was reachable only from a text list at the foot of the
 * shop, two screens from the machine it changes — and `W3StageRail`, the swipe
 * rail written for exactly this, was mounted NOWHERE. `W3TodayStage`'s comment
 * says it "is still wired there" in the garage; grep finds it in its own file
 * and its tests and nothing else. Today was right to drop the rail (a row of
 * dots naming a room the picture had not rendered yet is the app promising what
 * it is not showing), but dropping it left no in-garage path at all.
 *
 * A row, then, not a carousel: it SHOWS the current room as its own art and
 * says its name, so a rider standing in the garage can see where their bike is
 * and reach the picker in one tap. Nothing here claims to be the render.
 */
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
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Kulisse</span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </span>
      <ChevronRight size={15} color={T.quiet} style={{ flex: 'none' }} />
    </button>
  )
}

/**
 * "Werkstatt in deiner Nähe" — a plain link, on purpose.
 *
 * The obvious build asks for the browser's location and centres a map on it.
 * That is a permission prompt, a failure path and a stale-coordinate bug in
 * exchange for nothing: a maps search for a bike shop NEARBY is already
 * resolved against the device's own position by the maps app itself, which
 * knows where the rider is standing better than a coordinate we cached. So the
 * app asks for no permission it does not need, and the link works the same on a
 * phone, a tablet and a desktop.
 */
const REPAIR_SEARCH = 'https://www.google.com/maps/search/Fahrradwerkstatt+in+der+N%C3%A4he/'

export interface W3GarageLaneProps {
  workshop: Workshop | null
  onOpenWorkshop: () => void
  onOpenGear: () => void
  onOpenShop: () => void
  /** The BIKE ladder — the economy's only large sink. */
  onOpenBikes: () => void
  /** The room the bike is standing in right now, and its name. Null while the
   *  backdrops read is in flight — the row simply does not draw rather than
   *  naming a stage the rider has not chosen. */
  stage: { id: string; name: string } | null
  onOpenStages: () => void
  /** Which machine stands on the hero stage. Null → the choice does not exist
   *  (no photographed bike, or no bought collection bike): a switch with one
   *  position is furniture. */
  stageBike?: {
    value: 'photo' | 'collection'
    busy: boolean
    onSet: (v: 'photo' | 'collection') => void
  } | null
  /** Which backdrop the room wears (w3stageThemes). Always offered — every
   *  rider has the room. */
  stageTheme?: {
    value: string
    busy: boolean
    onSet: (id: string) => void
  } | null
}

export default function W3GarageLane(p: W3GarageLaneProps) {
  const reduce = useReducedMotion()
  const jobs = due(p.workshop)
  const bonus = p.workshop?.total_bonus_rc ?? null

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{ display: 'flex', flexDirection: 'column', paddingTop: 22, background: T.bg }}>

      {/* ── 1 · what the bike is asking for ── */}
      <div style={{ ...band(14) }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 10 }}>
          <Kicker>Zustand</Kicker>
          {bonus != null && bonus > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: T.acid }}>
              {bonus.toLocaleString('de-DE')} RC warten
            </span>
          )}
        </div>
        <div style={{ ...lux(24), padding: 14, gap: 8 }}>
          {jobs.length === 0 ? (
            // NOT a placeholder job. A bike with nothing due is the good case
            // and gets to say so.
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 2px' }}>
              <Sparkles size={16} color={T.acid} style={{ flex: 'none' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid, lineHeight: 1.35 }}>
                {p.workshop
                  ? 'Nichts steht an. Alles gewartet — fahr sie.'
                  : 'Der Zustand wird geladen.'}
              </span>
            </div>
          ) : (
            jobs.map((c) => (
              <Row key={c.id} icon={Wrench}
                title={c.action_de}
                note={[c.name_de, elapsed(c)].filter(Boolean).join(' · ')}
                right={c.status === 'overdue' ? 'ÜBERFÄLLIG' : 'FÄLLIG'}
                accent={c.status === 'overdue' ? T.warn : T.acid}
                onClick={p.onOpenWorkshop} />
            ))
          )}
        </div>
      </div>

      {/* ── 2 · the thing the app cannot do itself ── */}
      <div style={{ ...band(14) }}>
        <a href={REPAIR_SEARCH} target="_blank" rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 13, textDecoration: 'none',
            padding: '15px 16px', borderRadius: 22, background: T.surface, fontFamily: FONT,
          }}>
          <span style={{ width: 36, height: 36, borderRadius: 100, flex: 'none', display: 'grid', placeItems: 'center', background: T.acidDim }}>
            <MapPin size={17} color={T.acid} />
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Werkstatt in deiner Nähe</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, lineHeight: 1.3 }}>
              Für alles, was Hände braucht — öffnet die Karte
            </span>
          </span>
          <ChevronRight size={16} color={T.quiet} style={{ flex: 'none' }} />
        </a>
      </div>

      {/* ── 3 · the doors ── */}
      <div style={{ ...band(30) }}>
        <div style={{ paddingBottom: 10 }}><Kicker>Weiter</Kicker></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.stage && <StageRow id={p.stage.id} name={p.stage.name} onOpen={p.onOpenStages} />}
          {/* WHAT STANDS ON THE BÜHNE. Without this, buying the 15 000-RC
              catalogue bike changed nothing a photographed-bike rider could
              ever see — the economy's largest sink was cosmetically inert. */}
          {p.stageBike && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 13,
              padding: '13px 16px', borderRadius: 22, background: T.surface, fontFamily: FONT,
            }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Auf der Bühne</span>
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
          {/* RÄDER FIRST, and it is the row that was missing entirely. The
              bike is the headline collectible and the ladder is where RideCoin
              actually goes — 26 priced bikes that no screen could reach until
              now, so a rider watched a balance climb with nothing to spend it
              on. */}
          <Row icon={Bike} title="Räder" note="Die Sammlung — 26 Räder" onClick={p.onOpenBikes} />
          <Row icon={Package} title="Ausrüstung" note="Teile kaufen und montieren" onClick={p.onOpenGear} />
          {/* THE ROOM'S BACKDROP. Eight stages, every one holding the same
              crisp horizon the bike stands on — the swatch IS the theme's own
              wall-and-floor gradient, so what you pick is what you get. */}
          {p.stageTheme && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: '13px 16px 14px', borderRadius: 22, background: T.surface, fontFamily: FONT,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Hintergrund</span>
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
                      {/* The swatch repeats the theme's own horizon, so even a
                          thumbnail stands on a floor. */}
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

          {/* ONE ROW, because there is now one screen behind it. "Shop" and
              "Orte" were two rows leading to two screens that both sold things
              with RideCoin; the places moved into the shop, so a second row
              pointing at the same scroll is a choice with no difference in it. */}
          <Row icon={Sparkles} title="Shop" note="Teile, Kulissen und Orte" onClick={p.onOpenShop} />
        </div>
      </div>
    </motion.div>
  )
}
