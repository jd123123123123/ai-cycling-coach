import { isPresent, type Value } from '../data/value'
import type { RouteOption } from '../data/useSessionModel'
import RouteSketch from '../../components/ui/RouteSketch'
import SecHead from './SecHead'
import { MOTION_DURATION_MS, MOTION_EASE, staggerDelay, useReveal } from '../motion/useReveal'
import { useTapHighlight, type TapHighlight } from '../motion/useTapHighlight'
import { useListNav } from '../motion/useListNav'
import { useCopy } from '../i18n/useCopy'
import { intlLocale } from '../i18n/copy'

/**
 * "04 WHERE TO RIDE IT" (pen `DMMlw`, `J5FV6`). See `useSessionModel.ts`'s
 * own doc comment for the full map of what `GET /routes/mine` supplies and
 * what it doesn't — short version: name, distance, ascent, a ride count and
 * the rider's own recorded GPS track are real; the pen's 44-segment
 * elevation profile, its per-route weather ("Conditions") and its
 * photographs are not, and are never modelled as fabricatable content.
 *
 * TRANSCRIPTION NOTES against `DMMlw`:
 *  - `MzheX` (Section Head): Index "04" Sora 22/800 (colour follows
 *    `var(--st-active)`, not the pen's literal `$st-training`, matching
 *    every other numbered head in this codebase — see `SecHead.tsx`'s own
 *    doc comment). Title `WHERE TO RIDE IT` is 12px Inter/800/ls1.6 in the
 *    live tree — `SecHead`'s `kicker` prop is the closest existing match
 *    (same 12px title, same `#FFFFFF12` chip background); its one known
 *    deviation is the chip LABEL colour (kicker forces `--e-mid`, the pen's
 *    own instance uses the accent) — a shared-component constraint, not
 *    re-litigated here since `SecHead.tsx` belongs to another task's scope.
 *  - `D9Mkk` (Option Row): pen's right-hand text ("1:45 · HOME 19:15") is a
 *    duration/arrival estimate with no source anywhere — this component's
 *    Option Row carries no right-hand text at all rather than a fabricated
 *    time.
 *  - `o3AyPi`/`cCKI1` (Title/Why): the pen's "Why" paragraph is bespoke
 *    editorial copy naming this SESSION's own block count and distances
 *    inside a specific route's kilometre markers — there is no field on
 *    `RouteItem` that could ever produce it, so it is never rendered (the
 *    same "permanently unresolvable slot renders nothing" rule the section
 *    root itself follows for weather).
 *  - `tEq8r` (Plate, the pen's photograph): OWNER'S RULING (2026-08-05) —
 *    these are routes the rider actually rode, so the honest image is
 *    their own recorded track, not a stock photo standing in for it. Drawn
 *    via `components/ui/RouteSketch` (the app's existing GPS-track
 *    renderer — three other call sites already share its projection;
 *    reused here rather than forked) in `var(--st-active)`. A route whose
 *    `polyline` has fewer than two points renders no sketch and shows
 *    `noRouteTrack` instead — never a fallback photo, never a fabricated
 *    shape.
 *  - `gFBpP`/`ilKLz` (Elevation / Ramp Spans, 44 segments each): no source
 *    — `RouteItem` carries no per-point elevation series, only a single
 *    total ascent. Never rendered — not even a flattened/estimated bar set
 *    built from `ascentM` alone (that would be exactly the "plausible
 *    substitute" the missing-data rule forbids). One reason line
 *    (`routeProfileMissing`) prints ONCE for the whole section instead of
 *    once per card, since the reason is identical and permanent for every
 *    route, not a per-row transient gap.
 *  - `bHXcp` (Conditions): no per-route forecast anywhere in this app,
 *    ever — omitted entirely, the same treatment `TodayModel.peaks`/
 *    `planVsRidden` already give a permanent gap.
 *
 * Motion (Task C): `RouteSketch` (`components/ui/RouteSketch.tsx`) is
 * outside this tree and shared by three other call sites, so it is never
 * edited here — it draws its own `<polyline>` with no `pathLength`/
 * `strokeDasharray` hook exposed, and adding one would mean changing a
 * shared component for a single caller's animation. Instead, each card's
 * track wraps `RouteSketch` in a plain container that animates its OWN
 * `clip-path` (`inset(0 100% 0 0)` → `inset(0 0 0 0)`) on first viewport
 * entry — a left-to-right wipe that reads as "the track draws itself in"
 * without touching the sketch's internal geometry, staggered per row via
 * `staggerDelay(index)`. A route with no track (`trackPolyline` missing)
 * never wraps or animates — its reason text renders immediately, like every
 * other missing-state text in this file. Tapping a card selects it: it
 * lifts to `var(--st-active)` (name, option label, stats all move to full
 * accent) while every other card's text drops to `var(--d-2)`
 * (`useTapHighlight`, keyed by `route.key`, shared across all cards so
 * selecting one actually dims its siblings); tapping the same card again
 * restores all three.
 *
 * Interaction (chart-interaction task): the whole section is the one
 * focusable chart (`tabIndex`/`role="group"`/`aria-label`, `useListNav`
 * keyed by each route's own `key`) — Up/Down (or Left/Right) move the
 * highlight card by card, Home/End jump to the first/last route, Escape
 * clears. Every card is already a full-width, well over 44px tall touch
 * target, so no separate hit-target overlay is needed here. `aria-live=
 * "polite"` sits on the section root (already always mounted); the existing
 * "ROUTE SELECTED" label's own conditional render is what gets announced.
 */

const SKETCH_WIDTH = 390
// AUDIT (a3, 2026-08-06): the pen's own Plate (`tEq8r`) is 236px tall, not
// 148 — was rendering the track area at nearly two-thirds the pen's height.
const SKETCH_HEIGHT = 236

export default function RouteOptions({ routes }: { routes: Value<RouteOption[]> }) {
  const { t } = useCopy()
  const tap = useTapHighlight<string>()
  const routeKeys = isPresent(routes) ? routes.value.map((r) => r.key) : []
  const onKeyDown = useListNav(routeKeys, tap)

  return (
    <div
      data-route-options
      role="group"
      aria-label={t('routeOptionsAriaLabel')}
      tabIndex={routeKeys.length > 0 ? 0 : undefined}
      onKeyDown={routeKeys.length > 0 ? onKeyDown : undefined}
      aria-live="polite"
      style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '40px 0 0 0' }}
    >
      <div style={{ width: '100%', padding: '0 24px 24px 24px' }}>
        <SecHead
          index="04"
          title={t('sectionWhereToRideIt')}
          chip={isPresent(routes) ? t('chipRoutesCount', { n: routes.value.length }) : undefined}
          kicker
        />
      </div>

      {isPresent(routes) ? (
        <>
          {routes.value.map((route, i) => (
            <RouteCard key={route.key} route={route} index={i} isLast={i === routes.value.length - 1} tap={tap} />
          ))}
          <p
            style={{
              margin: 0, padding: '20px 24px 8px 24px', fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)',
              fontWeight: 500, color: 'var(--e-quiet)',
            }}
          >
            {t('routeProfileMissing')}
          </p>
        </>
      ) : (
        <p style={{ margin: 0, padding: '0 24px', fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)' }}>
          {routes.missing}
        </p>
      )}
    </div>
  )
}

function RouteCard({
  route,
  index,
  isLast,
  tap,
}: {
  route: RouteOption
  index: number
  isLast: boolean
  tap: TapHighlight<string>
}) {
  const { t, locale } = useCopy()
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const km = route.distanceKm.toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 })
  const statsLine = isPresent(route.ascentM)
    ? t('routeStatsWithAscent', { km, ascent: Math.round(route.ascentM.value), n: route.rideCount })
    : t('routeStatsNoAscent', { km, n: route.rideCount })
  const selected = tap.isSelected(route.key)
  const dimmed = tap.isDimmed(route.key)
  const textColor = selected ? 'var(--st-active)' : dimmed ? 'var(--d-2)' : 'var(--e-ink)'
  const labelColor = selected ? 'var(--st-active)' : dimmed ? 'var(--d-2)' : 'var(--st-active)'

  return (
    <div
      ref={ref}
      data-route-card={route.key}
      onClick={() => tap.toggle(route.key)}
      style={{ width: '100%', cursor: 'pointer' }}
    >
      <div style={{ width: '100%', padding: '0 24px' }}>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4, color: labelColor }}>
          {t('routeOptionLabel', { letter: route.optionLetter })}
        </span>

        {/* Design pass (2026-08-06): --t-title, the same step QuotePlate's
            own quote uses — a route's real name is this card's one bold
            statement (was 24px, one step below the ceiling like the other
            photographic-plate titles were). */}
        <p style={{
          margin: '10px 0 20px 0', fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800,
          letterSpacing: -1, lineHeight: 1.1, color: textColor,
        }}
        >
          {route.name}
        </p>
      </div>

      <div
        data-route-track
        style={{
          width: '100%', height: SKETCH_HEIGHT, background: 'var(--e-ground)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {isPresent(route.trackPolyline) ? (
          <div
            data-route-sketch-wrap
            style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              clipPath: `inset(0 ${on ? 0 : 100}% 0 0)`,
              transition: reduced ? undefined : `clip-path ${MOTION_DURATION_MS}ms ${MOTION_EASE} ${staggerDelay(index)}ms`,
            }}
          >
            <RouteSketch
              polyline={route.trackPolyline.value}
              width={SKETCH_WIDTH}
              height={SKETCH_HEIGHT}
              pad={28}
              strokeWidth={2.5}
              color="var(--st-active)"
              endpoints
              fluid
              renderHeight={SKETCH_HEIGHT}
              ariaLabel={route.name}
            />
          </div>
        ) : (
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)' }}>
            {route.trackPolyline.missing}
          </span>
        )}
      </div>

      <div style={{ width: '100%', padding: '10px 24px 0 24px' }}>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.2, color: dimmed ? 'var(--d-2)' : 'var(--e-quiet)' }}>
          {statsLine}
        </span>
        {selected && (
          <span style={{ display: 'block', marginTop: 6, fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4, color: 'var(--st-active)' }}>
            {t('routeSelected')}
          </span>
        )}
      </div>

      {!isLast && (
        // AUDIT (a3, 2026-08-06): pen's Divider (`CvKfF`) padding is [36,24]
        // (top/bottom 36), not 30.
        <div style={{ width: '100%', padding: '36px 24px' }}>
          <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
        </div>
      )}
    </div>
  )
}
