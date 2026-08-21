import { Route as RouteIcon, Mountain, Repeat, MonitorSmartphone, ChevronRight } from 'lucide-react'
import { useRecommendedRoute } from '../../hooks/useRecommendedRoute'
import { T, FONT } from './w3tokens'

/**
 * W3 · WHERE TO RIDE THIS ONE — the recommended road, inside the session card.
 *
 * WHY IT BELONGS HERE AND NOT ONLY ON TODAY. "Where do I ride this?" is asked
 * about a SESSION, and the session is what this card is. A single card further
 * down the page could only ever answer for today; a rider looking at Thursday's
 * 4x8 wants Thursday's answer, and got nothing.
 *
 * INDOORS FLIPS WHAT IS EVEN RIDEABLE. Suggesting a mountain road for a 2x20 on
 * the trainer is not a slightly worse recommendation, it is an unusable one —
 * so when the rider takes the session indoors, this asks for trainer routes
 * instead and says so. That is why `indoor` is wired to the ADAPTATION rather
 * than to a static flag: it changes the moment they change their mind.
 *
 * Every route here is one they have ridden before (`services/route_library`
 * clusters their own GPS rides), which is why it can say "8x gefahren". It
 * renders nothing when there is no history to draw on, and nothing on a rest
 * day — a road recommended for a day off is noise.
 */

export interface W3DayRouteProps {
  /** The session's own targets. Null on a day with nothing planned. */
  targetTss: number | null
  durationMinutes: number | null
  category?: string | null
  /** True once the rider has taken this session indoors. */
  indoor?: boolean
  onOpen?: () => void
}

const fmtTime = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, '0')} Std.`

export default function W3DayRoute({
  targetTss, durationMinutes, category, indoor = false, onOpen,
}: W3DayRouteProps) {
  const hasTarget = (targetTss ?? 0) > 0 || (durationMinutes ?? 0) > 0
  const { data } = useRecommendedRoute(
    { target_tss: targetTss, duration_minutes: durationMinutes, category, indoor },
    hasTarget,
  )
  const top = data?.available ? data.top : null
  if (!top) return null

  const r = top.route
  const Icon = r.is_virtual ? MonitorSmartphone : RouteIcon

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '13px 15px', borderRadius: 18, border: 0, cursor: onOpen ? 'pointer' : 'default',
        background: T.heroChip, fontFamily: FONT, textAlign: 'left',
      }}>
      <div style={{
        width: 34, height: 34, flex: 'none', borderRadius: 11,
        background: T.acidDim, display: 'grid', placeItems: 'center',
      }}>
        <Icon size={16} color={T.acid} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{
            minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.ink,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{r.name}</span>
          <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Repeat size={10} color={T.quiet} />
            <span style={{ fontSize: 10, fontWeight: 700, color: T.quiet }}>{r.times_ridden}×</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: T.mid }}>
            {r.distance_km.toLocaleString('de-DE')} km
          </span>
          {r.elevation_m != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Mountain size={10} color={T.quiet} />
              <span style={{ fontSize: 10.5, fontWeight: 600, color: T.mid }}>
                {Math.round(r.elevation_m).toLocaleString('de-DE')} m
              </span>
            </span>
          )}
          {r.avg_time_s != null && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: T.mid }}>{fmtTime(r.avg_time_s)}</span>
          )}
        </div>
      </div>

      {onOpen && <ChevronRight size={16} color={T.quiet} style={{ flex: 'none' }} />}
    </button>
  )
}
