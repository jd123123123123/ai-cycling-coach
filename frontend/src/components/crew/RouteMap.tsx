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
 * Maptoolkit's licence requires a clickable "© Maptoolkit © OpenStreetMap"
 * bottom-right on every map. Their TileJSON already supplies exactly that, and
 * MapLibre's AttributionControl renders it — so nothing is passed manually
 * (doing so duplicated the notice). Shown `compact`, i.e. an (i) badge that
 * expands on tap, because the full bar spans the hero and covers the title.
 *
 * Their terms ALSO require the Maptoolkit logo alongside the text. That asset is
 * not bundled here, so this is NOT yet fully compliant — flagged in the deploy
 * runbook as a blocker for shipping the map to production.
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
  className?: string
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

export default function RouteMap({
  polyline, waypoints = [], styleKey = 'dark', interactive = false, onReady, className,
}: RouteMapProps) {
  const holder = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [failed, setFailed] = useState(false)

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
          fitBoundsOptions: { padding: interactive ? 48 : 34, animate: false },
          interactive,
          cooperativeGestures: interactive,
          attributionControl: false,
          // The route and pins carry the meaning; a compass and scale on a
          // 290px preview are chrome competing with them.
          dragRotate: false,
          pitchWithRotate: false,
        })
        mapRef.current = map

        // Attribution comes from the TILEJSON, which already ships a compliant
        // "© Maptoolkit © Openstreetmap" with both links. Passing our own
        // `customAttribution` APPENDED to it and rendered the notice twice.
        // `compact` collapses it to an (i) badge — expanded, the white bar spans
        // the hero and sits straight over the ride title.
        const attrib = new maplibre.AttributionControl({ compact: true })
        map.addControl(attrib, 'bottom-right')
        // MapLibre opens the compact notice whenever the container is wide
        // enough. On the preview that is a full-width white bar over the title,
        // so it starts closed; the (i) badge still expands it on tap.
        requestAnimationFrame(() => {
          const el = holder.current?.querySelector('details.maplibregl-ctrl-attrib')
          el?.removeAttribute('open')
          el?.classList.remove('maplibregl-compact-show')
        })
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
          const coords = polyline.map(([lat, lng]) => [lng, lat])

          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
          })
          // Casing then line, the way the pen layers them — a white casing is
          // what keeps a coloured route legible over both dark forest and pale
          // water at any zoom.
          map.addLayer({
            id: 'route-casing', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#FFFFFF', 'line-width': 7, 'line-opacity': 0.9 },
          })
          map.addLayer({
            id: 'route-line', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#FF5A3C', 'line-width': 4 },
          })

          const [startLat, startLng] = polyline[0]
          const [endLat, endLng] = polyline[polyline.length - 1]
          const dot = (color: string, size: number) => {
            const el = document.createElement('div')
            el.style.cssText = `width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 0 10px ${color}99`
            return el
          }
          new maplibre.Marker({ element: dot('#16E08A', 15) }).setLngLat([startLng, startLat]).addTo(map)
          new maplibre.Marker({ element: dot('#FF5A3C', 15) }).setLngLat([endLng, endLat]).addTo(map)

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
    }
    // `waypoints`/`onReady` are intentionally excluded: they arrive with the
    // same fetch as `polyline`, and including them would tear the map down and
    // rebuild it on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyline, styleKey, interactive, failed])

  if (polyline.length < 2 || failed) return null
  return (
    <div ref={holder} className={className} style={{ position: 'absolute', inset: 0 }} aria-hidden={!interactive}>
      {/* Attribution is licence-required and stays exactly as MapLibre renders
          it — restyling it turned into a specificity fight with their stylesheet
          and produced a white-on-white pill. Instead it is only LIFTED clear of
          the ride title (MapLibre pins it bottom-right, which is where the
          date/host line sits) and left collapsed to its (i) badge, which is the
          standard compact pattern: the notice is one tap away and fully legible
          when opened, rather than a wide white bar across the hero. */}
      {!interactive && (
        <style>{`
          .maplibregl-ctrl-bottom-right { bottom: 58px }
        `}</style>
      )}
    </div>
  )
}
