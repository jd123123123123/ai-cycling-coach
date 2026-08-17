import { motion, useReducedMotion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { Share2, Zap, Timer, Gauge, HeartPulse, Sparkles, ChevronRight, type LucideIcon } from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, band, card, DASH } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import './w3.css'

/**
 * W3 · 07 RIDE DETAIL — 1:1 code rebuild of `w3.pen` frame `zaZ4s`. Pure
 * function of `vm`; `W3RideDetailPage` builds it from `fetchActivityDebrief`
 * + `usePMC`. Every number is REAL post-ride data: header, stat cards, zone
 * split, power PRs, the AI execution verdict, the 5-min ceiling change from
 * the effort matches, and the fitness/fatigue/form (CTL/ATL/TSB) trend from
 * the PMC series. The per-repeat "held it" rows come from the ride's climb
 * segments (this is a hill-repeat ride); the section is omitted when the ride
 * has no repeatable climbs. Absent signals render as an honest "—".
 */

export interface W3Repeat { label: string; watts: string; delta: number; verdict: string }
export interface W3Zone { z: string; name: string; min: string; pct: number; peak: boolean }
export interface W3Rank { dur: string; watts: string; note: string; pr: boolean; fill: number }
export interface W3StatCard { v: string; l: string; s: string }

export interface MovedRow { label: string; delta: string; value: string; goal: string; beforePct: number; pct: number }

export interface W3RideVm {
  dateChip: string; sportChip: string; recordChip: string | null
  title: string
  bigStat: string; bigStatUnit: string; climb: string; avgSpeed: string
  power: number[]; powerNote: string
  // The GPX of the route + the ride's intensity (IF) — the header is generated
  // from these: the route shape, tinted by how hard the ride was.
  polyline: [number, number][] | null; intensity: number
  // "What it moved you toward" — real season totals + this ride's contribution.
  movedSub: string; moved: MovedRow[]; movedFoot: string
  stats: W3StatCard[]                // 4
  execScore: string; execTotal: string
  verdictHeadline: string; verdictBody: string; aiModel: string | null
  repeatsScore: string; repeatsSub: string; repeats: W3Repeat[]
  zonesSub: string; zones: W3Zone[]
  ranksSub: string; ranks: W3Rank[]
  onYouDelta: string; ceilingLabel: string; ceilingBefore: string; ceilingAfter: string
  fitness: string; fitnessD: string; fatigue: string; fatigueD: string; form: string; formD: string
  changesBody: string
}

/**
 * The composed hero for this ride — the rider's own avatar, on their own bike,
 * in a scene built from this ride's terrain. Read-only state: the View never
 * fetches or renders anything, `W3RideDetailPage` owns the calls.
 *
 * `loading` covers the cache read still being in flight (and any read error):
 * the route trace is instant and real, so it stands in rather than a spinner.
 */
export type W3SceneStatus =
  | 'loading'
  | 'ok'                       // `image` is a data URI, ready to be the cover
  | 'not_generated'            // rider + bike exist — composing is one tap away
  | 'needs_rider'              // send them to the avatar studio first
  | 'needs_bike'               // send them to the bike studio first
  | 'image_model_unavailable'  // no image model server-side; offer nothing

export interface W3RideSceneState {
  status: W3SceneStatus
  image: string | null   // data:image/png;base64,… — only ever set with 'ok'
  pending: boolean       // the compose call is in flight (it can take ~2 min)
  failed: boolean        // the last explicit compose attempt errored out
}

/** No scene prop → the cover behaves exactly as it did before: the route trace. */
const SCENE_IDLE: W3RideSceneState = { status: 'loading', image: null, pending: false, failed: false }

export interface W3RideDetailProps {
  vm: W3RideVm
  /** Omitted → the cover stays the route trace, exactly as before. */
  scene?: W3RideSceneState
  /** Explicit intent only: this fires the slow, paid image-model call. */
  onCompose?: () => void
  onOpenStudio?: (kind: 'rider' | 'bike') => void
  onBack?: () => void
  onShare?: () => void
}

const SectionHead = ({ n, t, s }: { n: string; t: string; s: string }) => (
  <div style={{ display: 'flex', gap: 12, paddingBottom: 4 }}>
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: T.acid }}>{n}</span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{t}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{s}</span>
    </div>
  </div>
)

function SegGauge({ fill, on, delay }: { fill: number; on: boolean; delay: number }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 10, width: '100%' }}>
      {Array.from({ length: 20 }, (_, k) => {
        const lit = k / 20 < fill
        return <motion.div key={k} initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(delay + k * 0.01)}
          style={{ flex: 1, height: lit ? (on ? 10 : 8) : 5, transformOrigin: 'bottom', borderRadius: 1, background: lit ? (on ? T.acid : T.d3) : T.rule }} />
      })}
    </div>
  )
}

/** GPX [lat,lng] → an SVG path normalised into a 0..100 box (lat flipped). */
function routePath(pts: [number, number][]): string {
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const sLat = Math.max(1e-6, maxLat - minLat), sLng = Math.max(1e-6, maxLng - minLng)
  const s = Math.min(94 / sLng, 94 / sLat), ox = (100 - sLng * s) / 2, oy = (100 - sLat * s) / 2
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(ox + (p[1] - minLng) * s).toFixed(1)} ${(oy + (maxLat - p[0]) * s).toFixed(1)}`).join(' ')
}
/** Ride intensity (IF) → the hero's accent colour + a plain-word label. */
const intensityColor = (iff: number): string => iff >= 1.02 ? '#FF6A3D' : iff >= 0.92 ? T.warn : iff >= 0.8 ? T.acid : T.training
const intensityLabel = (iff: number): string => iff >= 1.02 ? 'VO2 · anaerob' : iff >= 0.92 ? 'Schwelle' : iff >= 0.8 ? 'Tempo' : iff >= 0.6 ? 'Ausdauer' : 'Erholung'

// Icon per stat card, matched by its label keyword — supports the storytelling.
const STAT_ICON = (label: string): LucideIcon => {
  const l = label.toLowerCase()
  if (l.includes('power') || l.includes('watt')) return Zap
  if (l.includes('time') || l.includes('moving') || l.includes('dur')) return Timer
  if (l.includes('hr') || l.includes('heart') || l.includes('bpm')) return HeartPulse
  return Gauge // load / TSS / everything else
}

/** The wait while the scene composes — W3Loading's language (acid bloom,
 *  spinning arc, the ✱ mark), sized down to live inside the cover. Never a dead
 *  frame: it says what is being made and roughly how long it takes. */
function SceneComposing() {
  const reduce = useReducedMotion()
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 46, background: `${T.bg}D9` }}>
      <div style={{ position: 'relative', width: 56, height: 56, display: 'grid', placeItems: 'center' }}>
        <motion.div
          animate={reduce ? undefined : { scale: [1, 1.35, 1], opacity: [0.5, 0.15, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', width: 56, height: 56, borderRadius: 100, background: T.acid, filter: 'blur(16px)', opacity: 0.4 }} />
        <motion.svg width={56} height={56} viewBox="0 0 76 76"
          animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute' }}>
          <circle cx={38} cy={38} r={32} fill="none" stroke={T.rule} strokeWidth={4} />
          <path d="M38 6 a32 32 0 0 1 32 32" fill="none" stroke={T.acid} strokeWidth={4} strokeLinecap="round" />
        </motion.svg>
        <motion.span
          animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ fontSize: 19, fontWeight: 800, color: T.acid, letterSpacing: -1 }}>✱</motion.span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 30px', textAlign: 'center' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>Wir malen dich auf diese Straße…</span>
        <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.35, color: T.quiet }}>Dein Fahrer, dein Rad, das Terrain dieser Fahrt. Bis zu zwei Minuten.</span>
      </div>
    </div>
  )
}

/** The one affordance that composes the scene. Acid on black, top-right of the
 *  cover so it never fights the hero card overlapping the bottom. */
const ScenePill = ({ label, onClick }: { label: string; onClick?: () => void }) => (
  <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px 7px 10px', borderRadius: 100, background: T.acid, border: 0, cursor: 'pointer', fontFamily: FONT }}>
    <Sparkles size={12} color={T.bg} />
    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: T.bg }}>{label}</span>
  </button>
)

/** A quiet line in the cover: what is missing, and the studio that fixes it. */
function SceneNote({ text, action, onClick }: { text: string; action?: string; onClick?: () => void }) {
  const box: CSSProperties = {
    position: 'absolute', top: 48, left: 20, zIndex: 4, maxWidth: 272, textAlign: 'left',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
    padding: '9px 12px', borderRadius: 14, background: '#000000A6', border: 0, fontFamily: FONT,
  }
  const body = (
    <>
      <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.35, color: T.mid }}>{text}</span>
      {action && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: T.acid }}>
          {action}<ChevronRight size={12} color={T.acid} />
        </span>
      )}
    </>
  )
  return onClick
    ? <button onClick={onClick} style={{ ...box, cursor: 'pointer' }}>{body}</button>
    : <div style={box}>{body}</div>
}

export default function W3RideDetailView({ vm, scene = SCENE_IDLE, onCompose, onOpenStudio, onBack, onShare }: W3RideDetailProps) {
  const reduce = useReducedMotion()
  const pMax = Math.max(1, ...vm.power)
  const pAvg = vm.power.length ? vm.power.reduce((a, b) => a + b, 0) / vm.power.length : 0
  const [hov, setHov] = useState<number | null>(null)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />

        {/* Nav */}
        <W3TopBar title="Fahrt im Detail" onBack={onBack}
          extra={<button onClick={onShare} aria-label="Teilen" style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Share2 size={16} color={T.ink} /></button>} />

        {/* Cover — the rider's own avatar on their own bike, in a scene composed
             from this ride's terrain, when one has been composed. Until then the
             cover is GENERATED from the GPX route, tinted by the ride's
             intensity: the route shape glows in the intensity accent, over an
             intensity-lit wash. Falls back to the ride's power silhouette when
             there's no GPS. The route trace is instant and real, so it also
             stands in while the scene is being read or made. */}
        {(() => {
          const acc = intensityColor(vm.intensity)
          const hasRoute = vm.polyline != null && vm.polyline.length > 1
          const showScene = scene.status === 'ok' && !!scene.image && !scene.pending
          const canCompose = scene.status === 'not_generated' && !scene.pending
          const note: { text: string; action?: string; onClick?: () => void } | null = scene.pending ? null
            : scene.failed ? { text: 'Das Bild kam nicht durch. Deine Straße ist noch da — versuch es nochmal.' }
            : scene.status === 'needs_rider' ? { text: 'Digitalisiere deinen Fahrer einmal, und jede Fahrt bekommt ein Titelbild mit dir darauf.', action: 'Avatar erstellen', onClick: () => onOpenStudio?.('rider') }
            : scene.status === 'needs_bike' ? { text: 'Stell dein Rad in die Garage, und diese Straße wird vom echten Rad gefahren.', action: 'Rad hinzufügen', onClick: () => onOpenStudio?.('bike') }
            : scene.status === 'image_model_unavailable' ? { text: 'Das Studio ist gerade nicht verbunden. Deine Route hält das Titelbild.' }
            : null
          return (
            <div style={{ height: showScene ? 264 : 210, margin: '8px 0 0', position: 'relative', overflow: 'hidden', background: `radial-gradient(120% 95% at 60% 12%, ${acc}2E, ${T.bg})` }}>
              {/* The scene is a square render; the cover grows for it so the crop
                  keeps the rider clear of the scrim and the overlapping card. */}
              {showScene ? (
                <motion.img src={scene.image!} alt="Du, auf deinem Rad, auf dieser Fahrt"
                  initial={reduce ? false : { opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: EASE }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 42%' }} />
              ) : hasRoute ? (
                <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                  <defs>
                    <linearGradient id="rdroute" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={acc} />
                      <stop offset="100%" stopColor={T.acid} />
                    </linearGradient>
                  </defs>
                  {/* soft glow underlay */}
                  <path d={routePath(vm.polyline!)} fill="none" stroke={acc} strokeWidth={6} strokeOpacity={0.22} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: 'blur(3px)' }} />
                  <motion.path d={routePath(vm.polyline!)} fill="none" stroke="url(#rdroute)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                    initial={reduce ? false : { pathLength: 0, opacity: 0.3 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.15, ease: EASE }} />
                </svg>
              ) : vm.power.length > 1 ? (() => {
                const n = vm.power.length
                const pts = vm.power.map((p, i) => `${(i / (n - 1)) * 100},${100 - Math.max(2, (p / pMax) * 92)}`).join(' ')
                return (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <defs>
                      <linearGradient id="rdfill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={acc} stopOpacity="0.34" />
                        <stop offset="100%" stopColor={acc} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <motion.polygon points={`0,100 ${pts} 100,100`} fill="url(#rdfill)"
                      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: EASE }} />
                    <polyline points={pts} fill="none" stroke={acc} strokeWidth={0.9} strokeOpacity={0.9} vectorEffect="non-scaling-stroke" />
                  </svg>
                )
              })() : null}
              {/* intensity chip — stays on top of the scene — and, opposite it,
                  the single affordance that composes one. */}
              <div style={{ position: 'absolute', top: 14, left: 20, right: 20, zIndex: 4, display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '6px 12px 6px 10px', borderRadius: 100, background: '#000000A6' }}>
                  <Zap size={12} color={acc} fill={acc} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: T.ink }}>{intensityLabel(vm.intensity)}</span>
                  {vm.intensity > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: T.quiet }}>· IF {vm.intensity.toFixed(2)}</span>}
                </div>
                {canCompose && <ScenePill label={scene.failed ? 'Nochmal versuchen' : 'Sieh dich hier'} onClick={onCompose} />}
              </div>
              {note && <SceneNote {...note} />}
              {scene.pending && <SceneComposing />}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, zIndex: 2, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
            </div>
          )
        })()}

        {/* Hero card */}
        <div style={{ ...band(20), marginTop: -54 }}>
          <div style={{ padding: '16px 18px', borderRadius: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {[vm.dateChip, vm.sportChip].map((c) => <span key={c} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.mid, padding: '5px 9px', borderRadius: 100, background: T.rule }}>{c}</span>)}
              {vm.recordChip && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.bg, padding: '5px 9px', borderRadius: 100, background: T.acid }}>{vm.recordChip}</span>}
            </div>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: T.ink }}>{vm.title}</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <span style={{ fontSize: 62, fontWeight: 700, letterSpacing: -3, lineHeight: 0.8, color: T.acid }}>{vm.bigStat}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 6 }}>
                  <Kicker>{vm.bigStatUnit}</Kicker>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{vm.climb}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', paddingBottom: 6 }}>
                <Kicker>Ø Tempo</Kicker>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{vm.avgSpeed}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Kicker>Leistung · ganze Fahrt</Kicker>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.acid }}>
                  {hov != null ? `${Math.round(vm.power[hov])} W` : vm.powerNote}
                </span>
              </div>
              {/* Interactive power trace with an average trend line. Hover a bar
                  to read its watts (touch-friendly: pointer events). */}
              <div style={{ position: 'relative', height: 46, display: 'flex', gap: 2, alignItems: 'flex-end' }}
                onPointerLeave={() => setHov(null)}>
                {/* average trend line */}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((pAvg / pMax) * 46), height: 1, background: `${T.ink}55`, zIndex: 1, pointerEvents: 'none' }}>
                  <span style={{ position: 'absolute', right: 0, top: -12, fontSize: 8, fontWeight: 700, color: T.mid }}>Ø</span>
                </div>
                {vm.power.map((p, i) => {
                  const on = hov === i
                  return (
                    <motion.div key={i} onPointerEnter={() => setHov(i)}
                      initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(i * 0.012)}
                      style={{ flex: 1, height: Math.max(3, Math.round((p / pMax) * 46)), transformOrigin: 'bottom', borderRadius: 1, cursor: 'pointer',
                        background: on ? T.ink : p / pMax > 0.7 ? T.acid : '#FFFFFF33' }} />
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Hero stats */}
        <div style={{ ...band(26), gap: 8 }}>
          {[[0, 1], [2, 3]].map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 8 }}>
              {row.map((i) => {
                const s = vm.stats[i]
                const Ic = STAT_ICON(s.l)
                return (
                  <div key={i} style={{ flex: 1, padding: '15px 16px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Ic size={16} color={T.acid} /></div>
                    <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.7, color: s.v === DASH ? T.quiet : T.ink }}>{s.v}</span>
                    <Kicker>{s.l}</Kicker>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{s.s}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Execution + AI verdict */}
        <div style={{ ...band(28), gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <span style={{ fontSize: 94, fontWeight: 700, letterSpacing: -4, lineHeight: 0.8, color: T.acid }}>{vm.execScore}</span>
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.quiet }}>/ {vm.execTotal}</span>
              <Kicker>Ausführung</Kicker>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 100, background: '#FFFFFF14', overflow: 'hidden' }}>
            <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${(Number(vm.execScore) / Number(vm.execTotal)) * 100}%` }} transition={{ duration: 0.9 }} style={{ height: '100%', background: T.acid, borderRadius: 100 }} />
          </div>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.25, color: T.ink }}>{vm.verdictHeadline}</span>
          <span style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: T.mid }}>{vm.verdictBody}</span>
          {vm.aiModel && <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, color: T.quiet }}>KI-Urteil · {vm.aiModel}</span>}
        </div>

        {/* 01 Did you hold it */}
        {vm.repeats.length > 0 && (
          <div style={{ ...band(28), gap: 12 }}>
            <SectionHead n="01" t="Hast du gehalten?" s="Jede Wiederholung gegen ihr Ziel. Rechts der Linie heißt über Ziel." />
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', paddingBottom: 4 }}>
              <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1.5, color: T.acid }}>{vm.repeatsScore}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 4 }}>
                <Kicker>Wdh. auf oder über Ziel</Kicker>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: T.ink }}>{vm.repeatsSub}</span>
              </div>
            </div>
            <div style={{ padding: '4px 18px 12px', borderRadius: 22, background: T.surface }}>
              {vm.repeats.map((r, i) => {
                const held = r.delta >= 0
                const mag = Math.min(1, Math.abs(r.delta) / 12)
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '13px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                    <div style={{ width: 66, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{r.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{r.watts}</span>
                    </div>
                    <div style={{ flex: 1, height: 24, display: 'flex', alignItems: 'center', position: 'relative' }}>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{!held && <motion.div initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(i * 0.04)} style={{ transformOrigin: 'right', width: `${mag * 100}%`, height: 14, borderRadius: '3px 0 0 3px', background: T.d3 }} />}</div>
                      <div style={{ width: 1, height: 24, background: '#FFFFFF8C' }} />
                      <div style={{ flex: 1 }}>{held && <motion.div initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(i * 0.04)} style={{ transformOrigin: 'left', width: `${mag * 100}%`, height: 14, borderRadius: '0 3px 3px 0', background: T.acid }} />}</div>
                    </div>
                    <div style={{ width: 56, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: held ? T.acid : T.mid }}>{r.delta >= 0 ? '+' : ''}{r.delta} W</span>
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{r.verdict}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 02 What it asked of you */}
        <div style={{ ...band(28), gap: 12 }}>
          <SectionHead n="02" t="Was sie dir abverlangt hat" s={vm.zonesSub} />
          <div style={{ padding: 18, borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 1, height: 16 }}>
              {vm.zones.map((z, i) => (
                <motion.div key={z.z} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(i * 0.06)}
                  style={{ flexGrow: Math.max(0.4, z.pct), transformOrigin: 'left', height: 16, background: z.peak ? T.acid : `rgba(255,255,255,${0.08 + i * 0.1})`,
                    borderRadius: i === 0 ? '4px 0 0 4px' : i === vm.zones.length - 1 ? '0 4px 4px 0' : 0 }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {vm.zones.map((z) => (
                <div key={z.z} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '9px 0' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: z.peak ? T.acid : 'rgba(255,255,255,.3)' }} />
                  <span style={{ width: 48, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{z.z}</span>
                  <span style={{ width: 74, fontSize: 11.5, fontWeight: 700, color: z.peak ? T.acid : T.ink }}>{z.name}</span>
                  <div style={{ flex: 1, height: 1, background: T.rule }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.mid }}>{z.min}</span>
                  <span style={{ width: 32, textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.quiet }}>{z.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 03 Where it ranks */}
        <div style={{ ...band(28), gap: 12 }}>
          <SectionHead n="03" t="Wo sie steht" s={vm.ranksSub} />
          <div style={{ padding: '4px 18px 12px', borderRadius: 22, background: T.surface }}>
            {vm.ranks.map((r, i) => (
              <div key={r.dur} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.quiet, width: 36 }}>{r.dur}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: r.pr ? T.acid : T.ink }}>{r.watts}</span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: r.pr ? T.acid : T.quiet }}>{r.note}</span>
                </div>
                <SegGauge fill={r.fill} on={r.pr} delay={i * 0.03} />
              </div>
            ))}
          </div>
        </div>

        {/* 04 What this changes */}
        <div style={{ ...band(28), gap: 12 }}>
          <SectionHead n="04" t="Was das verändert" s="Die Fahrt ist vorbei. Das sind die Zahlen, die sie bewegt hat." />
          <div style={{ ...card(), gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Kicker>An dir</Kicker>
                <span style={{ fontSize: 42, fontWeight: 700, letterSpacing: -2, color: T.acid }}>{vm.onYouDelta}<span style={{ fontSize: 16, letterSpacing: 0 }}> W</span></span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                <Kicker>{vm.ceilingLabel}</Kicker>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{vm.ceilingBefore} → {vm.ceilingAfter}</span>
              </div>
            </div>
            <div style={{ height: 1, background: T.rule }} />
            <div style={{ display: 'flex', gap: 10 }}>
              {[['FITNESS', vm.fitness, vm.fitnessD], ['ERMÜDUNG', vm.fatigue, vm.fatigueD], ['FORM', vm.form, vm.formD]].map(([l, v, d]) => (
                <div key={l} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>{v}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: d.startsWith('-') ? T.cool : T.acid }}>{d}</span>
                  </div>
                  <Kicker>{l}</Kicker>
                </div>
              ))}
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.mid }}>{vm.changesBody}</span>
          </div>
        </div>

        {/* 05 What it moved you toward — this ride's push toward the season goals */}
        {vm.moved.length > 0 && (
          <div style={{ ...band(44), gap: 12 }}>
            <SectionHead n="05" t="Worauf sie dich zubewegt hat" s={vm.movedSub} />
            <div style={{ ...card(), gap: 18 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.acid }}>AUF DAS JAHR</span>
              {vm.moved.map((m, i) => (
                <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.quiet }}>{m.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: T.bg, padding: '3px 8px', borderRadius: 100, background: T.acid }}>{m.delta}</span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{m.value} <span style={{ color: T.quiet, fontWeight: 600 }}>/ {m.goal}</span></span>
                  </div>
                  <div style={{ height: 8, borderRadius: 100, background: T.surface2, overflow: 'hidden', display: 'flex' }}>
                    <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(m.beforePct * 100)}%` }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }}
                      style={{ height: '100%', background: T.acidDeep }} />
                    <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(Math.max(0, m.pct - m.beforePct) * 100)}%` }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 + 0.25 }}
                      style={{ height: '100%', background: T.acid, boxShadow: `0 0 8px ${T.acid}` }} />
                  </div>
                </div>
              ))}
              <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>{vm.movedFoot}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
