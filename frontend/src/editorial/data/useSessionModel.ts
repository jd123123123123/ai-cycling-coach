import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTodaySession, sessionIntensity } from '../../hooks/useTodaySession'
import type { ResolvedBlock } from '../../api/coach'
import { apiClient } from '../../api/client'
import type { Claim } from './useTodayModel'
import { fromNullable, isPresent, missing, present, type Value } from './value'
import { translate, useCopy } from '../i18n/useCopy'
import { EDITORIAL_DEFAULT_LOCALE, type Locale } from '../i18n/copy'

/**
 * Session Detail's own view-model (pen `J5FV6`). Consumes `useTodaySession`
 * (which already wraps `useCoachBrief` — this screen has no `:id`-scoped
 * fetch anywhere in the app: `GET /coach/workout/export` (the CTA's real
 * export path, see `SessionCta.tsx`) also serves only TODAY's prescribed
 * workout, no id parameter. `/e/session/:id` is routed but the id is not
 * consumed — matching the V4 route rehearsal page's own resolution for a
 * backend that is honestly not id-addressable here yet.
 *
 * PEN CORRECTION (2026-08-05 re-read of `J5FV6`): the brief's own copy of
 * this screen's tree names a `02 HOW TO RIDE IT` section between `01 The
 * Blocks` and `03 THE PAYOFF` — the current tree has no such section. The
 * real children, in order, are: StatusBar · Nav · Hero · `01 The Blocks` ·
 * Quote Plate · `03 THE PAYOFF` · `04 WHERE TO RIDE IT` · CTA.
 *
 * CORRECTION (2026-08-05, owner's ruling): `04 WHERE TO RIDE IT` DOES have a
 * real source after all — `GET /routes/mine` (`RoutesResponse`, defined
 * locally below; the working reference for its shape is
 * `pages/ExploreRoutesView.tsx`, which this file does not import from —
 * `editorial/` stays a one-way dependency on `api/`, never on sibling
 * page trees). What that endpoint supplies and what it doesn't:
 *
 *  - Route name, distance (`distance_km`), ascent (`elevation_m`) and a
 *    ride count (`times_ridden`) are real fields on `RouteItem` — these
 *    feed `RouteOption` below and the "OPTION A/B/C" rows in
 *    `components/RouteOptions.tsx`.
 *  - The pen's 44-segment elevation PROFILE (a per-metre climb curve) has
 *    no source — `RouteItem` carries a start coordinate and a polyline, not
 *    an elevation series — so the profile is never modelled as a `Value`
 *    at all (there is nothing that could ever resolve it); the row's real
 *    fields still render, and the section prints one quiet reason once
 *    (`routeProfileMissing`) rather than three identical dashed charts.
 *  - The pen's per-route hyperlocal weather (temperature/wind/sunset) has
 *    no source either — no forecast is ever fetched per historic route —
 *    so it is simply never rendered, the same "permanent gap renders
 *    nothing" treatment `TodayModel.peaks`/`planVsRidden` already use.
 *  - The pen's three photographs have no source, but a BETTER honest image
 *    does: `RouteItem.polyline`, the rider's own recorded GPS track for a
 *    route they actually rode. `RouteOptions.tsx` draws it with the app's
 *    existing `components/ui/RouteSketch` (three other call sites already
 *    share it — reused here rather than forked, per the owner's ruling) in
 *    the state accent, instead of a stock photo. This is a deliberate
 *    departure from `Cover`/`QuotePlate`'s own "scrim over ground, never a
 *    photo" resolution — those two are atmospheric mood plates with no
 *    factual content to draw instead; a route the rider actually rode does
 *    have one. `trackPolyline` is `missing` when a route's polyline has
 *    fewer than two points — never a fabricated shape.
 *
 * `routes: Value<RouteOption[]>` is `missing` when `available` is false or
 * the list is empty (an honest, single reason — not three dashed rows).
 */

export interface ProgrammeBlock {
  key: string
  name: string
  /** Zone label, e.g. "Z4" — honestly missing when the block carries no zone. */
  note: Value<string>
  minutes: number
  watts: Value<number>
  /** Repeat count folded into this row (consecutive identical blocks
   *  collapsed, matching the pen's "4×" main-set marker) — 1 for a block
   *  that does not repeat. */
  reps: number
  /** The block(s) at the session's own peak wattage — the pen's accent-
   *  ruled "THE MAIN SET" treatment. Same "peak wattage = work interval"
   *  definitional read `Bars.tsx`'s `emphasizeMax` already uses. */
  isMain: boolean
}

export interface PayoffPoint {
  label: string
  tss: Value<number>
  isToday: boolean
}

/** Local mirror of `RouteItem`/`RoutesResponse` (`GET /routes/mine`,
 *  `pages/ExploreRoutesView.tsx`) — kept as this file's own copy rather than
 *  imported, per `editorial/`'s one-way dependency rule (nothing outside
 *  `editorial/` imports from it; this tree may only READ from `api/`). Only
 *  the fields `04 WHERE TO RIDE IT` actually uses are declared. */
interface RouteItem {
  name: string
  times_ridden: number
  distance_km: number
  elevation_m: number | null
  polyline: [number, number][]
}
interface RoutesResponse {
  available: boolean
  n_gps_rides: number
  routes: RouteItem[]
}

export interface RouteOption {
  key: string
  /** "A" / "B" / "C" — the pen's own row index, not data. */
  optionLetter: string
  name: string
  distanceKm: number
  /** `elevation_m` is nullable on the real route — a transient per-route gap. */
  ascentM: Value<number>
  rideCount: number
  /** The real GPS track (`RouteItem.polyline`) — drawn via the app's own
   *  `RouteSketch`, per the owner's ruling that a rider's real recorded
   *  track is the honest image for a route THEY rode, not a stock photo.
   *  Missing when the route carries fewer than two points (`RouteSketch`
   *  itself already treats that as "not a route"; this Value is what lets
   *  the row show a reason instead of a component that silently renders
   *  nothing). */
  trackPolyline: Value<[number, number][]>
}

const OPTION_LETTERS = ['A', 'B', 'C']

function buildRoutes(resp: RoutesResponse | undefined, locale: Locale): Value<RouteOption[]> {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  if (!resp || !resp.available || resp.routes.length === 0) return missing(t('noRoutesAvailable'))
  const options: RouteOption[] = resp.routes.slice(0, 3).map((r, i) => ({
    key: `${r.name}-${i}`,
    optionLetter: OPTION_LETTERS[i] ?? String(i + 1),
    name: r.name,
    distanceKm: r.distance_km,
    ascentM: r.elevation_m != null ? present(r.elevation_m) : missing(t('noRouteAscent')),
    rideCount: r.times_ridden,
    trackPolyline: r.polyline && r.polyline.length >= 2 ? present(r.polyline) : missing(t('noRouteTrack')),
  }))
  return present(options)
}

export interface SessionModel {
  dateLabel: Value<string>
  title: Value<string>
  claim: Value<string>
  /** Hero numeral ("4×8"), its zone qualifier ("Z4") and its sub-line
   *  ("8 MIN BLOCKS") — all three or none, since a numeral half-derived
   *  from a session with no clean repeat pattern is not the shape the pen
   *  specifies (matches `Bars`' own "no clean interval pattern" treatment). */
  numeral: Value<{ text: string; qualifier: string; sub: string }>
  statWatts: Value<number>
  statDurationMin: Value<number>
  statTss: Value<number>
  statInZoneMin: Value<number>
  blocks: Value<ProgrammeBlock[]>
  totalDurationMin: Value<number>
  totalAtThresholdMin: Value<number>
  payoff: Value<PayoffPoint[]>
  payoffClaim: Value<string>
  whatThisChanges: Value<{ onYou: Claim; onThePlan: Claim }>
  /** "04 WHERE TO RIDE IT" — see this file's own doc comment for what maps
   *  from `GET /routes/mine` and what doesn't. */
  routes: Value<RouteOption[]>
  isLoading: boolean
}

function zoneNote(block: ResolvedBlock, locale: Locale): Value<string> {
  if (!Number.isFinite(block.zone) || block.zone <= 0) return missing(translate(locale, 'blockNoZone'))
  return present(translate(locale, 'numeralQualifierZone', { zone: block.zone }))
}

/** Consecutive identical blocks (same name/duration/watts) collapse into one
 *  row with a repeat count — the same definitional read `workIntervalsOf`
 *  in `TodayView.tsx` uses for "the block(s) at peak wattage," applied here
 *  to build the whole programme list, not just the hero numeral. */
function groupBlocks(blocks: ResolvedBlock[], locale: Locale): ProgrammeBlock[] {
  const watts = blocks.map((b) => b.target_watts_high ?? b.target_watts_low ?? null)
  const presentWatts = watts.filter((w): w is number => w != null)
  const maxWatts = presentWatts.length > 0 ? Math.max(...presentWatts) : null

  const rows: ProgrammeBlock[] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    const w = watts[i]
    let reps = 1
    while (
      i + reps < blocks.length
      && blocks[i + reps].name === b.name
      && blocks[i + reps].duration_s === b.duration_s
      && watts[i + reps] === w
    ) {
      reps += 1
    }
    rows.push({
      key: `${b.name}-${i}`,
      name: b.name,
      note: zoneNote(b, locale),
      minutes: (b.duration_s / 60) * reps,
      watts: w != null ? present(w) : missing(translate(locale, 'noWattTarget')),
      reps,
      isMain: maxWatts != null && w === maxWatts,
    })
    i += reps
  }
  return rows
}

function formatMinSec(totalMinutes: number): string {
  const totalSeconds = Math.round(totalMinutes * 60)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export interface SessionModelInputs {
  now: Date
  workout: import('../../api/coach').PrescribedWorkout | null
  brief: import('../../api/coach').CoachBriefResponse | undefined
  isLoading: boolean
  locale?: Locale
  /** `GET /routes/mine` — see this file's own doc comment. `undefined`
   *  while the query has not resolved (not yet fetched, or still loading):
   *  treated the same as "no routes" (`buildRoutes` renders one honest
   *  reason either way; there is no separate loading skeleton for this
   *  section, matching how every other Session Detail section behaves
   *  before its own query resolves). */
  routesResponse?: RoutesResponse
}

/** Pure assembly — no hooks, fully unit-testable (mirrors `buildTodayModel`). */
export function buildSessionModel(inputs: SessionModelInputs): SessionModel {
  const { now, workout, brief, isLoading, locale = EDITORIAL_DEFAULT_LOCALE, routesResponse } = inputs
  const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate(locale, key, vars)
  const de = locale === 'de'

  const dateLabel = present(
    now.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
      .toUpperCase()
      .replace(/[.,]/g, ''),
  )

  const NO_SESSION = t('sessionMissingTitle')
  const title = fromNullable(
    workout ? (de && workout.title_de ? workout.title_de : workout.title) : null,
    NO_SESSION,
  )

  const claim = fromNullable(
    workout ? ((de && workout.purpose_de ? workout.purpose_de : workout.purpose) ?? workout.why_this_workout ?? null) : null,
    workout ? t('sessionClaimMissing') : NO_SESSION,
  )

  const groups = workout ? groupBlocks(workout.blocks, locale) : []
  const blocks: Value<ProgrammeBlock[]> = workout ? present(groups) : missing(NO_SESSION)

  const mainGroup = groups.find((g) => g.isMain && g.reps >= 2) ?? null
  const intensity = sessionIntensity(workout, de)
  const numeral: Value<{ text: string; qualifier: string; sub: string }> = mainGroup
    ? present({
      text: `${mainGroup.reps}×${Math.round(mainGroup.minutes / mainGroup.reps)}`,
      qualifier: intensity?.z ?? '',
      sub: t('numeralSubMinBlocks', { n: Math.round(mainGroup.minutes / mainGroup.reps) }),
    })
    : missing(workout ? t('numeralMissing') : NO_SESSION)

  // The Hero Stats "WATTS" tile — the main set's own target, the number the
  // athlete is actually asked to hold. Falls back to a uniform-across-the-
  // whole-session target only when there is no distinct main set at all
  // (e.g. a flat endurance ride), matching `Bars`' own peak-wattage
  // definitional read of "work interval."
  const uniformAcrossAll = groups.length > 0 && groups.every((g) => isPresent(g.watts) && g.watts.value === (isPresent(groups[0].watts) ? groups[0].watts.value : NaN))
  const statWattsValue = mainGroup && isPresent(mainGroup.watts)
    ? mainGroup.watts.value
    : uniformAcrossAll && isPresent(groups[0]?.watts)
      ? groups[0].watts.value
      : null
  const statWatts = fromNullable(statWattsValue, workout ? t('noWattTarget') : NO_SESSION)

  const totalMinutes = groups.reduce((sum, g) => sum + g.minutes, 0)
  const statDurationMin: Value<number> = workout ? present(Math.round(totalMinutes)) : missing<number>(NO_SESSION)
  const totalDurationMin = statDurationMin

  const statTss = fromNullable(workout?.predicted_tss ?? null, workout ? t('noTss') : NO_SESSION)

  const mainMinutes = groups.filter((g) => g.isMain).reduce((sum, g) => sum + g.minutes, 0)
  const hasMain = mainMinutes > 0
  const statInZoneMin: Value<number> = hasMain ? present(Math.round(mainMinutes)) : missing<number>(workout ? t('noZoneTime') : NO_SESSION)
  const totalAtThresholdMin = statInZoneMin

  // "03 THE PAYOFF" — the next 7 days' suggested load, from the brief's own
  // forward-looking `outlook_7d` (day_offset/suggested_tss/note). Day 0 is
  // today's OWN predicted TSS (already real, from `workout`), not an
  // outlook entry — `outlook_7d` is never observed to carry a day_offset 0
  // row (it is defined as "outlook," i.e. what comes after today).
  const outlook = brief?.outlook_7d ?? null
  const payoffDays: PayoffPoint[] = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const label = d.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', { weekday: 'short' }).toUpperCase().replace(/[.,]/g, '')
    if (i === 0) {
      return { label, tss: workout?.predicted_tss != null ? present(workout.predicted_tss) : missing(t('payoffChartMissing')), isToday: true }
    }
    const entry = outlook?.find((o) => o.day_offset === i) ?? null
    return { label, tss: entry != null ? present(entry.suggested_tss) : missing(t('payoffChartMissing')), isToday: false }
  })
  const anyPayoffPresent = payoffDays.some((p) => isPresent(p.tss))
  const payoff: Value<PayoffPoint[]> = anyPayoffPresent ? present(payoffDays) : missing(t('payoffChartMissing'))

  // No source anywhere computes the pen's own narrative claim ("you buy
  // this with two flat days...") from real numbers — a genuinely permanent
  // gap, matching `TodayModel.peaks`/`planVsRidden`'s own treatment, not a
  // transient one this task can safely fabricate.
  const payoffClaim: Value<string> = missing(t('payoffClaimMissing'))

  // ON YOU / ON THE PLAN — identical derivation to `TodayModel.whatThisChanges`
  // (adaptations + post-ride review, never `outlook_7d`, which is a
  // different claim entirely).
  const adaptations = brief?.adaptations ?? null
  const postRideReview = brief?.post_ride_review ?? null
  const whatThisChanges = fromNullable(
    adaptations == null && postRideReview == null ? null : {
      onYou: {
        claim: postRideReview?.physiological_read ?? adaptations!.summary,
        detail: postRideReview?.goal_trajectory ?? adaptations!.changes[0]?.detail ?? adaptations!.summary,
      },
      onThePlan: {
        claim: adaptations?.summary ?? postRideReview!.next_session_nudge,
        detail: postRideReview?.next_session_nudge
          ?? adaptations!.changes[0]?.detail
          ?? adaptations!.summary,
      },
    },
    t('whatThisChangesMissing'),
  )

  const routes = buildRoutes(routesResponse, locale)

  return {
    dateLabel,
    title,
    claim,
    numeral,
    statWatts,
    statDurationMin,
    statTss,
    statInZoneMin,
    blocks,
    totalDurationMin,
    totalAtThresholdMin,
    payoff,
    payoffClaim,
    whatThisChanges,
    routes,
    isLoading,
  }
}

/** Assembles inputs from the live hooks and returns the pure model. */
export function useSessionModel(): SessionModel {
  const { locale } = useCopy()
  const now = useMemo(() => new Date(), [])
  const session = useTodaySession()
  const isLoading = session.brief === undefined && !session.workout

  // Same query the working reference (`ExploreRoutesView.tsx`) uses for
  // "04 WHERE TO RIDE IT"'s real fields — same key, so both screens share
  // one cache entry, and same 30-minute staleTime (a rider's ridden-route
  // history changes at most once a session).
  const { data: routesResponse } = useQuery<RoutesResponse>({
    queryKey: ['routes', 'mine'],
    queryFn: async () => (await apiClient.get<RoutesResponse>('/routes/mine')).data,
    staleTime: 30 * 60 * 1000,
  })

  return buildSessionModel({
    now,
    workout: session.workout,
    brief: session.brief,
    isLoading,
    locale,
    routesResponse,
  })
}

export { formatMinSec }
