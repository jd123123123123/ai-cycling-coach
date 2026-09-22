/**
 * RouteMap — a real basemap under a GPX route, replacing the gradient field the
 * crew-ride hero used because the app had no tile provider.
 *
 * ── Provider choice (researched Jul 2026) ────────────────────────────────
 * Maptoolkit (styles.maptoolkit.org), rendered with MapLibre GL JS. Why:
 *  • No API key and no sign-up, so nothing to provision or leak, and the map
 *    works on a fresh clone. Limits are 120 tiles/s sustained per site with
 *    CDN-cached tiles (~90% of traffic) not counted — far above what a
 *    ride-detail page generates.
 *  • It ships a genuine `dark` style, which matters more than it sounds: every
 *    other free basemap is light, and a white map inside this near-black app
 *    would be the single brightest object on any screen it appeared on.
 *  • It also ships `cycling`, with contour lines and hillshading. That is worth
 *    having for a cycling app, and it is what finally gives the pen's map-type
 *    pill something real to toggle between — two actual styles, not a fake
 *    "Satellite" button over imagery we don't have.
 * MapLibre (not Mapbox GL) because Mapbox GL went proprietary at v2 and needs a
 * token; MapLibre is BSD and reads the same style JSON.
 *
 * ── Gesture handling ─────────────────────────────────────────────────────
 * A map embedded in a vertically scrolling page that eats one-finger pans is a
 * well-known mobile trap — the user swipes to scroll, the map pans instead, and
 * they can end up stranded mid-page. The industry answer is "cooperative"
 * gestures (one finger scrolls the page, two fingers move the map).
 *
 * This goes one step further for the hero: it is `interactive: false` — a
 * genuinely static preview that cannot capture a gesture at all — and tapping it
 * opens a full-screen map that IS interactive, with `cooperativeGestures` on.
 * That is the pattern the ride-tracking apps converged on, and it means the
 * common case (scrolling past a route) costs the user nothing.
 *
 * ── Degradation ──────────────────────────────────────────────────────────
 * MapLibre is ~200 KB gzipped, so it is imported dynamically and never lands in
 * the initial bundle. Until it resolves — and permanently, if the tile host is
 * unreachable or WebGL is unavailable — the caller's SVG fallback stays on
 * screen. A ride page must render its route without a network map.
 *
 * ── Attribution ──────────────────────────────────────────────────────────
 * Maptoolkit's licence requires a VISIBLE "© Maptoolkit © OpenStreetMap", each
 * part linking to its own copyright page. Verified 31 Jul 2026 against
 * maptoolkit.com/copyright: a text notice with clickable links is the whole
 * requirement, and NO logo is required — their own TileJSON ships exactly that
 * text and no image. (This corrects an earlier note here, and the matching
 * entry in the deploy runbook, which claimed a logo was mandatory and treated
 * its absence as a ship blocker.)
 *
 * It is rendered by <MapAttribution/> in this file rather than by MapLibre's
 * AttributionControl. The control's full bar spans a 358 px hero and covers the
 * ride title, and the compact variant had to be force-collapsed to an (i)
 * badge on every frame — a notice that starts closed is a weak reading of
 * "visible". Rendering it directly gives a permanently visible, permanently
 * clickable line that fits the design instead of fighting it.
 */
import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'

export type MapStyleKey = 'dark' | 'cycling'

const STYLE_URL: Record<MapStyleKey, string> = {
  dark: 'https://styles.maptoolkit.org/dark.json',
  cycling: 'https://styles.maptoolkit.org/cycling.json',
}

export interface RouteWaypoint {
  name: string
  lat: number
  lng: number
  sym?: string | null
  desc?: string | null
}

export interface RouteMapProps {
  /** [[lat, lng], …] — the same shape the API returns. */
  polyline: [number, number][]
  waypoints?: RouteWaypoint[]
  styleKey?: MapStyleKey
  /** Static preview (default) vs. a map the user can pan and zoom. */
  interactive?: boolean
  /** Fired once the basemap has actually painted, so the caller can cross-fade
   *  its SVG fallback out instead of flashing an empty canvas. */
  onReady?: () => void
  /**
   * Keep the WebGL drawing buffer readable so the map can be SNAPSHOT.
   *
   * Without it `getCanvas().toDataURL()` comes back blank: WebGL is free to
   * discard the buffer the moment it has composited, and it does. It costs a
   * copy per frame, so it is opt-in and only the share card's one-off render
   * asks for it — never the maps a rider actually looks at.
   */
  snapshot?: boolean
  /** Overrides the fit padding, in CSS pixels. An object pushes the route off
   *  one edge more than another — which is how a share card gets the ride in
   *  its MIDDLE band, with the top and bottom left clear for type. */
  fitPadding?: number | { top: number; bottom: number; left: number; right: number }
  /** Keep a static, flex-sized ride preview fitted as late data changes its height. */
  refitOnResize?: boolean
  /** Called once the tiles have settled, with a reader for the composited
   *  frame. Returns null when the context is gone or the buffer was not kept. */
  onSnapshot?: (read: () => string | null) => void
  className?: string
  /** Per-vertex colours, same length as `polyline`. Paints the route as a
   *  gradient along its own length instead of one flat colour — the rehearsal
   *  page uses it to colour the road by target watts, so the hard parts are
   *  visible on the map before the profile is even read. Ignored unless it
   *  matches `polyline` in length, because a mismatched ramp would silently
   *  colour the wrong stretches of road. */
  lineColors?: string[]
  /** The route's own colour, and how heavy it is drawn. Defaults to the crew
   *  orange this component was born with. The ride page passes the W3 acid and
   *  a heavier weight: a route is the SUBJECT of that screen rather than one
   *  element on a planning map, so it carries the accent and the extra width
   *  the design gives it. Ignored when `lineColors` supplies a gradient. */
  lineColor?: string
  lineWidth?: number
  /** Drape the map over real elevation and tilt the camera into it. Only for
   *  a surface a rider has deliberately opened to LOOK at the terrain — a
   *  tilted map is disorienting as a summary and costs DEM tiles that a flat
   *  city ride gains nothing from. */
  terrain?: boolean
  /** Repaint the basemap into the app's palette once it loads. Omitted leaves
   *  the provider's own cartography untouched, which is what the crew and
   *  rehearsal pages want. See `repaint`. */
  palette?: MapPalette
  /** Endpoint markers. Defaults to green start / orange end. The ride page
   *  overrides them because on a finished ride the two ends mean something
   *  different than on a route being planned — one is where you set off, the
   *  other is where you stopped, and neither is a status. */
  startColor?: string
  endColor?: string
  /** How far up from the map's bottom edge the licence notice must sit, in px.
   *  Defaults to the static hero's 58. The ride summary passes more, because a
   *  card overlaps the bottom of its map — and a notice hidden behind a card is
   *  not a visible notice, which is the one thing the licence actually asks
   *  for. Anything that covers this map's lower edge must say by how much. */
  attributionBottom?: number
  /** A dot that tracks the scrub. Moving it does NOT rebuild the map: the
   *  marker is created once with the route and repositioned in place, so
   *  dragging a finger across the profile stays cheap. `null` hides it. */
  markerLatLng?: [number, number] | null
}

/** Up to this many `line-gradient` stops.
 *
 *  This was 48, chosen when the only caller was the rehearsal page's
 *  target-watts ramp — a broad "harder here, easier there" read at a glance. A
 *  ride coloured by GRADIENT is a different job: 48 stops over a 138 km Alpine
 *  loop is one colour every 2.9 km, which averages a hairpin ramp together with
 *  the valley it starts in and paints the whole pass one middling tone.
 *
 *  128 puts it near a kilometre, which resolves a pass without pretending to
 *  resolve a single ramp — and it is worth being honest that a 300 m wall
 *  inside a long climb will not show at any stop count this side of sending the
 *  whole array. The expression is re-parsed on every style load, so this is not
 *  free. */
const MAX_GRADIENT_STOPS = 128

/** Colour ramp as a `line-gradient` expression, or null when unusable. */
function gradientExpression(colors: string[]): unknown[] | null {
  const n = colors.length
  if (n < 2) return null
  const count = Math.min(n, MAX_GRADIENT_STOPS)
  const stops: unknown[] = []
  let prev = -1
  for (let k = 0; k < count; k++) {
    const i = Math.round((k / (count - 1)) * (n - 1))
    // `interpolate` requires STRICTLY increasing stops; rounding can repeat an
    // index on short routes, and a duplicate stop makes MapLibre reject the
    // whole layer (which would drop the route line, not just its colour).
    const t = k / (count - 1)
    if (t <= prev) continue
    prev = t
    stops.push(t, colors[i])
  }
  if (stops.length < 4) return null
  return ['interpolate', ['linear'], ['line-progress'], ...stops]
}

/** Bounding box of the track, as MapLibre's [[w,s],[e,n]]. */
function boundsOf(poly: [number, number][]): [[number, number], [number, number]] {
  const lats = poly.map((p) => p[0])
  const lngs = poly.map((p) => p[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}


/**
 * Repaint a real basemap in the app's own palette.
 *
 * WHY REPAINT RATHER THAN RESTYLE OR REPLACE. Maptoolkit's `dark` style is a
 * pure GREYSCALE map — every colour in it is 0 % saturation — which is why it
 * reads as muddy and generic next to a screen built on cool blue-black and one
 * acid accent. Authoring a whole style JSON would mean owning a basemap
 * (labels, zoom ramps, 92 layers) forever; hand-picking a coloured provider
 * would mean taking whatever palette they chose. Recolouring the layers we can
 * name gets the app's own map out of somebody else's cartography, and every
 * road, label and coastline stays theirs — correct and maintained.
 *
 * The ids are semantic and stable (`water_*`, `nature_*`, `road_*`, `*_label_*`,
 * `relief_*`), so the classification is by NAME rather than by guessing at
 * paint values. Anything unrecognised is left exactly as the provider drew it:
 * a map that half-follows a palette still looks like a map, where a map with a
 * missing layer looks broken.
 *
 * Every set is guarded. A style can drop a layer or rename a paint property
 * between releases, and none of that is worth a blank map — a slightly
 * off-palette basemap under the route is a far better failure than no basemap.
 */

/**
 * The DEM behind 3D terrain, and the one detail that silently ruins it.
 *
 * ENCODING IS NOT A DETAIL. Terrain-RGB tiles pack height into the colour
 * channels, and there are three incompatible conventions — `mapbox`,
 * `terrarium` and `mtk`. Declaring the wrong one does not fail: it produces
 * heights that are simply wrong, and MapLibre renders them without complaint.
 * Verified against a real Dolomites tile rather than trusted: read as
 * `terrarium` its centre pixel is 1 277 m, which is a plausible valley floor;
 * read as `mapbox` the same pixel is 861 554 m, which is twice the altitude of
 * the ISS.
 *
 * `tileSize: 512` is likewise measured off the tile, not assumed. The basemap
 * style declares this same DEM three more times at 2048/4096/8192 — those are
 * deliberate over-declarations that BLUR it for soft hillshading, and reusing
 * one of them for displacement would stretch the landscape by a factor of four.
 */
const TERRAIN_SOURCE = 'w3-dem'
const TERRAIN_TILES = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'

/** Enough to feel the mountain, not so much that a col becomes a spike. The
 *  1.3-2.0 band is where relief reads as landscape rather than as a special
 *  effect; a ride through a flat city is unchanged by any value in it. */
const TERRAIN_EXAGGERATION = 1.45

export interface MapPalette {
  land: string
  water: string
  nature: string
  roadMinor: string
  roadMajor: string
  border: string
  label: string
  labelHalo: string
}

function repaint(map: MlMap, p: MapPalette): void {
  let layers: { id: string; type: string }[]
  try {
    layers = map.getStyle().layers as { id: string; type: string }[]
  } catch { return }

  // The cast is deliberate. MapLibre types `setPaintProperty` against a union
  // of every paint key, which cannot be satisfied when the key is chosen at
  // runtime from the layer's own type — and the runtime guard below is the real
  // safety net anyway, since a style can drop a layer between releases whatever
  // the compiler believes.
  const set = (id: string, prop: string, value: string | number) => {
    try {
      (map.setPaintProperty as (i: string, p: string, v: unknown) => void)(id, prop, value)
    } catch { /* the provider moved on; the provider's own colour stands */ }
  }

  for (const { id, type } of layers) {
    // Water first: `water_*` also contains the bathymetry relief and the lake
    // labels, and each takes a different property.
    if (id.startsWith('water')) {
      if (type === 'fill') set(id, 'fill-color', p.water)
      else if (type === 'line') set(id, 'line-color', p.water)
      else if (type === 'symbol') { set(id, 'text-color', p.label); set(id, 'text-halo-color', p.labelHalo) }
      continue
    }
    if (id.startsWith('nature') || id.startsWith('building')) {
      if (type === 'fill') set(id, 'fill-color', id.includes('landuse') ? p.nature : p.land)
      continue
    }
    if (id.startsWith('road')) {
      if (type === 'line') {
        // Casings are drawn under their road and share the prefix; painting
        // them the same as the road removes the outline that keeps a junction
        // legible, so they go one step darker instead.
        set(id, 'line-color', /casing|outline/.test(id) ? p.land : /motorway|trunk|primary/.test(id) ? p.roadMajor : p.roadMinor)
      } else if (type === 'fill') set(id, 'fill-color', p.roadMinor)
      else if (type === 'symbol') { set(id, 'text-color', p.label); set(id, 'text-halo-color', p.labelHalo) }
      continue
    }
    if (id.startsWith('border')) { set(id, 'line-color', p.border); continue }
    if (id.startsWith('place') || id.startsWith('poi')) {
      set(id, 'text-color', p.label)
      set(id, 'text-halo-color', p.labelHalo)
      continue
    }
    if (type === 'background') set(id, 'background-color', p.land)
  }

  // THE RELIEF IS THE POINT, and it is the one thing a flat recolour would
  // flatten further. Hillshading is what makes a mountain route look like it
  // crosses mountains — in the Dolomites it is the difference between a line on
  // paper and a ride. Lifted, not invented: the data is the provider's own DEM.
  for (const { id, type } of layers) {
    if (type !== 'hillshade') continue
    set(id, 'hillshade-exaggeration', 0.55)
    set(id, 'hillshade-shadow-color', p.labelHalo)
    set(id, 'hillshade-highlight-color', p.roadMinor)
  }
}

export default function RouteMap({
  polyline, waypoints = [], styleKey = 'dark', interactive = false, onReady, className,
  snapshot = false, onSnapshot, fitPadding, refitOnResize = false,
  lineColors, markerLatLng = null,
  lineColor = '#FF5A3C', lineWidth = 4, startColor = '#16E08A', endColor = '#FF5A3C',
  attributionBottom, palette, terrain = false,
}: RouteMapProps) {
  const holder = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [failed, setFailed] = useState(false)
  // The scrub dot, kept outside React so moving it never re-renders the map.
  const scrubRef = useRef<{ setLngLat: (l: [number, number]) => void; remove: () => void } | null>(null)
  const scrubEl = useRef<HTMLDivElement | null>(null)
  // Latest scrub position, read by `decorate` — the map may finish loading
  // after the user has already dragged, and without this the dot would sit at
  // the start until the next move.
  const latestMarker = useRef<[number, number] | null>(markerLatLng)
  latestMarker.current = markerLatLng

  useEffect(() => {
    if (!holder.current || polyline.length < 2 || failed) return
    let cancelled = false
    let map: MlMap | null = null

    ;(async () => {
      try {
        // Dynamic import: keeps ~200 KB out of every bundle that isn't a map.
        const maplibre = await import('maplibre-gl')
        await import('maplibre-gl/dist/maplibre-gl.css')
        if (cancelled || !holder.current) return

        map = new maplibre.Map({
          container: holder.current,
          style: STYLE_URL[styleKey],
          bounds: boundsOf(polyline),
          fitBoundsOptions: { padding: fitPadding ?? (interactive ? 48 : 34), animate: false },
          interactive,
          cooperativeGestures: interactive,
          attributionControl: false,
          // The route and pins carry the meaning; a compass and scale on a
          // 290px preview are chrome competing with them.
          dragRotate: false,
          pitchWithRotate: false,
          // maplibre 6 moved the WebGL attributes under their own key; the
          // top-level `preserveDrawingBuffer` of v4 is silently ignored, which
          // is the kind of "option accepted, nothing happens" that costs an
          // hour of staring at a blank snapshot.
          ...(snapshot ? { canvasContextAttributes: { preserveDrawingBuffer: true } } : {}),
        })
        mapRef.current = map
        if (refitOnResize && !interactive) {
          map.on('resize', () => {
            if (!cancelled) map?.fitBounds(boundsOf(polyline), { padding: fitPadding ?? 34, animate: false })
          })
        }

        // Attribution comes from the TILEJSON, which already ships a compliant
        // "© Maptoolkit © Openstreetmap" with both links. Passing our own
        // `customAttribution` APPENDED to it and rendered the notice twice.
        // `compact` collapses it to an (i) badge — expanded, the white bar spans
        // the hero and sits straight over the ride title.
        // No AttributionControl: the notice is rendered by this component
        // instead (see <MapAttribution/> below). MapLibre's compact control
        // had to be force-collapsed to an (i) badge to stop a full-width white
        // bar covering the ride title -- and a notice that starts closed is a
        // weak reading of "visibly include". Rendering it ourselves gives a
        // permanently visible, permanently clickable line that fits the design
        // rather than fighting it.
        if (interactive) map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')

        map.on('error', (e) => {
          // A missing glyph or one failed tile must not blank the map; only a
          // style/source failure is fatal enough to fall back.
          const msg = String((e as { error?: Error }).error?.message ?? '')
          if (/style|source|Failed to fetch/i.test(msg)) setFailed(true)
        })

        // Ready signal: `load`, which fires once the style is in and the first
        // frame is drawn.
        //
        // NOT `isStyleLoaded()` — that reads as "nothing is pending right now"
        // and OSCILLATES on this style, whose terrain-DEM sources keep tiles in
        // flight: sampling it returned true, then false two seconds later. A
        // one-shot `decorate()` gated on it therefore fired never or by luck.
        // `styledata` is no better; it announces style *mutations*, not arrival.
        //
        // The guard keeps it idempotent, and the `map.loaded()` pre-check covers
        // the case where the style resolves from cache before the listener is
        // attached — the one real weakness of a bare `load` handler.
        let decorated = false
        const decorate = () => {
          if (decorated || cancelled || !map) return
          decorated = true
          // Repaint BEFORE the route goes on, so the route is never briefly
          // drawn over the provider's palette and then over ours.
          if (palette) repaint(map, palette)

          // ── 3D ───────────────────────────────────────────────────────
          // After the repaint, so the sky is coloured in our palette rather
          // than the style's daylight blue, and before the route, so the line
          // is added to a map that is already draped.
          if (terrain) {
            try {
              if (!map.getSource(TERRAIN_SOURCE)) {
                map.addSource(TERRAIN_SOURCE, {
                  type: 'raster-dem',
                  tiles: [TERRAIN_TILES],
                  tileSize: 512,
                  maxzoom: 15,
                  encoding: 'terrarium',
                  attribution: '',
                } as Parameters<MlMap['addSource']>[1])
              }
              map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION })
              // A tilted map with no sky shows the void behind the horizon,
              // which reads as a rendering bug rather than as distance. In
              // MapLibre v5+ the sky is a STYLE-ROOT property set through
              // `setSky`, not a layer — the base style declares its own there
              // in daylight blue, and this replaces it with ours.
              if (palette) {
                map.setSky({
                  'sky-color': palette.water,
                  'sky-horizon-blend': 0.6,
                  'horizon-color': palette.roadMinor,
                  'horizon-fog-blend': 0.7,
                  'fog-color': palette.land,
                  'fog-ground-blend': 0.9,
                })
              }
              // Tilt only once the ground has somewhere to go. Pitching a flat
              // map just squashes it.
              map.easeTo({ pitch: 58, duration: 900 })
            } catch (err) {
              // A DEM that will not load is a flat map, which is the map we
              // had. Never a blank one.
              console.warn('3D terrain unavailable', err)
            }
          }
          const coords = polyline.map(([lat, lng]) => [lng, lat])

          const ramp = lineColors && lineColors.length === polyline.length
            ? gradientExpression(lineColors)
            : null

          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
            // Required by `line-gradient`: without it the expression is
            // rejected and the line falls back to no paint at all.
            lineMetrics: ramp != null,
          })
          // Casing then line, the way the pen layers them — a white casing is
          // what keeps a coloured route legible over both dark forest and pale
          // water at any zoom.
          map.addLayer({
            id: 'route-casing', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#FFFFFF', 'line-width': lineWidth + 3, 'line-opacity': 0.9 },
          })
          map.addLayer({
            id: 'route-line', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: ramp
              ? { 'line-gradient': ramp, 'line-width': lineWidth }
              : { 'line-color': lineColor, 'line-width': lineWidth },
          } as Parameters<MlMap['addLayer']>[0])

          const [startLat, startLng] = polyline[0]
          const [endLat, endLng] = polyline[polyline.length - 1]
          const dot = (color: string, size: number) => {
            const el = document.createElement('div')
            el.style.cssText = `width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 0 10px ${color}99`
            return el
          }
          new maplibre.Marker({ element: dot(startColor, 15) }).setLngLat([startLng, startLat]).addTo(map)
          new maplibre.Marker({ element: dot(endColor, 15) }).setLngLat([endLng, endLat]).addTo(map)

          if (markerLatLng !== undefined) {
            // Bigger than the endpoint dots and ringed, so it reads as "you are
            // here" rather than a third fixed pin. Starts hidden unless the
            // user has already scrubbed: an untouched route must look exactly
            // as it did before this prop existed.
            const el = document.createElement('div')
            el.style.cssText =
              'width:20px;height:20px;border-radius:999px;background:#FFFFFF;' +
              'border:3px solid #FF5A3C;box-shadow:0 0 0 4px #FF5A3C33,0 2px 8px #000000AA;' +
              'opacity:0;transition:opacity 120ms linear;pointer-events:none'
            scrubEl.current = el
            const start = latestMarker.current
            const m = new maplibre.Marker({ element: el })
              .setLngLat(start ? [start[1], start[0]] : [startLng, startLat])
              .addTo(map)
            if (start) el.style.opacity = '1'
            scrubRef.current = {
              setLngLat: (l) => { m.setLngLat(l) },
              remove: () => { m.remove() },
            }
          }

          for (const w of waypoints) {
            if (!Number.isFinite(w.lat) || !Number.isFinite(w.lng)) continue
            const el = document.createElement('div')
            el.style.cssText =
              'display:flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;' +
              'background:#0A0C0FCC;border:1px solid #FFFFFF33;backdrop-filter:blur(8px);' +
              'font:700 10px Inter,system-ui,sans-serif;color:#fff;white-space:nowrap;' +
              'box-shadow:0 2px 6px #0000008C'
            const pin = document.createElement('span')
            pin.style.cssText = 'width:6px;height:6px;border-radius:999px;background:#38B6FF;flex:0 0 auto'
            const label = document.createElement('span')
            label.textContent = w.name
            el.append(pin, label)
            const marker = new maplibre.Marker({ element: el, anchor: 'left' }).setLngLat([w.lng, w.lat])
            if (interactive && w.desc) {
              marker.setPopup(new maplibre.Popup({ offset: 12, closeButton: false }).setText(w.desc))
            }
            marker.addTo(map)
          }

          if (!cancelled) onReady?.()

          // ONE FRAME LATER, AND ONLY WHEN IDLE. `load` fires when the style is
          // ready, not when the tiles for this viewport have actually painted —
          // snapshotting there yields a grey rectangle with a route on it.
          if (!cancelled && snapshot && onSnapshot) {
            const grab = () => {
              if (cancelled) return
              onSnapshot(() => {
                try { return map?.getCanvas().toDataURL('image/jpeg', 0.82) ?? null }
                catch { return null }
              })
            }
            if (map.loaded() && map.areTilesLoaded()) requestAnimationFrame(grab)
            else map.once('idle', () => requestAnimationFrame(grab))
          }
        }
        if (map.loaded()) decorate()
        else map.on('load', decorate)
      } catch {
        // No WebGL, blocked host, chunk failed — the caller's SVG stands in.
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      // The map takes its markers with it; drop our handles so a later scrub
      // cannot poke at a removed marker.
      scrubRef.current = null
      scrubEl.current = null
    }
    // `waypoints`/`onReady` are intentionally excluded: they arrive with the
    // same fetch as `polyline`, and including them would tear the map down and
    // rebuild it on every parent render. The colour props are excluded for a
    // different reason — they are per-CALLER design constants, not state, so a
    // change to one would mean a different screen rather than a new value on
    // this one. Pass them as literals; animating them will not work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyline, styleKey, interactive, failed, palette, terrain, fitPadding, refitOnResize])

  // Scrub position. Deliberately NOT part of the effect above: rebuilding a
  // MapLibre instance per pointer-move would be unusable on a phone.
  useEffect(() => {
    const marker = scrubRef.current
    const el = scrubEl.current
    if (!marker || !el) return
    if (markerLatLng) {
      marker.setLngLat([markerLatLng[1], markerLatLng[0]])
      el.style.opacity = '1'
    } else {
      el.style.opacity = '0'
    }
  }, [markerLatLng])

  // Re-colour in place when a new simulation arrives (different watts → a
  // different ramp) so changing an assumption does not tear the map down.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !lineColors || lineColors.length !== polyline.length) return
    const ramp = gradientExpression(lineColors)
    if (!ramp) return
    try {
      if (map.getLayer('route-line')) {
        // MapLibre types `line-gradient` as a closed union of expression
        // shapes; ours is built at runtime from a variable number of stops, so
        // it cannot be proven to match without rebuilding the union by hand.
        ;(map.setPaintProperty as (layer: string, prop: string, value: unknown) => void)(
          'route-line',
          'line-gradient',
          ramp,
        )
      }
    } catch {
      // Style not ready yet — `decorate` will apply this ramp when it runs.
    }
  }, [lineColors, polyline])

  if (polyline.length < 2 || failed) return null
  return (
    <>
      <div ref={holder} className={className} style={{ position: 'absolute', inset: 0 }} aria-hidden={!interactive} />
      <MapAttribution bottom={attributionBottom ?? (interactive ? 6 : 58)} />
    </>
  )
}

/**
 * The licence notice. Maptoolkit's terms (verified against their copyright
 * page, 31 Jul 2026) require a VISIBLE attribution naming both Maptoolkit and
 * OpenStreetMap, each linking to its own copyright page. A logo is NOT
 * required -- their own TileJSON ships exactly this text and no image.
 *
 * Rendered here rather than by MapLibre's AttributionControl so it can be
 * small, legible over any basemap, and always open. It sits outside the map's
 * container div, so nothing the map draws can cover it, and it is a sibling of
 * the hero content rather than a child of the canvas -- which is what keeps
 * "unobstructed" true rather than merely intended.
 *
 * `pointerEvents` is set on the links only: the notice must be clickable
 * without turning the surrounding corner of a static hero into a dead zone
 * that swallows the tap meant to open the full-screen map.
 */
function MapAttribution({ bottom }: { bottom: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 6,
        // Clear of whatever the caller puts over the map's lower edge — the
        // ride title on a static hero, an overlapping card on the ride summary.
        bottom,
        display: 'flex',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 6,
        background: 'rgba(10,12,15,0.58)',
        backdropFilter: 'blur(4px)',
        fontSize: 9.5,
        lineHeight: 1.5,
        color: 'rgba(255,255,255,0.82)',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <a
        href="https://www.maptoolkit.com/copyright/"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'underline', pointerEvents: 'auto' }}
      >
        © Maptoolkit
      </a>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'underline', pointerEvents: 'auto' }}
      >
        © OpenStreetMap
      </a>
    </div>
  )
}
