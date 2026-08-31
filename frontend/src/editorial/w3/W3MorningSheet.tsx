import { useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Crown, X } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { scoreHue } from './W3TodayDock'
import { TNUM } from './w3surfaces'
import type { Contributor, MorningBriefing } from './useMorningBriefing'
import './w3.css'

/**
 * THE MORNING BRIEFING — transcribed from pen `AfZLS`.
 *
 * Split from `W3MorningGate` because the gate is all TIMING — once a day, only
 * in the morning, never on top of another sheet — and none of that can be
 * looked at. This half can: `/e/w3-morning-preview` renders it without a
 * session, which is how it was built at 390x844.
 *
 * ── WHY THIS DOES NOT LOOK LIKE THE REST OF THE APP, ON PURPOSE ──────────
 * Four earlier passes tried to make a black-ground, flat-card screen feel
 * calm and none of them did, because the problem was never the layout. A flat
 * near-black rectangle under a maximum-chroma accent is the material of a
 * warning label. The pen's answer is an ATMOSPHERE: three broad radial washes
 * — warm where the sun would be, violet low left, acid low right — under
 * cards made of glass rather than paint. The colour does no work; it is the
 * room the numbers stand in.
 *
 * ── THE INSTRUMENTS ──────────────────────────────────────────────────────
 *   · a 250° arc, warm→acid as it fills, with its own bloom
 *   · a session profile in two materials: effort hot, recovery cool
 *   · a spectrum per signal: the band, and where you landed on it
 *   · the day as hours you can put a thumb on
 *
 * ── AND IT STILL HAS TO BE TRUE ──────────────────────────────────────────
 * The arc draws EMPTY when the readiness gate withholds — never a plausible
 * angle. A rest day gets no ride window. Nothing here is decorative except the
 * sky, and the sky carries no data.
 */

const TONE_LABEL: Record<string, string> = {
  go: 'Heute wird gearbeitet',
  easy: 'Heute locker',
  rest: 'Heute Ruhe',
  unknown: 'Heute offen',
}

/** Arrows point where the wind blows FROM, the way a rider reads a flag. */
const DIR_DEG: Record<string, number> = {
  N: 180, NE: 225, E: 270, SE: 315, S: 0, SW: 45, W: 90, NW: 135,
}

/**
 * THE APP'S CARD, NOT THE PEN'S.
 *
 * The pen draws glass: a white vertical wash and a hairline. Held next to
 * Today that is visibly a brighter object from a different product — house
 * rule 2 is that cards are LIT, not framed, and every other W3 surface is flat
 * `heroDock` with a soft shadow and no edge at all. Depth from tone, never from
 * a drawn line.
 */
const card = (radius: number) => ({
  background: T.heroDock,
  borderRadius: radius,
  boxShadow: `0 2px 10px ${T.bg}40`,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  width: '100%',
})

/**
 * THE SPACING SYSTEM, stated once so nothing here is a guess.
 *
 * Everything is a multiple of 4. Ad-hoc 9s, 11s, 13s and 15s read as sloppy
 * even to someone who cannot name why, and this file was full of them.
 *
 * The scale is a 1:2:4 rhythm, and the CONTRAST between its steps is what makes
 * a screen feel composed rather than merely padded:
 *
 *   TIGHT (4-8)  things that belong to each other — a label and its value
 *   GROUP (16)   one block from the next inside a card
 *   SECTION (24) one card from the next
 *
 * Two rules the previous cut broke, and they are why it read cramped:
 *
 *   PADDING >= RADIUS. A 28px corner with 15px of padding puts content inside
 *   the corner's own arc. Nothing looks wrong at a glance and everything feels
 *   tight. 24 of padding against a 24 corner is the floor.
 *
 *   INSIDE >= BETWEEN. Card padding was 15 while the gap between cards was 14,
 *   so the cards read as tight boxes floating apart. Generous inside, moderate
 *   between: that is the whole trick.
 */
const SP = { tight: 4, snug: 8, group: 16, card: 24, section: 24, radius: 24 } as const

// ── the arc ─────────────────────────────────────────────────────────────────

const RING = 146
const RING_STROKE = 10
const START = 215      // pen: startAngle 215, sweeping -250
const SWEEP = 250

/** Polar → cartesian on the ring's own centre, in SVG's y-down space. */
function pt(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function arcPath(cx: number, cy: number, r: number, from: number, sweep: number) {
  const a = pt(cx, cy, r, from)
  const b = pt(cx, cy, r, from - sweep)
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 0 ${b.x} ${b.y}`
}

/**
 * The readiness arc. Open at the bottom, which is what makes it read as lighter
 * than a closed ring, and it runs warm→acid as it fills so a low score arrives
 * orange and a high one green — the hue carries the reading without either end
 * being a verdict colour.
 */
function Arc({ score, verdict, reduce }: {
  score: number | null; verdict: string; reduce: boolean
}) {
  const c = RING / 2
  const r = c - RING_STROKE / 2
  // FLOORED SO A LOW SCORE IS STILL AN ARC. With a round cap, 1/100 draws a
  // single dot floating on the track — which reads as a rendering fault rather
  // than as "almost nothing". 0.02 is the smallest sweep that still shows a
  // stroke with two ends; it rounds the drawing, never the number beside it.
  const raw = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  const frac = score == null ? 0 : Math.max(0.02, raw)
  const len = Math.PI * 2 * r * (SWEEP / 360)
  return (
    <div style={{ position: 'relative', width: RING, height: RING, flex: 'none' }}>
      <svg width={RING} height={RING} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="w3-arc" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={T.acidDeep} />
            <stop offset="45%" stopColor={T.acidMid} />
            <stop offset="80%" stopColor={T.acid} />
            <stop offset="100%" stopColor={T.acid} />
          </linearGradient>
          {/* A LIT ARC, NOT A SMEARED ONE. stdDeviation 7 on a 10px stroke
              spread the bloom wider than the stroke itself, so the arc lost its
              edge and the ring read as unfinished rather than luminous. 3 keeps
              the light and gives the stroke its edge back. */}
          <filter id="w3-arc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* THE TRACK HAS TO BE VISIBLE TO BE A TRACK. At `ink12` — white at 7 %
            — the unfilled remainder disappeared into the card, so the arc had
            no circle to sit in and looked broken off rather than partly full.
            `heroOff` is the token the dock meters already use for an unlit
            segment, so the two meters now say "not yet" the same way. */}
        <path d={arcPath(c, c, r, START, SWEEP)} fill="none" stroke={T.heroOff}
          strokeWidth={RING_STROKE} strokeLinecap="round" />
        {score != null && (
          <motion.path
            d={arcPath(c, c, r, START, SWEEP)} fill="none"
            // THE ARC AGREES WITH ITS OWN NUMBER. The gradient this replaced
            // was documented as running "warm→acid as it fills, so a low score
            // arrives orange" — but it is a SPATIAL gradient, painted across
            // the ring's box rather than along the value, so a 1 was drawn in
            // the same green as a 95 and sat under a red numeral. One value,
            // one hue, graded by `scoreHue` like Today's meter.
            stroke={score == null ? T.heroOff : scoreHue(score)}
            strokeWidth={RING_STROKE} strokeLinecap="round" filter="url(#w3-arc-glow)"
            strokeDasharray={len}
            initial={reduce ? false : { strokeDashoffset: len }}
            animate={{ strokeDashoffset: len * (1 - frac) }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.25 }} />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: SP.tight, paddingTop: 6,
      }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.3, color: T.quiet }}>BEREITSCHAFT</span>
        <motion.span
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontSize: 54, fontWeight: 700, letterSpacing: -2.4, lineHeight: 1.1, ...TNUM,
            // THE SAME RULE THE DOCK USES. `scoreHue` grades 65/45, and
            // Today's readiness panel already refuses to draw a low score in
            // lime for exactly this reason: a 1 set in the same pale acid as a
            // 95 tells the rider they are good to go when they are not. One
            // number, two surfaces, one hue.
            color: score == null ? T.heroOff : scoreHue(score),
          }}>{score ?? DASH}</motion.span>
        {verdict && (
          <span style={{
            fontSize: 12, fontWeight: 500, letterSpacing: -0.1, color: T.quiet,
            textAlign: 'center', maxWidth: RING - 30, textWrap: 'balance',
          }}>{verdict}</span>
        )}

      </div>
    </div>
  )
}

// ── the spectrum ────────────────────────────────────────────────────────────

/**
 * ONE SIGNAL, ON ITS SPECTRUM.
 *
 * Three parts, and each answers something the others cannot: the sentence says
 * what the reading MEANS (being left of the band is good news for a resting
 * pulse and bad for HRV — a marker alone cannot say which), the band says where
 * good sits, and the marker says where the night landed.
 *
 * GREEN FOR GOOD, RED FOR BAD, on the marker and its chip. Acid is the brand's
 * "earned"; a vital sign outside its range is not an achievement, and it should
 * not wear the colour of one.
 */
function Spectrum({ c, reduce, i }: { c: Contributor; reduce: boolean; i: number }) {
  const hue = c.tone === 'good' ? T.training : c.tone === 'warn' ? T.bad : T.mid
  const Arrow = c.dir === 'up' ? ArrowUpRight : c.dir === 'down' ? ArrowDownRight : ArrowRight
  const TRACK = 6
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.snug, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.snug, width: '100%' }}>
        <span aria-hidden style={{
          width: 24, height: 24, flex: 'none', borderRadius: 100,
          background: `${hue}1F`, display: 'grid', placeItems: 'center',
        }}>
          <Arrow size={12} color={hue} strokeWidth={2.3} />
        </span>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 400, letterSpacing: -0.1, color: T.mid,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{c.sentence}</span>
        {c.bandLabel && (
          <span style={{ fontSize: 10.5, fontWeight: 400, color: T.quiet, flex: 'none', ...TNUM }}>{c.bandLabel}</span>
        )}
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5, color: T.ink, flex: 'none', ...TNUM }}>
          {c.value}
        </span>
      </div>
      <div style={{ position: 'relative', width: '100%', height: TRACK }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 100, background: `${T.ink}0A` }} />
        {c.band && (
          <motion.div aria-hidden
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: reduce ? 0 : 0.2 + i * 0.05 }}
            style={{
              position: 'absolute', top: 0, height: TRACK, borderRadius: 100, background: `${T.ink}1F`,
              left: `${c.band.lo * 100}%`, width: `${Math.max(3, (c.band.hi - c.band.lo) * 100)}%`,
            }} />
        )}
        {c.at != null && (
          <motion.div aria-hidden
            initial={reduce ? false : { left: '0%', opacity: 0 }}
            animate={{ left: `${c.at * 100}%`, opacity: 1 }}
            transition={{ duration: 0.7, delay: reduce ? 0 : 0.25 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute', top: -4, width: 5, height: TRACK + 8, borderRadius: 100,
              background: hue, marginLeft: -2.5, boxShadow: `0 0 6px ${hue}80`,
            }} />
        )}
      </div>
    </div>
  )
}

// ── the session ─────────────────────────────────────────────────────────────

/**
 * TODAY'S SESSION, IN TWO MATERIALS.
 *
 * Effort is hot and recovery is cool — the convention every training app uses,
 * and the reason a profile reads as a session at a glance instead of as a
 * chart. Width is minutes, height is watts, zero-based: for a workout that is
 * the correct scale, and a floor near the easiest block flattens the valleys
 * until the thing looks like a barcode.
 */
const EFFORT_AT = 0.78   // of the session's peak — above this a block is "work"

function Profile({ blocks, reduce, selected, onSelect }: {
  blocks: { label: string; minutes: number; watts: number | null }[]
  reduce: boolean; selected: number | null; onSelect: (i: number | null) => void
}) {
  const hi = Math.max(1, ...blocks.map((b) => b.watts ?? 0))
  const H = 62
  const pick = selected != null ? blocks[selected] : blocks[0]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.snug + 2, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: H, width: '100%' }}>
        {blocks.map((b, i) => {
          const work = (b.watts ?? 0) / hi >= EFFORT_AT
          const on = selected === i
          return (
            <motion.button key={i} type="button"
              aria-label={`${b.label}, ${b.minutes} Minuten${b.watts != null ? `, ${b.watts} Watt` : ''}`}
              onClick={() => onSelect(on ? null : i)}
              initial={reduce ? false : { height: 4 }}
              animate={{ height: Math.max(8, Math.round(((b.watts ?? 0) / hi) * H)) }}
              transition={{ duration: 0.6, delay: reduce ? 0 : 0.1 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              style={{
                flexGrow: b.minutes, flexBasis: 0, minWidth: 3, padding: 0, border: 0, cursor: 'pointer',
                borderRadius: '5px 5px 2px 2px',
                // Effort is lit, recovery is the same material turned down —
                // the app's one-accent rule, rather than the pen's two hues.
                background: work
                  ? `linear-gradient(180deg, ${T.acidHi2} 0%, ${T.acid} 100%)`
                  : `linear-gradient(180deg, ${T.ink}2E 0%, ${T.ink}1A 100%)`,
                // 14px of bloom on bars this close merged them into one wash.
                boxShadow: work ? `0 0 6px ${T.acid}3D` : 'none',
                outline: on ? `1.5px solid ${T.ink}` : 'none',
                outlineOffset: 1,
              }} />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>{pick?.label ?? ''}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, ...TNUM }}>
          {pick ? `${pick.minutes} min${pick.watts != null ? ` · ${pick.watts} W` : ''}` : ''}
        </span>
      </div>
    </div>
  )
}

// ── the day ─────────────────────────────────────────────────────────────────

type Hour = {
  hour: number; q: number | null; rideable: boolean
  rain: number | null; wind: number | null; dir: string | null; temp: number | null
}

function HourStrip({ hours, from, to, selected, onSelect, reduce }: {
  hours: Hour[]; from: number | null; to: number | null
  selected: number; onSelect: (h: number) => void; reduce: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inWin = (h: number) => from != null && to != null && h >= from && h <= to
  const pick = (clientX: number) => {
    const el = ref.current
    if (!el || hours.length === 0) return
    const r = el.getBoundingClientRect()
    const i = Math.round(((clientX - r.left) / r.width) * (hours.length - 1))
    const h = hours[Math.max(0, Math.min(hours.length - 1, i))]
    if (h) onSelect(h.hour)
  }
  return (
    <div ref={ref}
      role="slider" tabIndex={0} aria-label="Stunde wählen"
      aria-valuemin={hours[0]?.hour ?? 0} aria-valuemax={hours[hours.length - 1]?.hour ?? 23}
      aria-valuenow={selected}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX) }}
      onPointerMove={(e) => { if (e.buttons > 0) pick(e.clientX) }}
      onKeyDown={(e) => {
        const i = hours.findIndex((h) => h.hour === selected)
        if (e.key === 'ArrowLeft' && i > 0) onSelect(hours[i - 1].hour)
        if (e.key === 'ArrowRight' && i < hours.length - 1) onSelect(hours[i + 1].hour)
      }}
      style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48, width: '100%', touchAction: 'none', cursor: 'pointer', outline: 'none' }}>
      {hours.map((h, i) => {
        const on = h.hour === selected
        const lit = inWin(h.hour)
        return (
          <div key={h.hour} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2, height: '100%' }}>
            <motion.span
              initial={reduce ? false : { height: 3 }}
              animate={{ height: h.q == null ? 3 : Math.max(5, Math.round(h.q * 34)) }}
              transition={{ duration: 0.5, delay: reduce ? 0 : 0.15 + i * 0.02, ease: 'easeOut' }}
              style={{
                display: 'block', width: '100%', borderRadius: '4px 4px 2px 2px',
                background: h.q == null ? `${T.ink}0F`
                  : on ? T.ink
                  : lit ? `linear-gradient(180deg, ${T.acid} 0%, ${T.acidDeep} 100%)`
                  : `${T.ink}1A`,
                boxShadow: lit && !on ? `0 0 12px ${T.acid}45` : 'none',
              }} />
            {/* Rain sits under its own hour rather than on a second axis. */}
            <span style={{
              display: 'block', width: '100%', height: 3, borderRadius: 100,
              background: h.rain == null ? 'transparent' : on ? T.ink : `${T.cool}80`,
              opacity: h.rain == null ? 0 : 0.25 + (h.rain / 100) * 0.75,
            }} />
          </div>
        )
      })}
    </div>
  )
}

// ── the sheet ───────────────────────────────────────────────────────────────

export default function W3MorningSheet({ briefing, onClose, onToday, primaryRef }: {
  briefing: MorningBriefing
  onClose: () => void
  onToday: () => void
  primaryRef?: React.RefObject<HTMLButtonElement | null>
}) {
  const reduce = useReducedMotion()
  const hours = useMemo<Hour[]>(
    () => (briefing.window?.hours ?? []).filter((h) => h.rideable),
    [briefing.window],
  )
  const [selected, setSelected] = useState<number | null>(null)
  const [block, setBlock] = useState<number | null>(null)
  const shown = hours.find((h) => h.hour === selected)
    ?? hours.find((h) => h.hour === briefing.window?.bestFrom)
    ?? hours[0]

  const step = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, delay: reduce ? 0 : 0.06 + i * 0.09, ease: [0.16, 1, 0.3, 1] as const },
  })

  return (
    <motion.div
      className="w3-root"
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 130, display: 'flex', justifyContent: 'center', background: T.skyGround }}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="w3-morning-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 393, maxWidth: '100%', height: '100dvh',
          overflowY: 'auto', overflowX: 'hidden', fontFamily: FONT,
          display: 'flex', flexDirection: 'column',
          // THE SKY. Three broad washes and nothing else — warm where the sun
          // would be, violet low left, acid low right. It carries no data and
          // that is the point: it is the room the numbers stand in, and it is
          // what four passes of flat black could never be talked into being.
          background: `
            radial-gradient(170% 55% at 50% 0%, ${T.acid}12 0%, transparent 100%),
            radial-gradient(120% 60% at 4% 66%, ${T.evening}14 0%, transparent 100%),
            ${T.heroBg}
          `,
        }}>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: SP.section,
          padding: `calc(20px + env(safe-area-inset-top)) 20px calc(20px + env(safe-area-inset-bottom))`,
          margin: 'auto 0',
        }}>

          {/* ── the opening ─────────────────────────────────────────────── */}
          <motion.div {...step(0)} style={{ display: 'flex', alignItems: 'flex-start', gap: SP.group, width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span id="w3-morning-title" style={{
                fontSize: 24, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1.08, color: T.ink,
              }}>{briefing.greeting}</span>
              <span style={{ fontSize: 12.5, fontWeight: 400, lineHeight: 1.45, color: T.mid }}>
                {briefing.welcome ?? TONE_LABEL[briefing.tone]}
              </span>
            </div>
            <button type="button" onClick={onClose} aria-label="Schließen"
              style={{
                width: 38, height: 38, flex: 'none', borderRadius: 100, cursor: 'pointer',
                background: `${T.ink}0F`, border: `1px solid ${T.ink}1A`, backdropFilter: 'blur(12px)',
                display: 'grid', placeItems: 'center',
              }}>
              <X size={16} color={T.mid} />
            </button>
          </motion.div>

          {/* ── readiness ───────────────────────────────────────────────── */}
          {(briefing.readiness || briefing.why || briefing.contributors.length > 0) && (
            <motion.div {...step(1)} style={{
              ...card(SP.radius), alignItems: 'center', gap: SP.group, padding: SP.card,
              position: 'relative', overflow: 'hidden',
            }}>
              {/* THE RIDER'S OWN BIKE, BEHIND THEIR SCORE. A number on a flat
                  card is a dashboard; the same number over a photograph is a
                  poster, and a poster is the thing people screenshot. The scrim
                  is heavy on purpose — the picture is atmosphere, and every
                  reading on top of it still has to clear contrast. */}
              {briefing.heroImage && (
                <>
                  {/* ATMOSPHERE, NOT SUBJECT. At 0.85 with a scrim that only
                      reached full black at 78 %, the bike was the loudest thing
                      on the card: the saddle sat behind the score, the down
                      tube ran through the verdict, and the readings underneath
                      were set on top of a photograph. The intent — a poster,
                      not a dashboard — is right; the exposure was not.
                      Halved, blurred a touch so it reads as depth of field
                      rather than a competing object, and the scrim now reaches
                      the card's own ground by the time the first sentence
                      starts. The picture still lights the ring, which is the
                      part worth screenshotting. */}
                  <img src={briefing.heroImage} alt="" aria-hidden style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', opacity: 0.4, filter: 'blur(1.5px)',
                  }} />
                  <div aria-hidden style={{
                    position: 'absolute', inset: 0,
                    background: `linear-gradient(180deg, ${T.bg}59 0%, ${T.bg}B8 26%, ${T.bg}F5 46%, ${T.bg} 56%)`,
                  }} />
                </>
              )}
              {briefing.celebration?.crowned && (
                <motion.span aria-hidden
                  initial={reduce ? false : { opacity: 0, y: 6, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 18, delay: reduce ? 0 : 1.1 }}
                  style={{ position: 'relative', marginBottom: -SP.snug }}>
                  <Crown size={20} color={T.acid} strokeWidth={2} />
                </motion.span>
              )}
              <Arc score={briefing.readiness?.score ?? null}
                // The celebration below says the verdict now; inside the ring
                // only the withheld-score reason still needs a slot.
                verdict={briefing.readiness ? '' : (briefing.why ?? 'Noch keine Messung')}
                reduce={!!reduce} />

              {briefing.celebration && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: SP.snug, paddingInline: SP.snug,
                  }}>
                  <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.7, color: T.ink, textAlign: 'center' }}>
                    {briefing.celebration.title}
                  </span>
                  <span style={{
                    fontSize: 12.5, fontWeight: 400, lineHeight: 1.5, color: T.mid,
                    textAlign: 'center', textWrap: 'balance',
                  }}>{briefing.celebration.body}</span>
                  {briefing.readiness?.delta != null && briefing.readiness.delta !== 0 && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet, ...TNUM }}>
                      {briefing.readiness.delta > 0 ? '+' : '−'}{Math.abs(Math.round(briefing.readiness.delta))} zu gestern
                    </span>
                  )}
                </motion.div>
              )}

              {briefing.contributors.length > 0 && (
                <>
                  <div style={{ position: 'relative', width: '100%', height: 1, background: `${T.ink}12` }} />
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: SP.group, width: '100%' }}>
                    {briefing.contributors.map((c, i) => (
                      <Spectrum key={c.key} c={c} reduce={!!reduce} i={i} />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── today's session ─────────────────────────────────────────── */}
          {briefing.blocks.length > 0 && (
            <motion.div {...step(2)} style={{ ...card(SP.radius), gap: SP.group, padding: SP.card }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.snug + 4 }}>
                <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.6, color: T.ink, flex: 1, minWidth: 0 }}>
                  {briefing.headline}
                </span>
                {briefing.headlineMeta && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, flex: 'none', ...TNUM }}>
                    {briefing.headlineMeta}
                  </span>
                )}
              </div>
              <Profile blocks={briefing.blocks} reduce={!!reduce} selected={block} onSelect={setBlock} />
            </motion.div>
          )}

          {/* ── when to go ──────────────────────────────────────────────── */}
          {briefing.window && shown && (
            <motion.div {...step(3)} style={{ ...card(SP.radius), gap: SP.group, padding: SP.card }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SP.snug + 4 }}>
                <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.6, color: T.ink, ...TNUM }}>
                  {briefing.window.label}
                </span>
                <span style={{ flex: 1 }} />
                {briefing.window.verdict && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, padding: '5px 10px',
                    borderRadius: 100, background: `${T.acid}1F`, color: T.acid,
                  }}>{briefing.window.verdict}</span>
                )}
              </div>
              <HourStrip hours={hours} from={briefing.window.bestFrom} to={briefing.window.bestTo}
                selected={shown.hour} onSelect={setSelected} reduce={!!reduce} />
              <div style={{
                display: 'flex', alignItems: 'center', gap: SP.snug + 4, padding: '12px 16px',
                borderRadius: SP.group, background: `${T.ink}08`,
              }}>
                <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.5, color: T.ink, flex: 'none', ...TNUM }}>
                  {String(shown.hour).padStart(2, '0')}:00
                </span>
                <span style={{ flex: 1 }} />
                {[
                  { l: 'Temp', v: shown.temp != null ? `${Math.round(shown.temp)}°` : DASH },
                  { l: 'Regen', v: shown.rain != null ? `${Math.round(shown.rain)} %` : DASH },
                  { l: 'Wind', v: shown.wind != null ? `${Math.round(shown.wind)}` : DASH },
                ].map((m) => (
                  <div key={m.l} style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 9, fontWeight: 500, color: T.quiet }}>{m.l}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, ...TNUM }}>{m.v}</span>
                  </div>
                ))}
                {shown.dir && (
                  <motion.span aria-label={`aus ${shown.dir}`}
                    animate={{ rotate: DIR_DEG[shown.dir] ?? 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    style={{
                      display: 'block', width: 0, height: 0, flex: 'none', marginLeft: 2,
                      borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                      borderBottom: `9px solid ${T.mid}`,
                    }} />
                )}
              </div>
            </motion.div>
          )}

          <motion.button {...step(4)} ref={primaryRef} onClick={onToday}
            style={{
              width: '100%', height: 56, borderRadius: 100, border: 0, cursor: 'pointer',
              background: `linear-gradient(180deg, ${T.acidHi2} 0%, ${T.acid} 55%, ${T.acidMid} 100%)`,
              boxShadow: `0 10px 34px ${T.acid}59`,
              color: T.bg, fontFamily: FONT, fontSize: 17, fontWeight: 700, letterSpacing: -0.4,
              display: 'flex', gap: SP.snug, justifyContent: 'center', alignItems: 'center',
              // THE SHEET FOCUSES THIS BUTTON ON OPEN, so the UA's default ring
              // is what a rider sees the moment the briefing arrives — a
              // red-orange halo around the one acid control, which reads as an
              // error on a screen that is telling them good news. Focus still
              // has to be visible; it just has to belong to this palette.
              outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.boxShadow = `0 10px 34px ${T.acid}59, 0 0 0 3px ${T.bg}, 0 0 0 5px ${T.acid}` }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = `0 10px 34px ${T.acid}59` }}>
            Zum Tag<ArrowRight size={18} color={T.bg} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
