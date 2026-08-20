import { motion, useReducedMotion } from 'motion/react'
import { Route as RouteIcon, Mountain, TrendingUp, Trophy, ChevronRight } from 'lucide-react'
import { useRecommendedRoute } from '../../hooks/useRecommendedRoute'
import { T, EASE, band } from './w3tokens'
import { S, lux } from './w3surfaces'
import type { RouteMatch } from '../../api/routeRecommendation'

/**
 * W3 · TODAY — "Empfohlene Route", from pen frame `Vt2TQ` (`lrOUf`).
 *
 * WHAT MAKES THIS DIFFERENT FROM A ROUTE SUGGESTION. Every road on this card is
 * one the rider has actually been down — the library is clustered from their own
 * GPS rides, and the ranking scores those roads against today's planned session
 * (`services/route_recommendation`). So this is a REMINDER, not a discovery
 * feature, and that is why `times_ridden` sits in the header rather than buried
 * in a detail view: "6× gefahren" is the whole reason to trust the line under
 * it. A route database the rider has no relationship with could not earn that
 * sentence, which is why the app does not have one.
 *
 * WHY THE MAP IS DRAWN AND NOT TILED. This thumbnail is 104 px square, at which
 * size a basemap is noise — no label is legible and no road is distinguishable
 * from the route on top of it. The SHAPE is the recognisable thing at this size:
 * a rider knows their own loop by its outline. The full basemap lives one tap
 * away on the ride page, where there is room for it to mean something.
 *
 * IT RENDERS NOTHING RATHER THAN GUESSING. No planned ride, no GPS history, or
 * nothing worth matching — each returns `available: false` with a machine
 * reason, and the card either says the one useful thing or disappears. A road
 * recommended for a rest day is worse than silence.
 */

/** The route's own outline, normalised into the tile.
 *
 *  Latitude is compressed by cos(lat) so the loop keeps its real proportions —
 *  at 52° N an uncorrected drawing is about 40 % too wide, and a rider
 *  recognises their own roads well enough to notice the difference. */
function project(poly: [number, number][], size: number, pad = 12) {
  const lats = poly.map((p) => p[0]), lngs = poly.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const kx = Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180)
  const gw = (maxLng - minLng) * kx || 1e-6
  const gh = (maxLat - minLat) || 1e-6
  const scale = Math.min((size - 2 * pad) / gw, (size - 2 * pad) / gh)
  const ox = pad + ((size - 2 * pad) - gw * scale) / 2
  const oy = pad + ((size - 2 * pad) - gh * scale) / 2
  const pts = poly.map(([lat, lng]): [number, number] => [
    ox + (lng - minLng) * kx * scale,
    oy + (maxLat - lat) * scale,
  ])
  return {
    pts,
    d: pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '),
  }
}

const TILE = 104

function Thumb({ poly, reduce }: { poly: [number, number][] | null; reduce: boolean | null }) {
  return (
    <div style={{
      width: TILE, height: TILE, flex: 'none', borderRadius: 20, overflow: 'hidden',
      background: `radial-gradient(120% 120% at 30% 20%, ${T.acid}14, transparent 70%), ${T.tile ?? T.heroDock}`,
      display: 'grid', placeItems: 'center',
    }}>
      {poly && poly.length > 1 ? (() => {
        const { d, pts } = project(poly, TILE)
        return (
          <svg width={TILE} height={TILE} viewBox={`0 0 ${TILE} ${TILE}`} aria-hidden>
            <path d={d} fill="none" stroke={`${T.acid}33`} strokeWidth={7}
              strokeLinecap="round" strokeLinejoin="round" />
            <motion.path d={d} fill="none" stroke={T.acid} strokeWidth={2.4}
              strokeLinecap="round" strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: EASE }} />
            {/* Where it starts, which on a loop is also where it ends — the one
                mark that tells a rider which way round the outline they read. */}
            <circle cx={pts[0][0]} cy={pts[0][1]} r={3.5} fill={T.ink} />
          </svg>
        )
      })() : (
        <RouteIcon size={26} color={T.quiet} />
      )}
    </div>
  )
}

/** One fact with an icon. Never a chip — three bordered pills in a 198 px column
 *  is the busy idiom, and these are read as a line, not tapped. */
function Fact({ Icon, children }: { Icon: typeof RouteIcon; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
      <Icon size={12} color={T.quiet} />
      <span style={{ fontSize: 12, fontWeight: 600, color: T.mid, whiteSpace: 'nowrap' }}>{children}</span>
    </span>
  )
}

/**
 * The sentence under the name — why THIS road, today.
 *
 * Built from the score breakdown the API already returns, so it can only ever
 * claim what actually matched. The API states which terms fit and how well and
 * deliberately owns none of the wording; inventing a reason here that the
 * scoring did not produce is the one thing this card must not do.
 */
function why(m: RouteMatch): string {
  const r = m.route
  const bits: string[] = []
  if ((m.duration_fit ?? 0) > 0.8) bits.push('Länge passt zur geplanten Dauer')
  if ((m.tss_fit ?? 0) > 0.8) bits.push('Belastung trifft das Tagesziel')
  if ((m.climb_fit ?? 0) > 0.8 && r.longest_climb_m) {
    bits.push(`der lange Anstieg misst ${Math.round(r.longest_climb_m)} m`)
  } else if ((m.terrain_fit ?? 0) > 0.8) {
    bits.push('das Profil passt zur Einheit')
  }
  if (bits.length === 0) return 'Von deinen Strecken die, die heute am besten passt.'
  const head = bits.slice(0, 2).join(' und ')
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}.`
}

const fmtTime = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, '0')} Std.`

/**
 * The card as a pure function of one ranked match, so it can be rendered from a
 * preview route. `W3RouteCard` owns the fetch.
 */
export function W3RouteCardView({ top }: { top: RouteMatch | null | undefined }) {
  const reduce = useReducedMotion()
  if (!top) return null

  const r = top.route
  return (
    <div style={band(26)}>
      <div style={{ ...lux(28), padding: S.xl, gap: S.lg }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>
            EMPFOHLENE ROUTE
          </span>
          {/* The trust line. `times_ridden` is what separates a reminder from a
              recommendation, so it leads — and `is_low_confidence` is the
              server's own flag for "right shape, thin evidence", which the card
              says out loud rather than hiding behind a score. */}
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.acid }}>
            {r.times_ridden}× GEFAHREN{top.is_low_confidence ? '' : ' · BESTE WAHL'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: S.lg, alignItems: 'center' }}>
          <Thumb poly={r.polyline ?? null} reduce={reduce} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{
              fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: T.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{r.name}</span>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Fact Icon={RouteIcon}>{r.distance_km.toLocaleString('de-DE')} km</Fact>
              {r.elevation_m != null && <Fact Icon={Mountain}>{Math.round(r.elevation_m).toLocaleString('de-DE')} m</Fact>}
              {r.avg_time_s != null && <Fact Icon={TrendingUp}>{fmtTime(r.avg_time_s)}</Fact>}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
              {why(top)}
            </span>
          </div>
        </div>

        {/* The record, only when there is one. A personal best on this exact
            road is the strongest reason to choose it, and an absent one is
            simply not mentioned. */}
        {r.best_time_s != null && r.times_ridden > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
            borderRadius: 18, background: T.heroChip,
          }}>
            <Trophy size={15} color={T.acid} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid, flex: 1, minWidth: 0 }}>
              Deine Bestzeit hier: <span style={{ color: T.ink, fontWeight: 700 }}>{fmtTime(r.best_time_s)}</span>
            </span>
            <ChevronRight size={15} color={T.quiet} />
          </div>
        )}
      </div>
    </div>
  )
}


export default function W3RouteCard() {
  const { data } = useRecommendedRoute()
  return <W3RouteCardView top={data?.available ? data.top : null} />
}
