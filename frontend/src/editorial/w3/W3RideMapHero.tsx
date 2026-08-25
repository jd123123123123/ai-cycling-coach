import { Suspense, lazy, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, Share2, CircleCheck, Gauge, Zap, HeartPulse, Maximize2 } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'
import { W3_MAP } from './w3map'
import { GRADE_LEGEND, gradeColours } from './gradeColours'
import { S, lux } from './w3surfaces'

const RouteMap = lazy(() => import('../../components/crew/RouteMap'))

/**
 * W3 · FAHRT ZUSAMMENFASSUNG — the ride's hero, rebuilt from pen frame `XqpcX`.
 *
 * TWO LAYERS, AND THE JOIN BETWEEN THEM IS THE DESIGN. A real map holds the top
 * of the screen; a card rises over its lower edge carrying the ride's own
 * portrait — the bike, in the landscape this ride actually crossed — which
 * dissolves downward into the app's black and becomes the numbers. Where you
 * rode, then what it looked like, then what it cost. The card overlaps the map
 * rather than sitting below it so the two read as one object; the 3 px lit rim
 * on its top edge is what makes it read as lifted rather than pasted.
 *
 * ── WHY THE MAP IS DARK, where the pen's is light ────────────────────────
 * The pen paints a pale basemap under a white top scrim. That is a good
 * photograph and a bad screen: it would be the single brightest object in a
 * near-black app, it flashes white on every load before tiles arrive, and it
 * forces this one route to carry dark status-bar and nav treatments no other W3
 * screen uses. `RouteMap` already argues this at length for the same reason.
 * Everything else — the 430 px map, the card at 352 with its 30 px top radius,
 * the dissolve, the typography — is the pen's geometry unchanged.
 *
 * ── WHY THE SCENE IS INSIDE THE CARD ─────────────────────────────────────
 * The render is a square image and the card is a wide one, so any placement
 * crops. Sitting it INSIDE the card, bleeding past three edges and dissolving
 * at the bottom, means the crop is deliberate: the picture has no visible edges
 * of its own, so it reads as the card's material rather than as a photo pasted
 * on it. This is also why the dissolve is a five-stop ramp and not a fade — a
 * linear fade over a landscape leaves a visible grey band where the image is
 * still half-present.
 *
 * ── HONESTY ──────────────────────────────────────────────────────────────
 * Every element here disappears rather than inventing itself. No GPS: no map,
 * and the card simply starts at the top of the screen. No composed scene: the
 * card is plain, with the route's own accent lighting it. A missing number is
 * an em dash, never a zero.
 */

export interface W3RideHeroVm {
  /** [[lat, lng], …] from the ride's own GPX. Null when the ride has no GPS. */
  polyline: [number, number][] | null
  /** Per-point gradient, same length as `polyline`. The hero drew the route in
   *  flat acid while the full-screen map coloured it by how hard the road is —
   *  so the one thing a cycling map can say that a general-purpose one cannot
   *  was hidden one tap deep, on the screen nobody opened. Null → flat acid,
   *  which is the honest fallback for a ride with no elevation. */
  grades?: number[] | null
  /** The composed scene — bike and landscape — as a data URI, when one exists. */
  sceneImage: string | null
  /** True while we do not yet know whether this ride has a route. Distinct from
   *  a null polyline, which means it genuinely has none: the map region is held
   *  open while loading, so the page does not paint a black card at the top and
   *  then shove it down when the track arrives. */
  routePending?: boolean
  /** "FAHRT ABGESCHLOSSEN" · the date line beside it. */
  dateLine: string
  /** The headline: total time, as h:mm:ss. */
  duration: string
  /** Three stats under it. Value and unit stay separate so the unit can be set
   *  smaller and quieter, which is what keeps the numbers readable at a glance. */
  stats: { label: string; value: string; unit: string }[]
  /** The power strip: watts, heart rate, intensity factor. */
  watts: string
  bpm: string
  ifValue: string
  /** 0..1 — how much of the beam is lit. The ride's IF against threshold. */
  ifFill: number
  /** e.g. "82 % VON FTP · SCHWELLE" and "1.184 kcal". */
  effortLabel: string
  energyLabel: string
}

/** Total beam steps. 22 in the pen, and worth keeping: enough that the lit
 *  fraction reads as a proportion, few enough to take in without counting. */
const BEAM_STEPS = 22

/** The pen's geometry: a 430 px map with the card rising over its last 78 px.
 *  Named because three things depend on the overlap — the card offset, the
 *  licence notice's clearance, and the scene's crop — and they must not drift. */
const MAP_H = 430
const CARD_TOP = 352

/**
 * Where the picture ends and the reading begins.
 *
 * `textTop` sits 16 px INSIDE the ramp rather than after it. That overlap is
 * deliberate: at 88 % of its length the ramp is already the card's own black,
 * so the first line of text lands on solid ground while the picture still has
 * somewhere to go — which is what stops the composition reading as two stacked
 * blocks with a seam between them.
 */
const SCENE = { rampTop: 150, rampH: 190, textTop: 306 } as const

/**
 * The intensity beam — how hard this ride was, against threshold.
 *
 * NOT a decorative strip. The lit fraction is the ride's real IF against 1.0,
 * so a threshold ride fills it and an endurance ride does not. Unlit steps stay
 * SHORTER as well as darker, exactly as the pen draws them: two channels rather
 * than one means the reading survives a glance, a small screen, and a rider who
 * cannot separate the two greens.
 */
function IntensityBeam({ fill, reduce }: { fill: number; reduce: boolean | null }) {
  const lit = Math.round(Math.max(0, Math.min(1, fill)) * BEAM_STEPS)
  return (
    <div style={{ display: 'flex', gap: 3.5, alignItems: 'flex-end', height: 13 }} aria-hidden>
      {Array.from({ length: BEAM_STEPS }, (_, i) => {
        const on = i < lit
        return (
          <motion.div key={i}
            initial={reduce ? false : { scaleY: 0.3, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.15 + i * 0.018 }}
            style={{
              flex: 1, minWidth: 0, height: on ? 13 : 9, borderRadius: 3,
              transformOrigin: 'bottom',
              background: on
                ? `linear-gradient(180deg, ${T.acidLite}, ${T.acid} 45%, ${T.acidDeep})`
                : `linear-gradient(180deg, ${T.heroOff}, ${T.heroDock})`,
              boxShadow: on ? `0 0 9px ${T.acid}33` : undefined,
            }} />
        )
      })}
    </div>
  )
}

/** A round control that has to stay legible over BOTH a dark map and, once the
 *  card scrolls up, over the ride's own photograph. Hence the blur: a flat
 *  translucent disc works over one of those and fails over the other. */
function NavButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      width: 42, height: 42, borderRadius: 100, border: `1px solid ${T.stroke}`,
      background: `${T.bg}A6`, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none',
    }}>{children}</button>
  )
}

export interface W3RideMapHeroProps {
  vm: W3RideHeroVm
  onBack?: () => void
  onShare?: () => void
  /** Opens the full-screen, pannable map. The hero's own map is deliberately
   *  inert — see `RouteMap` on why a page-embedded map must not eat a scroll. */
  onExpandMap?: () => void
  /** Rendered over the scene: the compose affordance, a note, or nothing. */
  sceneOverlay?: React.ReactNode
}

export default function W3RideMapHero({ vm, onBack, onShare, onExpandMap, sceneOverlay }: W3RideMapHeroProps) {
  const reduce = useReducedMotion()
  const [mapReady, setMapReady] = useState(false)
  const hasRoute = vm.polyline != null && vm.polyline.length > 1
  const ramp = gradeColours(vm.grades, vm.polyline?.length ?? 0)
  // The map region is held open while the route is still on its way, and only
  // collapses once we KNOW the ride has no GPS. Collapsing on "not yet" is what
  // made the page open as a black rectangle and then jump.
  const showMap = hasRoute || vm.routePending === true
  const mapH = showMap ? MAP_H : 0
  const cardTop = showMap ? CARD_TOP : 0

  return (
    <div style={{ position: 'relative', fontFamily: FONT }}>

      {/* ── the map ─────────────────────────────────────────────────────── */}
      {showMap && (
        <div style={{ position: 'relative', height: mapH, background: T.bg, overflow: 'hidden' }}>
          {hasRoute && <Suspense fallback={null}>
            <RouteMap
              polyline={vm.polyline!}
              styleKey="dark"
              interactive={false}
              onReady={() => setMapReady(true)}
              palette={W3_MAP}
              lineColors={ramp ?? undefined}
              lineColor={T.acid}
              lineWidth={6}
              startColor={T.ink}
              endColor={T.acid}
              // The card covers the bottom 78 px of the map, and the notice
              // must clear it: a licence notice behind a card is not visible,
              // which is the one thing the licence actually asks for.
              attributionBottom={MAP_H - CARD_TOP + 10}
              className="w3-ride-map" />
          </Suspense>}

          {/* Until the tiles paint — and permanently if they never do — the
              route still has to be on screen. A ride page without its route is
              not a slower page, it is a broken one. */}
          {!mapReady && vm.polyline && (
            <svg viewBox="0 0 390 430" preserveAspectRatio="xMidYMid meet"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <path d={fallbackPath(vm.polyline, 390, 430)} fill="none" stroke={`${T.ink}40`} strokeWidth={11}
                strokeLinecap="round" strokeLinejoin="round" />
              <motion.path d={fallbackPath(vm.polyline, 390, 430)} fill="none" stroke={T.acid} strokeWidth={6}
                strokeLinecap="round" strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, ease: EASE }} />
            </svg>
          )}

          {/* Top scrim. Dark, not the pen's white: the controls and the status
              bar above them are light on every other W3 screen, and this one
              must not be the exception. */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 150, pointerEvents: 'none',
            background: `linear-gradient(180deg, ${T.bg}D9, ${T.bg}00)`,
          }} />

          {/* THE KEY, and only when the line is coloured. A legend for a colour
              that is not on screen is worse than no legend. It sits just above
              the card's top edge so it reads as part of the map, not the card. */}
          {ramp && (
            <div style={{
              position: 'absolute', left: 20, bottom: MAP_H - CARD_TOP + 34, zIndex: 3,
              display: 'flex', gap: 10, alignItems: 'center',
              padding: '6px 11px', borderRadius: 100, background: `${T.bg}CC`,
            }}>
              {GRADE_LEGEND.map((g) => (
                <span key={g.label} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ width: 12, height: 3, borderRadius: 2, background: g.colour }} />
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, color: T.mid }}>{g.label}</span>
                </span>
              ))}
            </div>
          )}

          <div style={{
            position: 'absolute', top: 10, left: 16, right: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            {/* CONDITIONAL, because this hero is mounted twice in one scroll.
                Under the celebration wrap the page already carries a back
                affordance and a share CTA, and drawing them again a few hundred
                pixels below the first pair reads as two screens stacked rather
                than one page. Absent handler, absent button. */}
            {onBack
              ? <NavButton label="Zurück" onClick={onBack}><ChevronLeft size={19} color={T.ink} /></NavButton>
              : <span />}
            <div style={{ display: 'flex', gap: 10 }}>
              {onExpandMap && (
                <NavButton label="Karte öffnen" onClick={onExpandMap}><Maximize2 size={17} color={T.ink} /></NavButton>
              )}
              {onShare && (
                <NavButton label="Teilen" onClick={onShare}><Share2 size={18} color={T.ink} /></NavButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── the card ────────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', marginTop: showMap ? cardTop - mapH : 0,
        borderRadius: '30px 30px 0 0', overflow: 'hidden', background: T.heroBg,
      }}>
        {/* The scene bleeds past three edges on purpose: with no edges of its
            own it reads as the card's material rather than a pasted photo. */}
        {vm.sceneImage ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: EASE }}
            style={{
              position: 'absolute', top: -50, left: -32, right: -32, height: 454,
              backgroundImage: `url(${vm.sceneImage})`, backgroundSize: 'cover', backgroundPosition: 'center 48%',
            }} />
        ) : (
          // A quiet lit edge, so the card still reads as a surface catching the
          // light from the map above it rather than as a void.
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 90,
            background: `radial-gradient(140% 100% at 50% 0%, ${T.acid}1A, transparent 70%)`,
          }} />
        )}

        {/* Five stops, not a fade: a linear ramp over a landscape leaves a grey
            band where the image is still half there. */}
        <div style={{
          position: 'absolute', top: vm.sceneImage ? 186 : 40, left: 0, right: 0, height: 124,
          background: `linear-gradient(180deg, ${T.heroBg}00, ${T.heroBg}4D 28%, ${T.heroBg}CC 60%, ${T.heroBg} 90%, ${T.heroBg})`,
        }} />
        <div style={{ position: 'absolute', top: vm.sceneImage ? 308 : 164, left: 0, right: 0, bottom: 0, background: T.heroBg }} />

        {/* The lit rim — what makes the card read as lifted off the map. */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(180deg, ${T.ink}2E, ${T.ink}00)`,
        }} />

        {/* With a picture, the affordance floats over it. WITHOUT one there is
            no picture-shaped space to float in, so it becomes an ordinary row
            at the top of the values — see the padding below. A card that
            reserves 200 px for an image it does not have reads as broken, and
            "just black" is exactly what it looks like on a phone. */}
        {vm.sceneImage && sceneOverlay}

        {/* ── the values ──────────────────────────────────────────────────
             THE TODAY HERO IS THE STANDARD, and its whole argument is that
             depth comes from light and a tone step, never from a drawn line.
             This section used to carry a bordered, gradient-lit box and two
             hairline rules between the stats — the older idiom, where every
             group announces its own edges, so the card read as a stack of
             boxes rather than things lying on one surface. Now there is one
             flat panel and no rules anywhere; the stats are separated by space
             and by an equal-column grid, exactly the way the readiness dock
             separates its own numbers.

             `paddingTop` reserves the picture, so no text ever sits on
             landscape and the numbers begin exactly where the dissolve ends. */}
        <div style={{
          position: 'relative', padding: `${vm.sceneImage ? SCENE.textTop : S.xxl}px ${S.xxl}px ${S.section}px`,
          display: 'flex', flexDirection: 'column', gap: S.xl,
        }}>
          {!vm.sceneImage && sceneOverlay}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <CircleCheck size={13} color={T.acid} />
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.acid }}>
                FAHRT ABGESCHLOSSEN
              </span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{vm.dateLine}</span>
          </div>

          {/* The one dominant figure, the way `88` is on Today. The kicker sits
              UNDER it rather than above: the number is what the eye lands on,
              and a label above it makes the eye read the label first. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: -S.sm }}>
            <motion.span
              initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              style={{
                fontSize: 52, fontWeight: 700, lineHeight: 1, letterSpacing: -2.6, color: T.ink,
                fontVariantNumeric: 'tabular-nums',
              }}>{vm.duration}</motion.span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>
              FAHRZEIT
            </span>
          </div>

          {/* Three equal columns, no rules and no per-stat icon. The icons were
              three acid marks competing with the one acid mark that matters on
              this card — the beam. */}
          <div style={{ display: 'flex' }}>
            {vm.stats.map((s) => (
              <div key={s.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet, whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1, color: s.value === DASH ? T.quiet : T.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {s.value}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Leistung — one flat panel, `lux()`, no border and no gradient. It
              is the only boxed thing on the card because its three numbers only
              mean anything together. */}
          <div style={{ ...lux(24), padding: `${S.lg}px ${S.lg + 2}px`, gap: S.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {([[Zap, vm.watts, 'W'], [HeartPulse, vm.bpm, 'bpm'], [Gauge, 'IF', vm.ifValue]] as const).map(([Icon, a, b], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon size={14} color={T.mid} />
                  <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4, color: i === 2 ? T.quiet : T.ink, fontVariantNumeric: 'tabular-nums' }}>{a}</span>
                  <span style={{ fontSize: i === 2 ? 17 : 11, fontWeight: 700, color: i === 2 ? T.ink : T.quiet, fontVariantNumeric: 'tabular-nums' }}>{b}</span>
                </div>
              ))}
            </div>

            <IntensityBeam fill={vm.ifFill} reduce={reduce} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -S.sm }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.acid }}>{vm.effortLabel}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{vm.energyLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The route as an SVG path, for the moment before the tiles land.
 *
 * Latitude is compressed by cos(lat) so the shape is the road's shape rather
 * than a stretched one — without it a route at 52° N is drawn ~40 % too wide,
 * and a rider recognises their own local roads instantly enough to notice.
 */
export function fallbackPath(poly: [number, number][], w: number, h: number, pad = 34): string {
  const lats = poly.map((p) => p[0]), lngs = poly.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const kx = Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180)
  const gw = (maxLng - minLng) * kx || 1e-6
  const gh = (maxLat - minLat) || 1e-6
  const scale = Math.min((w - 2 * pad) / gw, (h - 2 * pad) / gh)
  const ox = pad + ((w - 2 * pad) - gw * scale) / 2
  const oy = pad + ((h - 2 * pad) - gh * scale) / 2
  return poly
    .map(([lat, lng], i) => `${i === 0 ? 'M' : 'L'}${(ox + (lng - minLng) * kx * scale).toFixed(1)} ${(oy + (maxLat - lat) * scale).toFixed(1)}`)
    .join(' ')
}

export { DASH }
