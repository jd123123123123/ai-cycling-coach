import { motion, useReducedMotion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { ChevronRight, Flame, Gauge, HeartPulse, Sparkles, Timer, Waves, Zap, type LucideIcon } from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, band, card, DASH } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3RideMapHero, { type W3RideHeroVm } from './W3RideMapHero'
import { TNUM } from './w3surfaces'
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
/** One of fitness, fatigue and form, as a position on its own scale plus where
 *  it stood a week ago — so the section can draw the move this ride caused
 *  rather than printing a signed number beside a bare figure. */
export interface W3Shift {
  key: string
  label: string
  value: string
  delta: string
  up: boolean
  /** Whether this direction is a good thing. Fatigue is never "good": it is the
   *  cost of the ride, and acid on this screen means you did something well. */
  good: boolean
  /** 0–1 on the quantity's own fixed scale. */
  fill: number
  /** Where it stood a week ago, same scale. Null with no history. */
  was: number | null
}

export interface W3Rank {
  dur: string
  /** The ride's own figure. */
  watts: string
  /** The record for that duration, or null when there is no history yet. */
  bestWatts: string | null
  /** "−22 W" · "NEUER BESTWERT" — the distance to the record, already signed. */
  note: string
  pr: boolean
  /** 0–1: the ride as a fraction of the record. The beam's lit part. */
  fill: number
}
export interface W3StatCard { v: string; l: string; s: string }

export interface MovedRow { label: string; delta: string; value: string; goal: string; beforePct: number; pct: number }

export interface W3RideVm {
  dateChip: string; sportChip: string; recordChip: string | null
  title: string
  bigStat: string; bigStatUnit: string; climb: string; avgSpeed: string
  power: number[]; powerNote: string
  // The GPX of the route + the ride's intensity (IF). Kept on the vm as well
  // as inside `hero` because the sections further down read them too — the
  // hero is a VIEW of this ride, not a second source of truth about it.
  polyline: [number, number][] | null; intensity: number
  /** Everything the map-and-card hero renders. See `W3RideMapHero`. */
  hero: W3RideHeroVm
  // "What it moved you toward" — real season totals + this ride's contribution.
  movedSub: string; moved: MovedRow[]; movedFoot: string
  stats: W3StatCard[]                // 4
  execScore: string; execTotal: string
  verdictHeadline: string; verdictBody: string; aiModel: string | null
  repeatsScore: string; repeatsSub: string; repeats: W3Repeat[]
  zonesSub: string; zones: W3Zone[]
  ranksSub: string; ranks: W3Rank[]
  onYouDelta: string; ceilingLabel: string; ceilingBefore: string; ceilingAfter: string
  shifts: W3Shift[]
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
  /** Opens the route full-screen. Omitted when there is nothing to open. */
  onExpandMap?: () => void
}

/**
 * THE ZONES, IN THE COLOURS EVERY CYCLIST ALREADY KNOWS.
 *
 * These were a ramp of white at rising alpha, with the ride's biggest zone in
 * acid — so the chart's only colour marked "the one you spent most time in",
 * which is the thing the bar lengths already say. A rider looking at a power
 * distribution arrives knowing what the colours mean: grey is recovery, blue is
 * endurance, green is tempo, yellow is threshold, orange is VO2, red is
 * anaerobic. Spending the palette on that is spending it on comprehension.
 *
 * TOKENS, NOT TRAFFIC-LIGHT HEX. Every one of these is a colour the app already
 * owns, so the chart belongs to this product rather than to a generic zone
 * chart — `isolation.test` enforces it, and it is right to.
 */
const ZONE_TINT = [T.d3, T.cool, T.training, T.acid, T.warn, T.bad] as const

/** Where the record beam starts. Efforts at these durations sit between about
 *  three-quarters and all of a rider's best; a zero-based bar would jam every
 *  one of them against the right-hand end and draw no difference at all. */
const RANK_FLOOR = 0.7
const zoneTint = (i: number) => ZONE_TINT[Math.min(i, ZONE_TINT.length - 1)]

const SectionHead = ({ n, t, s }: { n: string; t: string; s: string }) => (
  <div style={{ display: 'flex', gap: 12, paddingBottom: 4 }}>
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: T.acid }}>{n}</span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{t}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{s}</span>
    </div>
  </div>
)



// Icon per stat card, matched by its label keyword — supports the storytelling.
// The tiles are German and this matched on English words, so three of the four
// fell through to the same fallback icon and the grid read as one repeated
// shape. Matched on what the tile IS about, in the language it is written in.
const STAT_ICON = (label: string): LucideIcon => {
  const l = label.toLowerCase()
  if (l.includes('leistung') || l.includes('watt') || l.includes('power')) return Zap
  if (l.includes('arbeit') || l.includes('kj')) return Flame
  if (l.includes('hf') || l.includes('herz') || l.includes('bpm') || l.includes('heart')) return HeartPulse
  if (l.includes('variab')) return Waves
  if (l.includes('zeit') || l.includes('time') || l.includes('dauer')) return Timer
  return Gauge // Belastung / TSS / everything else
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

export default function W3RideDetailView({ vm, scene = SCENE_IDLE, onCompose, onOpenStudio, onBack, onShare, onExpandMap }: W3RideDetailProps) {
  // ── THE CHAPTERS ARE NUMBERED BY WHAT ACTUALLY RENDERS ──────────────────
  // These ordinals were hardcoded "01".."05", and two of the five are
  // conditional — the repeat set and the season push. So a free outdoor ride,
  // which is most rides, opened at chapter 02 with no 01 anywhere on the page.
  // A sequence with a hole in it is worse than no sequence: it reads as a
  // section that failed to load rather than one that was never relevant.
  const chapters = [
    vm.repeats.length > 0 && 'repeats',
    'zones', 'ranks', 'changes',
    vm.moved.length > 0 && 'moved',
  ].filter(Boolean) as string[]
  const ch = (key: string) => String(chapters.indexOf(key) + 1).padStart(2, '0')

  const reduce = useReducedMotion()
  const pMax = Math.max(1, ...vm.power)
  const pAvg = vm.power.length ? vm.power.reduce((a, b) => a + b, 0) / vm.power.length : 0
  const [hov, setHov] = useState<number | null>(null)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />

        {/* ── THE HERO: map, then the ride's own portrait, then the numbers ──
             Rebuilt from pen frame `XqpcX`. The route is now a REAL basemap
             rather than a bare SVG trace over a wash — a rider recognises the
             roads they took, and recognising them is most of what a ride
             summary is for. The scene render moved INSIDE the card and
             dissolves into the numbers, so the picture is the card's material
             rather than a photograph with a card under it.

             The old cover's intensity chip and the big distance figure are not
             lost, they moved: intensity is now the beam at the bottom of the
             card (a proportion of threshold, which is what IF actually is,
             instead of a word in a pill), and distance is the first of the
             three stats under the duration. See `W3RideMapHero`. ── */}
        <W3RideMapHero
          vm={vm.hero}
          onBack={onBack}
          onShare={onShare}
          onExpandMap={onExpandMap}
          sceneOverlay={(() => {
            const canCompose = scene.status === 'not_generated' && !scene.pending
            const note = scene.pending ? null
              : scene.failed ? { text: 'Das Bild kam nicht durch. Deine Straße ist noch da — versuch es nochmal.' }
              : scene.status === 'needs_rider' ? { text: 'Digitalisiere deinen Fahrer einmal, und jede Fahrt bekommt ein Titelbild mit dir darauf.', action: 'Avatar erstellen', onClick: () => onOpenStudio?.('rider') }
              : scene.status === 'needs_bike' ? { text: 'Stell dein Rad in die Garage, und diese Straße wird vom echten Rad gefahren.', action: 'Rad hinzufügen', onClick: () => onOpenStudio?.('bike') }
              : scene.status === 'image_model_unavailable' ? { text: 'Das Studio ist gerade nicht verbunden. Deine Route hält das Titelbild.' }
              : null
            if (!canCompose && !note && !scene.pending) return null
            return (
              // Over a picture it floats in the corner; with no picture it is an
              // ordinary row at the top of the card (the hero places it there),
              // so it never has to hover in an empty rectangle.
              <div style={vm.hero.sceneImage ? {
                position: 'absolute', top: 18, left: 20, right: 20, zIndex: 4,
                display: 'flex', justifyContent: 'flex-end',
              } : { display: 'flex', justifyContent: 'flex-start' }}>
                {canCompose && <ScenePill label={scene.failed ? 'Nochmal versuchen' : 'Sieh dich hier'} onClick={onCompose} />}
                {note && <SceneNote {...note} />}
                {scene.pending && <SceneComposing />}
              </div>
            )
          })()}
        />


        {/* ── Leistung · ganze Fahrt ────────────────────────────────────
             This lived inside the old hero card. It is a section of its own
             now, which is where it belonged: the hero answers "what was this
             ride", and the trace answers "how did you ride it" — a different
             question, and one worth the width. Interactive: a pointer over any
             bar reads out its watts, and the Ø rule is the ride's own average
             so a bar above it is above average BY EYE, with no legend. ── */}
        {vm.power.length > 1 && (
          <div style={{ ...band(26), gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Kicker>Leistung · ganze Fahrt</Kicker>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.acid }}>
                {hov != null ? `${Math.round(vm.power[hov])} W` : vm.powerNote}
              </span>
            </div>
            <div style={{ position: 'relative', height: 56, display: 'flex', gap: 2, alignItems: 'flex-end' }}
              onPointerLeave={() => setHov(null)}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((pAvg / pMax) * 56), height: 1, background: `${T.ink}55`, zIndex: 1, pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', right: 0, top: -12, fontSize: 8, fontWeight: 700, color: T.mid }}>Ø</span>
              </div>
              {vm.power.map((p, i) => {
                const on = hov === i
                return (
                  <motion.div key={i} onPointerEnter={() => setHov(i)}
                    initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(i * 0.012)}
                    style={{ flex: 1, height: Math.max(3, Math.round((p / pMax) * 56)), transformOrigin: 'bottom', borderRadius: 1, cursor: 'pointer',
                      background: on ? T.ink : p / pMax > 0.7 ? T.acid : T.d2 }} />
                )
              })}
            </div>
          </div>
        )}

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

        {/* Execution + AI verdict.

            THE SCORE IS A GRADE AGAINST A PRESCRIPTION, so it appears on the
            same terms as "Hast du gehalten?" — a free outdoor ride was not
            executed WELL or BADLY, it was just ridden, and a 94/100 stamped on
            it is a mark out of nothing. The coach's sentence stays either way;
            that one is about the ride rather than about compliance. */}
        <div style={{ ...band(28), gap: 12 }}>
          {vm.repeats.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <span style={{ fontSize: 94, fontWeight: 700, letterSpacing: -4, lineHeight: 0.8, color: T.acid }}>{vm.execScore}</span>
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.quiet }}>/ {vm.execTotal}</span>
              <Kicker>Ausführung</Kicker>
            </div>
          </div>
          )}
          {vm.repeats.length > 0 && (
          <div style={{ height: 6, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
            <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${(Number(vm.execScore) / Number(vm.execTotal)) * 100}%` }} transition={{ duration: 0.9 }} style={{ height: '100%', background: T.acid, borderRadius: 100 }} />
          </div>
          )}
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.25, color: T.ink }}>{vm.verdictHeadline}</span>
          <span style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: T.mid }}>{vm.verdictBody}</span>
          {vm.aiModel && <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, color: T.quiet }}>KI-Urteil · {vm.aiModel}</span>}
        </div>

        {/* 01 Did you hold it */}
        {vm.repeats.length > 0 && (
          <div style={{ ...band(28), gap: 12 }}>
            <SectionHead n={ch('repeats')} t="Hast du gehalten?" s="Jede Wiederholung gegen ihr Ziel. Rechts der Linie heißt über Ziel." />
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
          <SectionHead n={ch('zones')} t="Was sie dir abverlangt hat" s={vm.zonesSub} />
          <div style={{ padding: 18, borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 1, height: 16 }}>
              {vm.zones.map((z, i) => (
                <motion.div key={z.z} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(i * 0.06)}
                  style={{ flexGrow: Math.max(0.4, z.pct), transformOrigin: 'left', height: 16, background: zoneTint(i),
                    borderRadius: i === 0 ? '4px 0 0 4px' : i === vm.zones.length - 1 ? '0 4px 4px 0' : 0 }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {vm.zones.map((z, i) => (
                <div key={z.z} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '9px 0' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: zoneTint(i) }} />
                  <span style={{ width: 48, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{z.z}</span>
                  {/* The zone the ride lived in is still called out — by WEIGHT
                      now, not by colour, because colour has a job here. */}
                  <span style={{ width: 74, fontSize: 11.5, fontWeight: z.peak ? 800 : 600, color: z.peak ? T.ink : T.mid }}>{z.name}</span>
                  <div style={{ flex: 1, height: 1, background: T.rule }} />
                  {/* MINUTES, NOT MINUTES AND PERCENT. The stacked bar directly
                      above this list is the proportion — that is the only thing
                      a stacked bar is — so printing the same split again as
                      percentages made five rows carry two numbers where one was
                      new. Minutes stay because they are the part the bar cannot
                      tell you: how long, in units a rider feels. */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.mid, ...TNUM }}>{z.min}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 03 Where it ranks */}
        <div style={{ ...band(28), gap: 12 }}>
          <SectionHead n={ch('ranks')} t="Wo sie steht" s={vm.ranksSub} />
          <div style={{ padding: '4px 18px 12px', borderRadius: 22, background: T.surface }}>
            {/* ── EACH DURATION AS A BEAM AGAINST THE RECORD ──────────────
                This was a table: duration, watts, and a sentence saying what
                the record was — which left the rider subtracting two numbers in
                their head, five times, to answer the only question they came
                with. The track IS the record and the lit part is this ride, so
                the gap between them is the answer, drawn.

                The scale is deliberately NOT zero-based: at threshold a rider
                is never at 20% of their record, so a zero-based bar would put
                every effort against the right-hand wall and show nothing. The
                beam starts where the efforts live and the tick marks the
                record — see `RANK_FLOOR`. */}
            {vm.ranks.map((r, i) => {
              const lit = Math.max(0, Math.min(1, (r.fill - RANK_FLOOR) / (1 - RANK_FLOOR)))
              return (
              <div key={r.dur} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '15px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.quiet, width: 42, flex: 'none' }}>{r.dur}</span>
                    <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: r.pr ? T.acid : T.ink, ...TNUM }}>{r.watts}</span>
                  </div>
                  <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: r.pr ? T.acid : T.mid, ...TNUM }}>{r.note}</span>
                </div>

                <div style={{ position: 'relative', height: 10, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
                  <motion.div
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.round(lit * 100)}%` }}
                    transition={grow(0.05 + i * 0.05)}
                    style={{ height: '100%', borderRadius: 100, background: r.pr ? T.acid : T.d4 }} />
                  {/* The record, standing at the end of the track. A PR has
                      passed it, so it is not drawn against its own beam. */}
                  {!r.pr && (
                    <div style={{ position: 'absolute', right: 0, top: -2, bottom: -2, width: 2, background: T.acid, opacity: 0.9 }} />
                  )}
                </div>

                {/* NO "BESTWERT 1.240 W" LINE. The tick at the end of the beam
                    IS the record and "−60 W" is the distance to it: printing the
                    record as well gives the rider the same fact a third time and
                    costs a line of type under every one of five rows. Anyone who
                    wants the absolute number can add sixty to what they rode —
                    and the ones who care about that number are looking at the
                    Bestwerte page, not at this ride. */}
              </div>
            )})}
          </div>
        </div>

        {/* 04 What this changes */}
        <div style={{ ...band(28), gap: 12 }}>
          <SectionHead n={ch('changes')} t="Was das verändert" s="Die Fahrt ist vorbei. Das sind die Zahlen, die sie bewegt hat." />
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

            {/* ── THE THREE, DRAWN AS MOVEMENTS ──────────────────────────────
                These were three bare figures with a signed number beside each.
                A "+3" does not show a rider that their fatigue now stands above
                their fitness, which is the thing you look at this for. Each one
                sits on its own fixed scale with a tick where it stood a week
                ago, so the ride's effect is the distance between the tick and
                the bar — and the three bars can be read against each other.

                Colour says what the direction MEANS, not which way it went:
                fitness gaining is acid, form falling is cool, and fatigue is
                always the warn tint because it is the price, never a win. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {vm.shifts.map((sh, i) => {
                const tint = sh.key === 'fatigue' ? T.warn : sh.good ? T.acid : T.cool
                return (
                  <div key={sh.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>{sh.label}</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: T.ink, ...TNUM }}>{sh.value}</span>
                        {sh.delta && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: tint, ...TNUM }}>{sh.delta}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: 9, borderRadius: 100, background: T.d1, overflow: 'visible' }}>
                      <motion.div
                        initial={reduce ? false : { width: 0 }}
                        animate={{ width: `${Math.round(sh.fill * 100)}%` }}
                        transition={grow(0.06 + i * 0.06)}
                        style={{ height: '100%', borderRadius: 100, background: tint }} />
                      {sh.was != null && (
                        <div
                          title="vor einer Woche"
                          style={{
                            position: 'absolute', left: `${Math.round(sh.was * 100)}%`, top: -3, bottom: -3,
                            width: 2, marginLeft: -1, background: T.ink, opacity: 0.55, borderRadius: 2,
                          }} />
                      )}
                    </div>
                  </div>
                )
              })}
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.4, color: T.quiet }}>
                Die helle Marke ist der Stand vor einer Woche.
              </span>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.mid }}>{vm.changesBody}</span>
          </div>
        </div>

        {/* 05 What it moved you toward — this ride's push toward the season goals */}
        {vm.moved.length > 0 && (
          <div style={{ ...band(44), gap: 12 }}>
            <SectionHead n={ch('moved')} t="Worauf sie dich zubewegt hat" s={vm.movedSub} />
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
