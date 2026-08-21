import { T } from './w3tokens'
import type { MapPalette } from '../../components/crew/RouteMap'

/**
 * The basemap, in W3's own colours.
 *
 * Maptoolkit's dark style is fully desaturated — every colour in it is 0 %
 * saturation — so under this app it reads as a neutral grey rectangle with a
 * green line on it. These values put the map in the same room as everything
 * else: cool blue-black ground, water that is unmistakably water without
 * shouting, parks a deep green rather than a grey, and roads that step by
 * importance instead of all sitting at one weight.
 *
 * The route is NOT in here. It is the one acid object on the screen, and the
 * moment the basemap borrows the accent the route stops being the subject —
 * which is the whole reason to look at this page.
 */
export const W3_MAP: MapPalette = {
  // A shade above `T.bg`: at the app's exact black the route's own casing has
  // nothing to separate from, and the map reads as a hole rather than a floor.
  land: '#101014',
  // Blue enough to be read as water at a glance and dark enough that a lake
  // never becomes the brightest thing in frame.
  water: '#0E1E2C',
  nature: '#101C17',
  roadMinor: T.heroChip,
  roadMajor: T.heroOff,
  border: '#2A2A2E',
  label: T.mid,
  labelHalo: '#08080A',
}
