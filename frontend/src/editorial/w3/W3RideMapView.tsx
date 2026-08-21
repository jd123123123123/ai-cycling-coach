import { Suspense, lazy, useState } from 'react'
import { ChevronLeft, Mountain, Moon } from 'lucide-react'
import { T, FONT } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3_MAP } from './w3map'
import { GRADE_LEGEND, gradeColours } from './gradeColours'
import './w3.css'

const RouteMap = lazy(() => import('../../components/crew/RouteMap'))

/**
 * W3 · the route, full screen and actually pannable.
 *
 * WHY THIS IS A SEPARATE PAGE. The map on the ride summary is deliberately
 * inert — `interactive: false` — because a map embedded in a scrolling page
 * that eats one-finger pans is the oldest trap on mobile: the rider swipes to
 * read on, the map pans instead, and they end up stranded over a field in
 * Belgium. The industry answer is that the inline map is a PICTURE and tapping
 * it opens one you can actually use. This is that one.
 *
 * TWO STYLES, BOTH REAL. `cycling` carries contour lines and hillshading, which
 * is the whole reason to look closely at a route in a cycling app: it shows you
 * the shape of the climb you just did. `dark` is the quiet one that matches the
 * rest of W3. This is a toggle between two genuine basemaps, not a fake
 * "Satellite" button over imagery we do not have.
 */
export interface W3RideMapViewProps {
  /** The ride's own GPX. Null renders the honest empty state. */
  polyline: [number, number][] | null
  /** Percent gradient per point. Paints the road by how steep it is — the one
   *  thing a cycling map can say that a general-purpose one cannot. Absent
   *  leaves the route in its plain accent. */
  grades?: number[] | null
  onBack?: () => void
}

export default function W3RideMapView({ polyline, grades, onBack }: W3RideMapViewProps) {
  // Two modes, two jobs. FLACH is the app's own register and the resting
  // state; BERGE drapes the same dark map over real elevation and tilts into
  // it. Contour lines and 3D answer the same question — what shape is this
  // climb — so having both as separate styles was three modes doing two jobs.
  const [threeD, setThreeD] = useState(false)
  const ramp = gradeColours(grades, polyline?.length ?? 0)

  const hasRoute = polyline != null && polyline.length > 1

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.bg, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          {hasRoute ? (
            <Suspense fallback={null}>
              <RouteMap
                polyline={polyline}
                // The DARK basemap in both modes: switching the cartography as
                // well as the projection made the toggle feel like two
                // different maps rather than one map seen two ways.
                styleKey="dark"
                terrain={threeD}
                interactive
                palette={W3_MAP}
                lineColors={ramp ?? undefined}
              lineColor={T.acid}
                lineWidth={6}
                startColor={T.ink}
                endColor={T.acid} />
            </Suspense>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 40 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.mid, textAlign: 'center', lineHeight: 1.5 }}>
                Diese Fahrt hat keine GPS-Spur — es gibt keine Route zu zeigen.
              </span>
            </div>
          )}
        </div>

        {/* A scrim under the chrome, and it is not decoration. `cycling` is a
            LIGHT basemap — that is what makes its contours and hillshading
            readable — and the status bar and both controls are white-on-dark
            everywhere else in W3. Without this they vanish the moment Relief is
            selected: the clock, the battery and the back button all sit
            invisible on pale green. */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 140, zIndex: 1,
          pointerEvents: 'none',
          background: `linear-gradient(180deg, ${T.bg}F2 0%, ${T.bg}B3 45%, ${T.bg}00 100%)`,
        }} />

        {/* The legend, and ONLY when the line is coloured. A key for a colour
            scheme that is not on screen is furniture. */}
        {ramp && (
          <div style={{
            position: 'absolute', bottom: 'calc(26px + env(safe-area-inset-bottom))',
            left: 16, zIndex: 3, display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 100, border: `1px solid ${T.stroke}`,
            background: `${T.bg}A6`, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          }}>
            {GRADE_LEGEND.map((g) => (
              <span key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 4, borderRadius: 100, background: g.colour, flex: 'none' }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.mid }}>{g.label}</span>
              </span>
            ))}
          </div>
        )}

        <div style={{ position: 'relative', zIndex: 2 }}><W3StatusBar /></div>

        <div style={{
          position: 'absolute', top: 54, left: 16, right: 16, zIndex: 3,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
        }}>
          <button onClick={onBack} aria-label="Zurück" style={{
            width: 42, height: 42, borderRadius: 100, border: `1px solid ${T.stroke}`,
            background: `${T.bg}A6`, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none',
          }}><ChevronLeft size={19} color={T.ink} /></button>

          {hasRoute && (
            <div style={{
              display: 'flex', gap: 4, padding: 4, borderRadius: 100,
              border: `1px solid ${T.stroke}`, background: `${T.bg}A6`,
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            }}>
              {([[true, 'Berge', Mountain], [false, 'Flach', Moon]] as const).map(([k, label, Icon]) => {
                const on = threeD === k
                return (
                  <button key={label} onClick={() => setThreeD(k)} style={{
                    display: 'flex', alignItems: 'center', gap: 5, height: 34, padding: '0 13px',
                    borderRadius: 100, border: 0, cursor: on ? 'default' : 'pointer',
                    background: on ? T.acid : 'transparent',
                    color: on ? T.heroInk : T.mid,
                    fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
                  }}>
                    <Icon size={13} color={on ? T.heroInk : T.mid} />{label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
