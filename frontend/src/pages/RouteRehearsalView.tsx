/**
 * RouteRehearsalView — `/rehearse/:id`, the surface eight tasks of engine work
 * exist to produce: what this route will actually do to you.
 *
 * Layout, top to bottom: the verdict (always a RANGE, never a bare time) →
 * the scrubbable elevation profile → a readout for whatever point of the road
 * the finger is on → the climbs and what each costs in W′ → fuelling → the
 * assumptions the whole projection rests on.
 *
 * The assumptions sit at the BOTTOM on purpose. They are the answer to "why
 * does it say that?", which is a question the athlete only asks after reading
 * the verdict — and putting them first would read as a form to fill in before
 * the app will talk to you.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { useLocale } from '../contexts/LocaleContext'
import {
  getRehearsal,
  updateAssumptions,
  type Draft,
  type Effort,
  type Rehearsal,
} from '../api/rehearsal'
import RehearsalProfile from '../components/rehearsal/RehearsalProfile'
import WPrimeTrace from '../components/rehearsal/WPrimeTrace'
import VerdictBlock from '../components/rehearsal/VerdictBlock'
import ClimbCards from '../components/rehearsal/ClimbCards'
import AssumptionsRow from '../components/rehearsal/AssumptionsRow'
import RouteMap from '../components/crew/RouteMap'
import RouteSketch from '../components/ui/RouteSketch'
import {
  blowUpIndices,
  polylineFromSegments,
  polylineIndices,
  powerColors,
} from '../components/rehearsal/rehearsalMap'
import { useRehearsalPlayback } from '../hooks/useRehearsalPlayback'
import {
  blowUpCeilingW,
  climbLabel,
  elevationsFromSegments,
  formatDecimal,
  formatHms,
  wPrimeCapacity,
} from '../components/rehearsal/rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../components/dashboard/glassCard'

const PROFILE_HEIGHT = 150

export default function RouteRehearsalView() {
  const { id } = useParams()
  const rehearsalId = Number(id)
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const queryClient = useQueryClient()

  const [scrubIdx, setScrubIdx] = useState<number | null>(null)

  const { data, isLoading, isError } = useQuery<Rehearsal>({
    queryKey: ['rehearsal', rehearsalId],
    queryFn: () => getRehearsal(rehearsalId),
    enabled: Number.isFinite(rehearsalId),
    staleTime: 5 * 60 * 1000,
  })

  // The profile is an SVG with an explicit viewBox, so it needs a real pixel
  // width. Measured rather than hard-coded because the shell's padding differs
  // between 390 px phones and the 640 px capped reading column.
  const profileBoxRef = useRef<HTMLDivElement>(null)
  const [profileWidth, setProfileWidth] = useState(358)
  const segmentCount = data?.segments.length ?? 0
  useEffect(() => {
    const el = profileBoxRef.current
    if (!el) return
    const apply = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setProfileWidth(w)
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
    // Re-runs when the profile box first appears — it is only rendered once the
    // rehearsal has loaded, so there is nothing to measure on the first pass.
  }, [segmentCount])

  const mutation = useMutation({
    mutationFn: (patch: { draft?: Draft; effort?: Effort; use_weather?: boolean }) =>
      updateAssumptions(rehearsalId, patch),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['rehearsal', rehearsalId], fresh)
      setScrubIdx(null)
    },
  })

  const segments = useMemo(() => data?.segments ?? [], [data])
  const elevations = useMemo(() => elevationsFromSegments(segments), [segments])
  const wPrime = useMemo(() => wPrimeCapacity(segments), [segments])

  // ── The map, and the one index that drives everything ──────────────────
  const routeLine = useMemo(() => polylineFromSegments(segments), [segments])
  const routeIdxs = useMemo(() => polylineIndices(segments), [segments])
  const routeColors = useMemo(() => powerColors(segments), [segments])
  const blowUpIdxs = useMemo(
    () => blowUpIndices(segments, data?.blow_ups ?? []),
    [segments, data],
  )
  const [mapReady, setMapReady] = useState(false)

  const { playIdx, playing, skip, replay } = useRehearsalPlayback({
    rehearsalId,
    count: segments.length,
    enabled: !isLoading && segments.length > 1,
  })

  // A finger always wins over the film — touching the profile IS the skip.
  const activeIdx = scrubIdx ?? playIdx
  const onScrubShared = useCallback(
    (i: number | null) => {
      if (i != null && playing) skip()
      setScrubIdx(i)
    },
    [playing, skip],
  )

  // Where to put the dot on the map. `routeIdxs` maps map-vertex → segment, so
  // this walks it backwards: the nearest drawn vertex at or before the cursor.
  const markerLatLng = useMemo<[number, number] | null>(() => {
    if (activeIdx == null || routeLine.length === 0) return null
    let best = 0
    for (let k = 0; k < routeIdxs.length; k++) {
      if (routeIdxs[k] <= activeIdx) best = k
      else break
    }
    return routeLine[best] ?? null
  }, [activeIdx, routeIdxs, routeLine])

  const blowUp = data?.blow_ups?.[0] ?? null
  const blowUpClimb = useMemo(() => {
    if (!blowUp || blowUp.climb_id == null || !data) return null
    const climb = data.climbs.find((c) => c.climb_id === blowUp.climb_id)
    return climb ? climbLabel(climb, de) : null
  }, [blowUp, data, de])

  const header = (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={de ? 'Zurück' : 'Back'}
        className="grid place-items-center rounded-full"
        style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
      >
        <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
      </button>
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
      >
        {de ? 'PROBEFAHRT' : 'ROUTE REHEARSAL'}
      </span>
      <div style={{ width: 40 }} />
    </div>
  )

  const shell = (children: React.ReactNode) => (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        {header}
        {children}
      </div>
    </DashboardShell>
  )

  if (isLoading) {
    return shell(
      <p style={{ fontSize: 14, color: 'var(--color-muted)' }}>
        {de ? 'Fahre die Strecke im Kopf ab …' : 'Riding the route in our head…'}
      </p>,
    )
  }

  if (isError || !data) {
    return shell(
      <p style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
        {de
          ? 'Diese Probefahrt konnten wir nicht laden.'
          : 'We could not load this rehearsal.'}
      </p>,
    )
  }

  // The readout follows the shared cursor, so it narrates the film as it plays
  // instead of sitting on its placeholder until someone touches the screen.
  const scrubbed = activeIdx != null ? segments[activeIdx] ?? null : null
  const title = data.name ?? (de ? 'Unbenannte Strecke' : 'Unnamed route')

  return shell(
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 620, color: 'var(--color-ink)', letterSpacing: '-0.02em', margin: 0 }}>
          {title}
        </h1>
        <span style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
          {`${formatDecimal(data.distance_m / 1000, de)} km · ${Math.round(data.ascent_m)} ${de ? 'Hm' : 'm up'}`}
        </span>
      </div>

      {/* ── MapHero: where the road actually runs, coloured by target watts ──
          The SVG sketch is drawn first and stays until MapLibre reports a
          painted frame, so a blocked tile host or a phone without WebGL still
          shows the route rather than an empty black box. */}
      {routeLine.length > 1 && (
        <section
          style={{
            position: 'relative',
            borderRadius: 20,
            overflow: 'hidden',
            height: 232,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-rule)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              opacity: mapReady ? 0 : 1,
              transition: 'opacity 320ms ease',
            }}
          >
            <RouteSketch
              polyline={routeLine}
              width={358}
              height={232}
              color="var(--color-accent)"
              strokeWidth={2.5}
              halo
              endpoints
              ariaLabel={de ? 'Streckenverlauf' : 'Route outline'}
            />
          </div>
          <RouteMap
            polyline={routeLine}
            lineColors={routeColors.length === routeLine.length ? routeColors : undefined}
            markerLatLng={markerLatLng}
            styleKey="dark"
            onReady={() => setMapReady(true)}
          />
          {/* One control, two jobs: it interrupts the film while it runs, and
              afterwards it is the only way back to it — the film plays by
              itself exactly once per rehearsal, and a rider who skipped it or
              came back later should not have to clear storage to see it. */}
          <button
            type="button"
            onClick={playing ? skip : replay}
            aria-label={
              playing
                ? (de ? 'Durchfahrt überspringen' : 'Skip the fly-through')
                : (de ? 'Durchfahrt abspielen' : 'Play the fly-through')
            }
            style={{
                position: 'absolute',
                top: 10,
                right: 10,
                padding: '5px 11px',
                borderRadius: 999,
                background: 'rgba(10,12,15,0.72)',
                border: '1px solid rgba(255,255,255,0.22)',
                backdropFilter: 'blur(8px)',
                fontSize: 11,
                fontWeight: 700,
              color: '#fff',
            }}
          >
            {playing
              ? (de ? 'Überspringen' : 'Skip')
              : (de ? 'Durchfahrt' : 'Fly through')}
          </button>
        </section>
      )}

      <VerdictBlock
        band={data.band}
        blowUpKm={blowUp ? blowUp.distance_m / 1000 : null}
        blowUpClimb={blowUpClimb}
        blowUpWatts={blowUp ? blowUpCeilingW(segments, blowUp.distance_m) : null}
        cdaIsDefault={data.cda_is_default}
        durabilityIsDefault={data.durability_is_default}
        wPrimeIsDefault={data.w_prime_is_default}
        weatherUsed={data.weather_used}
        missing={data.missing}
        de={de}
      />

      {segments.length > 0 && (
        <section
          {...GLASS_CARD_MARKER}
          style={{ ...glassCardStyle, borderRadius: 20, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div ref={profileBoxRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <RehearsalProfile
              segments={segments}
              elevations={elevations}
              width={profileWidth}
              height={PROFILE_HEIGHT}
              onScrub={onScrubShared}
              activeIdx={activeIdx}
              blowUpIdxs={blowUpIdxs}
            />
            <WPrimeTrace
              segments={segments}
              wPrimeJ={wPrime}
              width={profileWidth}
              height={54}
              activeIdx={activeIdx}
              de={de}
            />
          </div>

          {/* The readout keeps its height whether or not a finger is down, so
              scrubbing doesn't shove the rest of the page up and down. */}
          <div style={{ minHeight: 44, display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'baseline' }}>
            {scrubbed ? (
              <>
                <Readout label="km" value={formatDecimal(scrubbed.start_m / 1000, de)} />
                <Readout label={de ? 'Steigung' : 'Gradient'} value={`${formatDecimal(scrubbed.gradient_pct, de)} %`} />
                {/* Everything below the gradient is a PROJECTION, so each one
                    falls back to `—` on its own: an unpaced rehearsal still
                    scrubs the real road, it just has nothing to say about
                    watts. */}
                <Readout
                  label={de ? 'Ziel' : 'Target'}
                  value={scrubbed.power_w != null ? `${Math.round(scrubbed.power_w)} W` : '—'}
                />
                <Readout
                  label={de ? 'Tempo' : 'Speed'}
                  value={scrubbed.speed_ms != null ? `${formatDecimal(scrubbed.speed_ms * 3.6, de)} km/h` : '—'}
                />
                <Readout
                  label={de ? 'Zeit' : 'Elapsed'}
                  value={scrubbed.elapsed_s != null ? formatHms(scrubbed.elapsed_s) : '—'}
                />
                <Readout
                  label="W′"
                  value={
                    wPrime != null && scrubbed.w_bal_j != null
                      ? `${Math.round(Math.max(0, Math.min(1, scrubbed.w_bal_j / wPrime)) * 100)} %`
                      : '—'
                  }
                />
              </>
            ) : (
              <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                {data.can_predict
                  ? de
                    ? 'Über das Profil streichen — Watt, Tempo und W′ an jedem Punkt.'
                    : 'Drag across the profile — watts, speed and W′ at any point.'
                  : de
                    ? 'Über das Profil streichen — Kilometer und Steigung an jedem Punkt.'
                    : 'Drag across the profile — distance and gradient at any point.'}
              </span>
            )}
          </div>
        </section>
      )}

      <ClimbCards climbs={data.climbs} segments={segments} de={de} />

      {(data.total_kj != null || data.carbs_g_per_hour != null) && (
        <section
          {...GLASS_CARD_MARKER}
          style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <span
            className="eyebrow"
            style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
          >
            {de ? 'VERPFLEGUNG' : 'FUELLING'}
          </span>
          <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>
            {data.carbs_g_per_hour != null ? `${Math.round(data.carbs_g_per_hour)} g/h` : '—'}
          </span>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-ink-2)', margin: 0 }}>
            {data.total_kj != null
              ? de
                ? `Rund ${Math.round(data.total_kj).toLocaleString('de-DE')} kJ Arbeit — Kohlenhydrate ab der ersten Stunde, nicht erst wenn es weh tut.`
                : `About ${Math.round(data.total_kj).toLocaleString('en-US')} kJ of work — start the carbs in hour one, not when it starts to hurt.`
              : de
                ? 'Kohlenhydrate ab der ersten Stunde, nicht erst wenn es weh tut.'
                : 'Start the carbs in hour one, not when it starts to hurt.'}
          </p>
        </section>
      )}

      <AssumptionsRow
        assumptions={data.assumptions}
        onChange={(patch) => mutation.mutate(patch)}
        disabled={mutation.isPending}
        de={de}
      />
      {mutation.isPending && (
        <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
          {de ? 'Rechne die Strecke neu …' : 'Re-running the route…'}
        </span>
      )}
      {mutation.isError && (
        <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)' }}>
          {de
            ? 'Die Annahme konnte nicht gespeichert werden — die Zahlen oben gelten noch für die alte Einstellung.'
            : 'That assumption could not be saved — the numbers above still reflect the previous setting.'}
        </span>
      )}
    </>,
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10.5, color: 'var(--color-muted)', letterSpacing: '0.04em' }}>{label}</span>
      <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>
        {value}
      </span>
    </span>
  )
}
