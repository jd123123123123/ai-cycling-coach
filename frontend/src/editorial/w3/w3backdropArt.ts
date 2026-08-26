import { T } from './w3tokens'

/**
 * WHAT EACH KULISSE LOOKS LIKE, drawn rather than fetched.
 *
 * The backdrop picker listed the rider's rooms as WORDS — a name, an unlock
 * rule and a tick. Choosing where your bike stands from a text list is not
 * choosing: you cannot tell "Passhöhe" from "Küstenstraße" without riding to
 * find out, and the one thing the screen is for is showing you the room.
 *
 * IT IS NOT A THUMBNAIL, AND THAT IS DELIBERATE. `api/garage`'s places already
 * inline a `plate_url` per row and that gallery is the heaviest read in the
 * app; adding a picture per backdrop would repeat the mistake on the one list
 * that has so far avoided it. Every room below is two or three CSS gradients —
 * a horizon line, a ground, a light — which costs bytes in the low hundreds for
 * the whole catalogue and animates for free.
 *
 * They are IMPRESSIONS, not photographs, and they are honest about it: each one
 * carries the light and the ground of the prose in `services/backdrops.py`, so
 * a rider recognises the room they picked when the render lands. Nothing here
 * claims to be the render.
 *
 * TOKENS ONLY — `isolation.test` enforces it, and a picker that invented six
 * new colours would be the loudest thing in a near-black app.
 */

export interface BackdropArt {
  /** Painted into a tile as `background`. */
  css: string
  /** One word for what the room is, under the name. */
  mood: string
}

/** Alpha suffixes, so the ramps read as light rather than as flat fills. */
const a = (hex: string, aa: string) => `${hex}${aa}`

const ART: Record<string, BackdropArt> = {
  studio_black: {
    css: `radial-gradient(120% 80% at 50% 88%, ${a(T.d3, '40')}, transparent 62%), linear-gradient(180deg, ${T.bg}, ${T.surface})`,
    mood: 'Studio',
  },
  starter_road: {
    css: `linear-gradient(180deg, ${T.nightLo} 0%, ${T.nightMid} 46%, ${T.bg} 47%, ${T.surface} 100%), radial-gradient(80% 40% at 78% 46%, ${a(T.acid, '2E')}, transparent 70%)`,
    mood: 'Dämmerung',
  },
  night_road: {
    css: `linear-gradient(180deg, ${T.nightLo} 0%, ${T.nightMid} 44%, ${T.bg} 45%, ${T.bg} 100%), radial-gradient(46% 30% at 30% 44%, ${a(T.cool, '4A')}, transparent 68%)`,
    mood: 'Nacht',
  },
  dawn_road: {
    css: `linear-gradient(180deg, ${T.warn} 0%, ${a(T.warn, 'AA')} 30%, ${T.surface2} 47%, ${T.surface} 100%), radial-gradient(60% 34% at 76% 44%, ${a(T.warn, '80')}, transparent 70%)`,
    mood: 'Sonnenaufgang',
  },
  mountain_pass: {
    // Two ridges over a cold sky: the one room whose SHAPE is the point.
    css: `linear-gradient(180deg, ${T.nightMid} 0%, ${T.nightHi} 40%, ${T.surface2} 41%, ${T.surface} 100%), linear-gradient(28deg, transparent 46%, ${a(T.d2, '99')} 47%, transparent 62%), linear-gradient(-24deg, transparent 52%, ${a(T.d1, 'CC')} 53%, transparent 68%)`,
    mood: 'Hochgebirge',
  },
  coast_road: {
    css: `linear-gradient(180deg, ${T.cool} 0%, ${a(T.cool, '77')} 38%, ${T.training} 39%, ${T.surface} 100%)`,
    mood: 'Küste',
  },
  rain_road: {
    css: `linear-gradient(180deg, ${T.nightHi} 0%, ${T.nightMid} 45%, ${T.bg} 46%, ${T.surface2} 100%), repeating-linear-gradient(97deg, ${a(T.d2, '55')} 0 1px, transparent 1px 7px)`,
    mood: 'Regen',
  },
  gravel_track: {
    css: `linear-gradient(180deg, ${T.cool} 0%, ${a(T.warn, '55')} 40%, ${T.warn} 41%, ${T.surface} 100%)`,
    mood: 'Schotter',
  },
  winter_road: {
    css: `linear-gradient(180deg, ${T.nightHi} 0%, ${T.d2} 44%, ${T.d3} 45%, ${T.surface2} 100%)`,
    mood: 'Frost',
  },
  velodrome: {
    css: `radial-gradient(120% 90% at 50% 108%, ${a(T.warn, '99')}, ${a(T.warn, '3A')} 46%, ${T.bg} 74%), linear-gradient(180deg, ${T.bg}, ${T.surface})`,
    mood: 'Bahn',
  },
}

/** The room a place stands in, when its own plate has not been rendered yet. */
const PLACE_FALLBACK: BackdropArt = {
  css: `linear-gradient(180deg, ${T.nightMid} 0%, ${T.surface2} 46%, ${T.surface} 100%)`,
  mood: 'Ort',
}

/**
 * Art for a backdrop id. Unknown ids get the neutral room rather than nothing:
 * a stage added on the server before the client knows about it must still be
 * pickable, and an empty tile reads as a broken one.
 */
export function backdropArt(id: string): BackdropArt {
  return ART[id] ?? PLACE_FALLBACK
}
