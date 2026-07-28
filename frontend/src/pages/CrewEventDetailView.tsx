/**
 * CrewEventDetailView — the planned crew ride, built from pencil-new.pen's
 * "V3 · Ride Detail (Sunrise)" frame (node W73E6q).
 *
 * Pen order, top to bottom: MapHero (route + title overlay) → StatStrip →
 * ElevCard → Logistics (MeetCard + WeatherCard) → WhoJoining → CTA.
 *
 * Until now a crew event only existed as a card inside the Social tab: you could
 * create one, RSVP and upload a GPX, but there was nowhere to actually LOOK at
 * the ride you had been invited to. This is that page.
 *
 * ── Deliberate deviations from the pen, and why ───────────────────────────
 * Every one of these is "no honest source", not "not done yet".
 *
 *  • No satellite/map tiles. The app has no map-tile provider (the ride-analysis
 *    route card drew SVG over a flat field for the same reason), so the hero
 *    renders the real GPX track over a gradient field. The pen's "Satellite"
 *    map-type pill goes with it — there is nothing to switch between.
 *  • No waypoint pins/labels ("Starnberger See", "Kloster Andechs"). GPX
 *    waypoints are not parsed or stored, and inventing points of interest along
 *    someone's route would be fabrication.
 *  • No surface breakdown (asphalt/gravel/path km). GPX carries no surface tags.
 *  • No amenities row (café/parking/WC/water), no separate meet-vs-roll-out
 *    time, no distance-to-start. None of these exist on the event model; they
 *    want host-editable fields, which is a follow-up, not a guess.
 *  • No "Send to device". There is no device-push integration; Export GPX is
 *    real and stays.
 *  • Labels use --color-muted (#8A93A3), not the pen's #5C6570, which fails AA
 *    on this background. The app already raised that token deliberately
 *    (usability audit P1-12) and the pen has not caught up.
 *
 * Difficulty, estimated duration, the weather verdict and the clothing line are
 * all DERIVED (utils/crewRide) rather than stored — they are functions of the
 * route and the forecast, so deriving them keeps one producer per number.
 */
import { useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { parseISO, format } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import {
  ArrowLeft, Share2, Flag, MapPin, Navigation, Users, UserPlus, Check, Download,
  ArrowUp, ArrowDown, Wind, Droplets, Sunrise, Shirt, ThumbsUp, CloudRain, Crown, MessageCircle,
  Sun, CloudSun, CloudFog, CloudLightning, Snowflake,
} from 'lucide-react'
import { useCrewEvent, useRsvpCrewEvent } from '../hooks/useCrewEvents'
import { useCrewEventWeather } from '../hooks/useCrewEventWeather'
import { downloadCrewEventTour } from '../api/crewEvents'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import RouteProfile from '../components/crew/RouteProfile'
import {
  rideDifficulty, estimatedRideSeconds, fmtEstimate, summariseWeather,
  clothingAdvice, projectRoute, skyIcon,
} from '../utils/crewRide'
import { hapticTick } from '../lib/haptics'

const card = { background: 'var(--color-paper-2)', border: '1px solid #FFFFFF14' } as const
const cardCls = 'rounded-[24px] flex flex-col'

const HERO_W = 390
const HERO_H = 290
/** Hero height when there is no route to draw. The full 290 px is sized around
 *  a track; without one it is a third of the screen of empty gradient before the
 *  reader reaches a single fact. The title block still needs room to breathe. */
const HERO_H_BARE = 170

/** Difficulty pill wording — the pen's MODERATE, localised. */
const DIFF_LABEL = {
  easy: { en: 'EASY', de: 'LOCKER' },
  moderate: { en: 'MODERATE', de: 'MODERAT' },
  hard: { en: 'HARD', de: 'HART' },
  brutal: { en: 'BRUTAL', de: 'BRUTAL' },
} as const

function Stat({ v, u, l }: { v: string; u?: string; l: string }) {
  return (
    <div className="flex-1 flex flex-col items-center" style={{ gap: 3 }}>
      <span className="flex items-end" style={{ gap: 2 }}>
        <span className="num-display" style={{ fontSize: 21, fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>{v}</span>
        {u && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', paddingBottom: 3 }}>{u}</span>}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{l}</span>
    </div>
  )
}

export default function CrewEventDetailView() {
  const { id } = useParams()
  const eventId = Number(id)
  const navigate = useNavigate()
  const { locale } = useLocale()
  const { user } = useAuth()
  const de = locale === 'de'
  const dfl = de ? { locale: deLocale } : undefined

  const { data: ev, isLoading, isError } = useCrewEvent(Number.isFinite(eventId) ? eventId : null)
  const { data: weather } = useCrewEventWeather(Number.isFinite(eventId) ? eventId : undefined)
  const rsvp = useRsvpCrewEvent()

  const route = useMemo(() => projectRoute(ev?.tour_polyline, HERO_W, HERO_H, 26), [ev?.tour_polyline])
  const diff = useMemo(() => rideDifficulty(ev?.tour_distance_m, ev?.tour_elevation_m), [ev])
  const estS = useMemo(() => estimatedRideSeconds(ev?.tour_distance_m, ev?.tour_elevation_m), [ev])
  const wx = useMemo(() => summariseWeather(weather?.available ? weather.hourly : null), [weather])
  const advice = useMemo(() => clothingAdvice(wx, de), [wx, de])

  const going = (ev?.attendees ?? []).filter((a) => a.status === 'going')
  const isGoing = ev?.my_status === 'going'
  const start = ev?.tour_polyline?.[0] ?? null

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
        <div className="mx-auto flex flex-col gap-4 px-4 pt-6" style={{ maxWidth: 430 }}>
          <div className="rounded-[24px] shimmer-bg" style={{ height: 260 }} />
          <div className="rounded-[24px] shimmer-bg" style={{ height: 92 }} />
          <div className="rounded-[24px] shimmer-bg" style={{ height: 220 }} />
        </div>
      </div>
    )
  }

  if (isError || !ev) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: 'var(--color-paper)' }}>
        <div className="flex flex-col items-center gap-3 px-8 text-center">
          <p style={{ fontSize: 14, color: 'var(--color-ink-2)' }}>
            {de ? 'Diese Ausfahrt konnte nicht geladen werden.' : "Couldn't load this ride."}
          </p>
          <button type="button" onClick={() => navigate('/dashboard?tab=social')} className="rounded-full" style={{ padding: '10px 18px', background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
            {de ? 'Zur Crew' : 'Back to crew'}
          </button>
        </div>
      </div>
    )
  }

  const startsAt = parseISO(ev.starts_at)
  const hostName = ev.creator_handle

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto flex flex-col" style={{ maxWidth: 430 }}>

        {/* ── MapHero (pen G3h5P) ───────────────────────────────────────── */}
        <div className="relative overflow-hidden" style={{ height: route ? HERO_H : HERO_H_BARE, background: '#0A0C0F' }}>
          {/* Field the route sits on. Not a map — see the header note. */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(120% 90% at 24% 18%, #1B2733 0%, #10151B 46%, #0A0C0F 100%)',
          }} />
          {route && (
            <svg className="absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${HERO_W} ${HERO_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
              <defs>
                <linearGradient id="crGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#16E08A" />
                  <stop offset="55%" stopColor="#FFB020" />
                  <stop offset="100%" stopColor="#FA1E55" />
                </linearGradient>
              </defs>
              {/* Casing then line, exactly as the pen layers them. */}
              <path d={route.d} fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
              <path d={route.d} fill="none" stroke="url(#crGrad)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={route.pts[0][0]} cy={route.pts[0][1]} r={8} fill="#16E08A" stroke="#FFFFFF" strokeWidth={2} />
            </svg>
          )}
          {route && (
            <span className="absolute grid place-items-center rounded-full" style={{
              left: route.pts[route.pts.length - 1][0] - 11, top: route.pts[route.pts.length - 1][1] - 11,
              width: 22, height: 22, background: '#FF5A3C', border: '2px solid #FFFFFF',
            }}>
              <Flag size={11} strokeWidth={2.6} style={{ color: '#FFFFFF' }} />
            </span>
          )}

          {/* Scrim so the title reads over the track. */}
          <div className="absolute inset-x-0 bottom-0" style={{ height: 200, background: 'linear-gradient(180deg, #0A0C0F00 0%, #0A0C0F 100%)' }} />

          <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'}
            className="absolute grid place-items-center rounded-full"
            style={{ left: 16, top: 14, width: 40, height: 40, background: '#0A0C0FA6', border: '1px solid #FFFFFF26', backdropFilter: 'blur(12px)' }}>
            <ArrowLeft size={20} strokeWidth={2.2} style={{ color: '#fff' }} />
          </button>
          <button type="button"
            onClick={() => { void navigator.share?.({ title: ev.name, url: window.location.href }).catch(() => {}) }}
            aria-label={de ? 'Teilen' : 'Share'}
            className="absolute grid place-items-center rounded-full"
            style={{ right: 16, top: 14, width: 40, height: 40, background: '#0A0C0FA6', border: '1px solid #FFFFFF26', backdropFilter: 'blur(12px)' }}>
            <Share2 size={18} strokeWidth={2.2} style={{ color: '#fff' }} />
          </button>

          {/* TitleOv (pen MXs3O) */}
          <div className="absolute flex flex-col" style={{ left: 20, right: 20, bottom: 18, gap: 8 }}>
            {diff && (
              <span className="inline-flex items-center self-start rounded-full" style={{
                gap: 5, padding: '4px 10px',
                background: `color-mix(in srgb, ${diff.color} 15%, transparent)`,
                border: `1px solid color-mix(in srgb, ${diff.color} 40%, transparent)`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: diff.color }} />
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', color: diff.color }}>
                  {DIFF_LABEL[diff.level][de ? 'de' : 'en']}
                </span>
              </span>
            )}
            <h1 className="num-display" style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{ev.name}</h1>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFFCC' }}>
              {format(startsAt, de ? 'EEE, d. MMM · HH:mm' : 'EEE, d MMM · HH:mm', dfl)}
              {' · '}{de ? `von ${hostName}` : `hosted by ${hostName}`}
            </span>
          </div>
        </div>

        {/* ── Content (pen NjaHq) ───────────────────────────────────────── */}
        <div className="flex flex-col" style={{ gap: 16, padding: '18px 16px 28px' }}>

          {/* StatStrip (pen cH82w) */}
          {ev.has_tour ? (
            <div className={cardCls} style={{ ...card, gap: 12, padding: '16px 14px' }}>
              <div className="flex items-center">
                <Stat v={ev.tour_distance_m != null ? (ev.tour_distance_m / 1000).toFixed(0) : '—'} u="km" l={de ? 'Distanz' : 'Distance'} />
                <span style={{ width: 1, height: 34, background: '#FFFFFF14' }} />
                <Stat v={ev.tour_elevation_m != null ? Math.round(ev.tour_elevation_m).toString() : '—'} u="m" l={de ? 'Anstieg' : 'Climbing'} />
                <span style={{ width: 1, height: 34, background: '#FFFFFF14' }} />
                <Stat v={ev.tour_max_grade_pct != null ? ev.tour_max_grade_pct.toFixed(0) : '—'} u="%" l={de ? 'Max Steigung' : 'Max grade'} />
                <span style={{ width: 1, height: 34, background: '#FFFFFF14' }} />
                <Stat v={fmtEstimate(estS)} l={de ? 'Dauer ca.' : 'Est. time'} />
              </div>
              {diff && (
                <div className="flex items-center justify-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', textAlign: 'center' }}>
                    {de
                      ? `${diff.metresPerKm} Hm pro km · Gruppentempo, keine Prognose für dich`
                      : `${diff.metresPerKm} m of climbing per km · group pace, not a prediction for you`}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className={cardCls} style={{ ...card, gap: 6, padding: 16 }}>
              <span className="num-display" style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink)' }}>
                {de ? 'Noch keine Route' : 'No route yet'}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                {de
                  ? `${hostName} hat noch keine GPX-Datei hochgeladen — Distanz, Anstieg und Höhenprofil erscheinen, sobald sie da ist.`
                  : `${hostName} hasn't uploaded a GPX yet — distance, climbing and the profile appear once it lands.`}
              </span>
            </div>
          )}

          {/* ElevCard (pen eXN3m) */}
          {ev.has_tour && (
            <div className={cardCls} style={{ ...card, gap: 10, padding: 16 }}>
              <div className="flex items-center justify-between">
                <span className="num-display" style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink)' }}>
                  {de ? 'Höhenprofil' : 'Elevation'}
                </span>
                <div className="flex items-center" style={{ gap: 12 }}>
                  <span className="inline-flex items-center" style={{ gap: 3 }}>
                    <ArrowUp size={14} strokeWidth={2.4} style={{ color: '#16E08A' }} />
                    <span className="num-display" style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-ink)' }}>
                      {ev.tour_elevation_m != null ? `${Math.round(ev.tour_elevation_m)} m` : '—'}
                    </span>
                  </span>
                  <span className="inline-flex items-center" style={{ gap: 3 }}>
                    <ArrowDown size={14} strokeWidth={2.4} style={{ color: 'var(--color-muted)' }} />
                    <span className="num-display" style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-ink-2)' }}>
                      {ev.tour_descent_m != null ? `${Math.round(ev.tour_descent_m)} m` : '—'}
                    </span>
                  </span>
                </div>
              </div>
              <RouteProfile profile={ev.tour_profile} />
            </div>
          )}

          {/* MeetCard (pen XC1PG) — meeting point + navigate out. */}
          {(ev.meeting_point || start) && (
            <div className={cardCls} style={{ ...card, gap: 12, padding: 16 }}>
              <div className="flex items-start justify-between" style={{ gap: 12 }}>
                <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
                  <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', color: '#16E08A' }}>
                    {de ? 'TREFFPUNKT' : 'MEET'}
                  </span>
                  <span className="num-display" style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1.25 }}>
                    {ev.meeting_point || (de ? 'Am Routenstart' : 'At the route start')}
                  </span>
                  <span className="inline-flex items-center" style={{ gap: 5, fontSize: 12.5, color: 'var(--color-ink-2)' }}>
                    <MapPin size={13} strokeWidth={2.2} style={{ color: 'var(--color-muted)' }} />
                    {format(startsAt, de ? "'Abfahrt' HH:mm" : "'Roll-out' HH:mm", dfl)}
                  </span>
                </div>
                {start && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${start[0]},${start[1]}`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center shrink-0 rounded-full"
                    style={{ gap: 6, padding: '9px 13px', background: 'var(--color-accent)', boxShadow: '0 2px 10px #FF5A3C59' }}
                  >
                    <Navigation size={14} strokeWidth={2.4} style={{ color: '#fff' }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{de ? 'Route dorthin' : 'Navigate'}</span>
                  </a>
                )}
              </div>
              {ev.description && (
                <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{ev.description}</p>
              )}
            </div>
          )}

          {/* WeatherCard (pen zsnvE) */}
          {weather?.available && wx && (
            <div className={cardCls} style={{ ...card, gap: 14, padding: 16 }}>
              <div className="flex items-start justify-between" style={{ gap: 10 }}>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span className="num-display" style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink)' }}>
                    {de ? 'Wetter zur Ausfahrt' : 'Ride weather'}
                  </span>
                  {weather.window_start && weather.window_end && (
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>
                      {format(parseISO(weather.window_start), 'HH:mm')} – {format(parseISO(weather.window_end), 'HH:mm')}
                    </span>
                  )}
                </div>
                {(() => {
                  const meta = wx.verdict === 'great'
                    ? { c: '#16E08A', Icon: ThumbsUp, t: de ? 'Top-Bedingungen' : 'Great conditions' }
                    : wx.verdict === 'ok'
                      ? { c: '#FFB020', Icon: Wind, t: de ? 'Machbar' : 'Rideable' }
                      : { c: '#FF7A3C', Icon: CloudRain, t: de ? 'Ungemütlich' : 'Rough out there' }
                  return (
                    <span className="inline-flex items-center shrink-0 rounded-full" style={{ gap: 5, padding: '5px 10px', background: `color-mix(in srgb, ${meta.c} 15%, transparent)` }}>
                      <meta.Icon size={14} strokeWidth={2.2} style={{ color: meta.c }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: meta.c }}>{meta.t}</span>
                    </span>
                  )
                })()}
              </div>

              {/* Hourly strip (pen JSyHV) — first cell raised, as in the pen. */}
              <div className="flex justify-between rounded-[16px]" style={{ background: 'var(--color-surface-2)', padding: 4 }}>
                {weather.hourly.slice(0, 5).map((h, i) => (
                  <div key={h.time} className="flex flex-col items-center rounded-[12px]" style={{ gap: 6, padding: 10, background: i === 0 ? 'var(--color-surface-3)' : 'transparent', flex: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: i === 0 ? 800 : 600, color: i === 0 ? 'var(--color-ink)' : 'var(--color-muted)' }}>
                      {i === 0 ? (de ? 'Start' : 'Start') : format(parseISO(h.time), 'HH')}
                    </span>
                    {(() => {
                      // Real WMO code → glyph. Every cell used to draw the same
                      // sunrise icon, so a thunderstorm and a clear sky looked
                      // identical in the one place a rider checks before packing.
                      const sky = skyIcon(h.weather_code)
                      const Icon = sky === 'storm' ? CloudLightning
                        : sky === 'snow' ? Snowflake
                          : sky === 'rain' ? CloudRain
                            : sky === 'fog' ? CloudFog
                              : sky === 'partly' ? CloudSun
                                : Sun
                      const tone = sky === 'storm' || sky === 'rain' ? '#59C3FF'
                        : sky === 'snow' ? '#8FD8FF'
                          : sky === 'fog' ? '#9BA4AF'
                            : (h.temp_c ?? 0) >= 22 ? '#FFB020' : '#FFD166'
                      return <Icon size={20} strokeWidth={2} style={{ color: tone }} />
                    })()}
                    <span className="num-display" style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-ink)' }}>
                      {h.temp_c != null ? `${Math.round(h.temp_c)}°` : '—'}
                    </span>
                  </div>
                ))}
              </div>

              <span style={{ height: 1, background: '#FFFFFF0F' }} />

              <div className="flex flex-col" style={{ gap: 10 }}>
                {[
                  { c: '#38B6FF', Icon: Wind, t: wx.maxWindKmh != null ? `${Math.round(wx.maxWindKmh)} km/h ${de ? 'Wind' : 'wind'}` : null },
                  { c: '#59C3FF', Icon: Droplets, t: wx.maxRainPct != null ? `${Math.round(wx.maxRainPct)}% ${de ? 'Regenrisiko' : 'chance of rain'}` : null },
                  { c: '#FFB020', Icon: Sunrise, t: weather.sunrise ? `${de ? 'Sonnenaufgang' : 'Sunrise'} ${format(parseISO(weather.sunrise), 'HH:mm')}` : null },
                ].filter((r) => r.t).map((r) => (
                  <div key={r.t} className="flex items-center" style={{ gap: 9 }}>
                    <span className="grid place-items-center rounded-full shrink-0" style={{ width: 30, height: 30, background: `color-mix(in srgb, ${r.c} 12%, transparent)` }}>
                      <r.Icon size={15} strokeWidth={2.2} style={{ color: r.c }} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{r.t}</span>
                  </div>
                ))}
              </div>

              {advice && (
                <div className="flex items-start rounded-[14px]" style={{ gap: 9, padding: '11px 12px', background: '#FF5A3C26' }}>
                  <Shirt size={18} strokeWidth={2.1} style={{ color: '#FF5A3C', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{advice}</span>
                </div>
              )}
            </div>
          )}

          {/* WhoJoining (pen Mt8IK) */}
          <div className={cardCls} style={{ ...card, gap: 14, padding: 16 }}>
            <div className="flex items-center justify-between">
              <span className="num-display" style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink)' }}>
                {de ? 'Wer mitfährt' : "Who's joining"}
              </span>
              <span className="inline-flex items-center rounded-full" style={{ gap: 5, padding: '4px 10px', background: '#16E08A26' }}>
                <Users size={13} strokeWidth={2.3} style={{ color: '#16E08A' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#16E08A' }}>
                  {going.length} {de ? 'dabei' : 'going'}
                </span>
              </span>
            </div>

            {going.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                {de
                  ? 'Noch niemand zugesagt — sei der erste, dann sehen es die anderen.'
                  : 'Nobody has said yes yet — be the first and the rest will see it.'}
              </span>
            ) : going.map((a) => {
              const isHost = a.user_id === ev.creator_user_id
              const isMe = user?.id != null && a.user_id === user.id
              const ring = isHost ? '#FFD166' : '#8B5CF6'
              return (
                <div key={a.user_id} className="flex items-center" style={{ gap: 12 }}>
                  <span className="num-display grid place-items-center rounded-full shrink-0" style={{
                    width: 44, height: 44, background: 'var(--color-surface-2)',
                    border: `2px solid ${ring}`, fontSize: 17, color: 'var(--color-ink)',
                  }}>
                    {a.handle.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex flex-col min-w-0 flex-1" style={{ gap: 5 }}>
                    <span className="truncate" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
                      {a.handle}{isMe ? (de ? ' · du' : ' · you') : ''}
                    </span>
                    {isHost && (
                      <span className="inline-flex items-center self-start rounded-full" style={{ gap: 4, padding: '3px 9px', background: '#FFD1661F' }}>
                        <Crown size={12} strokeWidth={2.3} style={{ color: '#FFD166' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#FFD166' }}>{de ? 'Gastgeber' : 'Host'}</span>
                      </span>
                    )}
                  </div>
                  {!isMe && (
                    <Link to="/dashboard?tab=social" aria-label={de ? 'Zum Crew-Chat' : 'Crew chat'}
                      className="grid place-items-center rounded-full shrink-0"
                      style={{ width: 36, height: 36, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
                      <MessageCircle size={17} strokeWidth={2.1} style={{ color: 'var(--color-ink-2)' }} />
                    </Link>
                  )}
                </div>
              )
            })}

            <Link to="/dashboard?tab=social"
              className="flex items-center justify-center rounded-full"
              style={{ gap: 8, padding: '11px 0', background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
              <UserPlus size={16} strokeWidth={2.3} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-accent)' }}>{de ? 'Fahrer einladen' : 'Invite riders'}</span>
            </Link>
          </div>

          {/* CTA (pen hwrAR) */}
          <div className="flex flex-col" style={{ gap: 10 }}>
            <button
              type="button"
              disabled={rsvp.isPending}
              onClick={() => { hapticTick(); rsvp.mutate({ eventId: ev.id, status: isGoing ? 'out' : 'going' }) }}
              className="flex items-center justify-center rounded-full"
              style={{
                gap: 8, padding: '15px 0',
                background: isGoing ? 'var(--color-surface-2)' : 'var(--color-accent)',
                border: isGoing ? '1px solid var(--color-rule)' : 'none',
                boxShadow: isGoing ? undefined : '0 4px 16px #FF5A3C66',
                opacity: rsvp.isPending ? 0.6 : 1,
              }}
            >
              <Check size={18} strokeWidth={2.6} style={{ color: isGoing ? 'var(--color-ink-2)' : '#0A0C0F' }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: isGoing ? 'var(--color-ink-2)' : '#0A0C0F' }}>
                {isGoing ? (de ? 'Du bist dabei' : "You're in") : (de ? 'Mitfahren' : 'Join this ride')}
              </span>
            </button>

            {ev.has_tour && (
              <button
                type="button"
                onClick={() => { void downloadCrewEventTour(ev.id, ev.tour_filename ?? `${ev.name}.gpx`) }}
                className="flex items-center justify-center rounded-full"
                style={{ gap: 7, padding: '12px 0', background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
              >
                <Download size={16} strokeWidth={2.3} style={{ color: '#38B6FF' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'GPX exportieren' : 'Export GPX'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
