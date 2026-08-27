import { useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, X } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { lux, luxTile, TNUM, S } from './w3surfaces'
import type { Contributor, MorningBriefing } from './useMorningBriefing'
import './w3.css'

/**
 * THE MORNING BRIEFING — three lit chapters under one answer.
 *
 * Split from `W3MorningGate` because the gate is all TIMING — once a day, only
 * in the morning, never on top of another sheet — and none of that can be
 * looked at. This half can: `/e/w3-morning-preview` renders it without a
 * session, which is how it was built at 390x844.
 *
 * ── THE QUESTIONS, EACH ANSWERED ONCE ────────────────────────────────────
 * A rider deciding their morning asks four things that do not overlap. The
 * first one is the OPENING, because it is the answer and everything else is
 * why:
 *
 *   (the headline)  what am I meant to do?
 *   01 BEREIT       can my body do it?       the night, and what it left
 *   02 RAUS         when do I go?            the day, hour by hour
 *   03 STAND        where does that put me?  load, form, the week
 *
 * Every fact appears in exactly one of them. The only prose is the warm line
 * under the headline, which says something no graphic does.
 *
 * ── THE WEATHER IS SCRUBBABLE, NOT A LEGEND ──────────────────────────────
 * It began as bars plus a rain line on ONE plot with two y-scales — the most
 * common charting mistake there is. Splitting it into three stacked static
 * tracks fixed the axis and produced a new problem: a row of 3px triangles and
 * a colour key, which is a chart asking to be decoded.
 *
 * A rider does not want the whole day at once. They want ONE hour, in full, and
 * the shape around it to choose from. So the bars are the shape and the hour is
 * a control: drag across it and the readout gives that hour whole — clock,
 * temperature, rain, wind speed AND direction at a legible size. The wind
 * arrow, which was unreadable at 3px in fifteen copies, is one arrow at 22px
 * that turns as you scrub.
 *
 * WHY THIS IS STILL HAND-DRAWN. `uplot` (40 KB gz) would earn its place the
 * moment this needs real axes, zoom, or many series. Fifteen bars and a
 * pointer-x lookup is not that, and a canvas library would have to be fought
 * out of its own coordinate system to light the window in the accent.
 *
 * ── AND IT STILL HAS TO BE TRUE ──────────────────────────────────────────
 * The ring draws EMPTY when the readiness gate withholds — never a plausible
 * angle. A rest day gets no ride window. A stage the watch did not record is
 * absent rather than zero.
 */

/** Sentence case, like everything else here. All-caps is the loudest thing a
 *  typographic system can do, and the screens that feel calm use it nowhere. */
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

type Hour = {
  hour: number; q: number | null; rideable: boolean
  rain: number | null; wind: number | null; dir: string | null; temp: number | null
}

/** One hour, whole — the readout the scrub drives. */
function HourReadout({ h }: { h: Hour }) {
  const cell = (label: string, node: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.1, color: T.quiet }}>{label}</span>
      {node}
    </div>
  )
  const num = (v: string, unit?: string) => (
    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: T.ink, ...TNUM }}>
      {v}{unit && <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}> {unit}</span>}
    </span>
  )
  return (
    <div style={{ ...luxTile(16), flexDirection: 'row', alignItems: 'center', gap: S.lg, padding: '9px 12px' }}>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.8, color: T.ink, flex: 'none', ...TNUM }}>
        {String(h.hour).padStart(2, '0')}:00
      </span>
      {cell('Temp', num(h.temp != null ? `${Math.round(h.temp)}°` : DASH))}
      {cell('Regen', num(h.rain != null ? String(Math.round(h.rain)) : DASH, h.rain != null ? '%' : undefined))}
      {cell('Wind', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {num(h.wind != null ? String(Math.round(h.wind)) : DASH, h.wind != null ? 'km/h' : undefined)}
          {h.dir && (
            // ONE arrow at a readable size, turning as you scrub. Fifteen 3px
            // copies of this were a texture, not a reading.
            <motion.span aria-label={`aus ${h.dir}`}
              animate={{ rotate: DIR_DEG[h.dir] ?? 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{
                display: 'block', width: 0, height: 0, flex: 'none',
                borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                borderBottom: `9px solid ${T.mid}`,
              }} />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The day as a shape you can put your thumb on.
 *
 * Bars carry ride quality (one scale, no second axis). Rain rides UNDER them as
 * its own short track, so the two never share a y. The selected column is the
 * only lit thing besides the window, and the readout above says what it is.
 */
function HourScrubber({ hours, from, to, accent, reduce, selected, onSelect }: {
  hours: Hour[]; from: number | null; to: number | null
  accent: string; reduce: boolean
  selected: number; onSelect: (hour: number) => void
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
    <div
      ref={ref}
      role="slider" tabIndex={0}
      aria-label="Stunde wählen"
      aria-valuemin={hours[0]?.hour ?? 0}
      aria-valuemax={hours[hours.length - 1]?.hour ?? 23}
      aria-valuenow={selected}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX) }}
      onPointerMove={(e) => { if (e.buttons > 0) pick(e.clientX) }}
      onKeyDown={(e) => {
        const i = hours.findIndex((h) => h.hour === selected)
        if (e.key === 'ArrowLeft' && i > 0) onSelect(hours[i - 1].hour)
        if (e.key === 'ArrowRight' && i < hours.length - 1) onSelect(hours[i + 1].hour)
      }}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4, width: '100%',
        touchAction: 'none', cursor: 'pointer', outline: 'none',
      }}>

      {/* ride quality */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 30, width: '100%' }}>
        {hours.map((h, i) => {
          const on = h.hour === selected
          return (
            <motion.div key={h.hour}
              initial={reduce ? false : { height: 3 }}
              animate={{ height: h.q == null ? 3 : Math.max(4, Math.round(h.q * 30)) }}
              transition={{ duration: 0.45, delay: reduce ? 0 : 0.15 + i * 0.015, ease: 'easeOut' }}
              style={{
                flex: 1, minWidth: 0, borderRadius: 3,
                background: h.q == null ? T.d1 : on ? T.ink : inWin(h.hour) ? accent : `${T.ink}1F`,
              }} />
          )
        })}
      </div>

      {/* rain, its own baseline and its own scale */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 12, width: '100%' }}>
        {hours.map((h, i) => (
          <motion.div key={h.hour}
            initial={reduce ? false : { height: 2 }}
            animate={{ height: h.rain == null ? 2 : Math.max(2, Math.round((h.rain / 100) * 12)) }}
            transition={{ duration: 0.45, delay: reduce ? 0 : 0.25 + i * 0.015, ease: 'easeOut' }}
            style={{
              flex: 1, minWidth: 0, borderRadius: 2,
              background: h.rain == null ? T.d1 : h.hour === selected ? T.ink : `${T.cool}73`,
            }} />
        ))}
      </div>

      {/* the axis: the ends, and wherever the thumb is */}
      <div style={{ display: 'flex', width: '100%', paddingTop: 2 }}>
        {hours.map((h, i) => {
          const lastI = hours.length - 1
          // Suppress an end label when the thumb is sitting on top of it —
          // "7 8" printed side by side reads as one number.
          const nearSel = Math.abs(i - hours.findIndex((x) => x.hour === selected)) <= 1
          const edge = (i === 0 || i === lastI) && !nearSel
          const on = h.hour === selected
          return (
            <span key={h.hour} style={{
              flex: 1, minWidth: 0, textAlign: 'center', ...TNUM,
              fontSize: 8, fontWeight: 700,
              color: on ? T.ink : edge ? T.quiet : 'transparent',
            }}>{h.hour}</span>
          )
        })}
      </div>
    </div>
  )
}



/**
 * THE HOUSE METER — 22 lit segments, straight off `W3TodayDock`.
 *
 * Not a sparkline and not a progress bar. This app already has an instrument
 * for "how far along its scale does this sit", it is on the first screen a
 * rider ever sees, and it is what makes the readiness number legible at a
 * glance without a second colour: a lit segment catches light from above, an
 * unlit one does not. Importing a foreign chart idiom is what made the previous
 * cut read as a generic dashboard.
 */
const SEGMENTS = 22

function SegmentMeter({ frac, hue, reduce }: { frac: number; hue: string; reduce: boolean }) {
  const filled = Math.round(Math.max(0, Math.min(1, frac)) * SEGMENTS)
  return (
    <div style={{ display: 'flex', gap: 3, height: 10, width: '100%' }} aria-hidden>
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <motion.span key={i}
          initial={reduce ? false : { opacity: 0.25 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: reduce ? 0 : (i < filled ? i * 0.018 : 0) }}
          style={{
            flex: 1, height: 10, borderRadius: 3,
            background: i < filled ? `linear-gradient(180deg, ${hue}CC 0%, ${hue}8C 100%)` : T.heroOff,
            boxShadow: i < filled ? `inset 0 1px 0 ${T.ink}40` : 'none',
          }} />
      ))}
    </div>
  )
}

/**
 * ONE CONTRIBUTOR, ON A SPECTRUM.
 *
 * A fill bar answers "how much", which is the wrong question for a vital sign:
 * 7 h 24 means nothing until you know the band is 7–9, and 46 bpm means nothing
 * until you know it sits under your own. So the row draws the scale, the
 * OPTIMAL BAND on it, and a marker for where last night landed — the two facts
 * a rider needs at once.
 *
 * The band is a lit segment of the same track rather than a second bar: it is
 * the same axis, and drawing it separately would be a second scale to reconcile.
 * The marker carries the tone, because being outside the band is good news on
 * one row and bad on another.
 */
function ContributorRow({ c, reduce, i }: {
  c: Contributor; reduce: boolean; i: number
}) {
  const hue = c.tone === 'good' ? T.acidDeep : c.tone === 'warn' ? T.warn : T.d4
  const TRACK = 4
  const Arrow = c.dir === 'up' ? ArrowUpRight : c.dir === 'down' ? ArrowDownRight : ArrowRight
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* A soft tinted disc, never a bare glyph on the ground: the disc is
              what keeps a 10px arrow legible and unhurried. */}
          <span aria-hidden style={{
            width: 20, height: 20, flex: 'none', borderRadius: 100,
            background: `${hue}1F`, display: 'grid', placeItems: 'center',
          }}>
            <Arrow size={11} color={hue} strokeWidth={2.4} />
          </span>
          <span style={{
            fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, color: T.mid,
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{c.sentence}</span>
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.1, color: T.ink, flex: 'none', ...TNUM }}>
          {c.value}
        </span>
      </div>
      <div style={{ position: 'relative', width: '100%', height: TRACK + 15 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TRACK, borderRadius: 100, background: T.d1 }} />
        {c.band && (
          <motion.div
            aria-hidden
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: reduce ? 0 : 0.15 + i * 0.05 }}
            style={{
              position: 'absolute', top: 0, height: TRACK, borderRadius: 100, background: `${T.ink}38`,
              left: `${c.band.lo * 100}%`, width: `${Math.max(2, (c.band.hi - c.band.lo) * 100)}%`,
            }} />
        )}
        {c.band && c.bandLabel && (
          <span aria-hidden style={{
            position: 'absolute', top: TRACK + 5, fontSize: 8.5, fontWeight: 500, color: T.quiet,
            left: `${c.band.lo * 100}%`, ...TNUM,
          }}>{c.bandLabel}</span>
        )}
        {c.at != null && (
          <motion.div
            aria-hidden
            initial={reduce ? false : { left: '0%' }}
            animate={{ left: `${c.at * 100}%` }}
            transition={{ duration: 0.65, delay: reduce ? 0 : 0.2 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute', top: -3, width: 3, height: TRACK + 6, borderRadius: 100,
              background: hue, marginLeft: -1.5,
              // A ring of ground around the marker so it stays legible when it
              // lands inside the band, which is exactly where it should be.
              boxShadow: `0 0 0 2px ${T.heroDock}`,
            }} />
        )}
      </div>
    </div>
  )
}

/**
 * TODAY'S SESSION, AS ONE SILHOUETTE.
 *
 * The first cut drew the blocks as separated rounded bars, and it read as a bar
 * chart of nine unrelated things. A session is not nine things — it is one
 * continuous hour with a shape, which is exactly why every workout app draws it
 * as an unbroken profile. No gaps, no rounding between blocks: the eye follows
 * the ride from warm-up to cool-down and sees the four efforts stand up out of
 * it.
 *
 * WIDTH IS TIME, HEIGHT IS WATTS. Equal columns would draw a 16-minute warm-up
 * and a 4-minute recovery the same size, which turns the picture into a
 * decoration rather than the session.
 *
 * THE FLOOR IS NOT ZERO. Recovery at 120 W against threshold at 274 stands at
 * 44% of full height on a zero-based scale, so the efforts barely rise above
 * the valleys and the shape flattens into noise. The floor sits just under the
 * easiest block, which is how a rider reads a profile anyway: relative to their
 * own easy.
 */
function WorkoutProfile({ blocks, reduce, selected, onSelect }: {
  blocks: { label: string; minutes: number; watts: number | null }[]
  reduce: boolean
  selected: number | null; onSelect: (i: number | null) => void
}) {
  const total = blocks.reduce((n, b) => n + b.minutes, 0)
  if (total <= 0) return null
  const watts = blocks.map((b) => b.watts ?? 0).filter((w) => w > 0)
  const hi = watts.length ? Math.max(...watts) : 1
  const H = 46
  const h = (w: number | null) => w == null ? 10 : Math.max(6, Math.round((w / hi) * H))
  const pick = selected != null ? blocks[selected] : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: H, width: '100%' }}>
        {blocks.map((b, i) => {
          const on = selected === i
          const first = i === 0
          const last = i === blocks.length - 1
          return (
            <motion.button key={i} type="button"
              aria-label={`${b.label}, ${b.minutes} Minuten${b.watts != null ? `, ${b.watts} Watt` : ''}`}
              onClick={() => onSelect(on ? null : i)}
              initial={reduce ? false : { height: 4 }}
              animate={{ height: h(b.watts) }}
              transition={{ duration: 0.55, delay: reduce ? 0 : 0.1 + i * 0.035, ease: [0.16, 1, 0.3, 1] }}
              style={{
                flexGrow: b.minutes, flexBasis: 0, minWidth: 2, padding: 0, border: 0, cursor: 'pointer',
                // Rounded only at the two ends of the RIDE, so the middle reads
                // as one continuous session rather than as separate objects.
                borderRadius: `${first ? 4 : 0}px ${last ? 4 : 0}px ${last ? 4 : 0}px ${first ? 4 : 0}px`,
                background: on ? T.ink : selected == null ? `${T.ink}D9` : `${T.ink}4D`,
              }} />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: S.sm, minHeight: 12 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: T.mid }}>
          {(pick ?? blocks[0]).label}
        </span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: T.quiet, ...TNUM }}>
          {(pick ?? blocks[0]).minutes} min{(pick ?? blocks[0]).watts != null ? ` · ${(pick ?? blocks[0]).watts} W` : ''}
        </span>
      </div>
    </div>
  )
}

export default function W3MorningSheet({ briefing, onClose, onToday, primaryRef }: {
  briefing: MorningBriefing
  onClose: () => void
  onToday: () => void
  primaryRef?: React.RefObject<HTMLButtonElement | null>
}) {
  const reduce = useReducedMotion()
  const accent = briefing.tone === 'rest' ? T.cool : T.acid

  const hours = useMemo<Hour[]>(
    () => (briefing.window?.hours ?? []).filter((h) => h.rideable),
    [briefing.window],
  )
  /** Opens on the best hour, because that is the answer the panel came to give;
   *  scrubbing is for interrogating it, not for finding it. */
  const [selected, setSelected] = useState<number | null>(null)
  const [block, setBlock] = useState<number | null>(null)

  const shownHour = hours.find((h) => h.hour === selected)
    ?? hours.find((h) => h.hour === briefing.window?.bestFrom)
    ?? hours[0]

  const step = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: reduce ? 0 : 0.05 + i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
  })

  const card = { ...lux(22), padding: '12px 12px', gap: 8 }

  return (
    <motion.div
      className="w3-root"
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.26 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 130, display: 'flex', justifyContent: 'center', background: T.heroBg }}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="w3-morning-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 390, maxWidth: '100%', height: '100dvh',
          overflowY: 'auto', overflowX: 'hidden',
          fontFamily: FONT, display: 'flex', flexDirection: 'column', background: T.heroBg,
        }}>

        <div aria-hidden style={{
          position: 'absolute', top: -90, right: -70, width: 320, height: 320, borderRadius: '50%',
          pointerEvents: 'none', background: `radial-gradient(closest-side, ${accent}1A, transparent)`,
        }} />

        <button type="button" onClick={onClose} aria-label="Schließen"
          style={{
            position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', right: S.lg, zIndex: 1,
            width: 32, height: 32, borderRadius: 100, border: 0, background: T.tile,
            display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}>
          <X size={14} color={T.mid} />
        </button>

        <div style={{
          position: 'relative', margin: 'auto 0', display: 'flex', flexDirection: 'column',
          gap: 10, padding: `calc(12px + env(safe-area-inset-top)) ${S.lg}px calc(10px + env(safe-area-inset-bottom))`,
        }}>

          {/* ── THE OPENING: the answer, then who is being told it ───────── */}
          <motion.div {...step(0)} style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingRight: 42 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: accent }}>
              {TONE_LABEL[briefing.tone] ?? TONE_LABEL.unknown}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <span id="w3-morning-title" style={{
                fontSize: 29, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.03, color: T.ink, textWrap: 'balance',
              }}>{briefing.headline}</span>
              {briefing.headlineMeta && (
                <span style={{ fontSize: 15, fontWeight: 700, color: T.quiet, ...TNUM }}>{briefing.headlineMeta}</span>
              )}
            </div>
            {/* ONE line of prose, not three. The date was the least useful of
                them — a rider opening the app in the morning knows what day it
                is — and the greeting and the warm line say more together. */}
            <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
              <span style={{ fontWeight: 600, color: T.quiet }}>{briefing.greeting}.</span>
              {briefing.welcome ? ` ${briefing.welcome}` : ''}
            </span>
          </motion.div>

          {/* The session's own shape, right under its name — the one picture
              that answers "what am I actually in for". */}
          {briefing.blocks.length > 0 && (
            <motion.div {...step(1)} style={{ ...card, gap: S.sm }}>
              <WorkoutProfile blocks={briefing.blocks} reduce={!!reduce}
                selected={block} onSelect={setBlock} />
            </motion.div>
          )}

          {/* ── THE HERO: one number, its verdict, its meter ─────────────
              The shape this app's own Today dock already uses — 44px score,
              quiet label, plain-German verdict, 22 segments — and the shape
              every readiness screen worth studying converges on. Six equal
              tiles had no hero at all, which is what made the screen read as
              generic. */}
          {(briefing.readiness || briefing.why) && (
            <motion.div {...step(2)} style={{ ...card, gap: 12 }}>
              {/* SYMMETRY IS RESTFUL, and it is the move every calm score
                  screen makes: the figure centred, the verdict under it, the
                  working below that. Read left-aligned with the delta pinned
                  to the right edge, the same three facts scan as a toolbar. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: '100%' }}>
                <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.2, color: T.quiet }}>Bereitschaft</span>
                <span style={{
                  fontSize: 50, fontWeight: 700, lineHeight: 1.02, ...TNUM,
                  color: briefing.readiness ? accent : T.heroOff,
                }}>{briefing.readiness?.score ?? DASH}</span>
                {/* The verdict when there is one, the reason when there is not
                    — same slot, same size, so the block never changes shape
                    between a good morning and a missed sync. */}
                <span style={{
                  fontSize: 17, fontWeight: 600, letterSpacing: -0.2, textAlign: 'center',
                  color: briefing.readiness ? T.ink : T.mid, textWrap: 'balance',
                }}>
                  {briefing.readinessVerdict ?? briefing.why ?? 'Noch keine Messung'}
                  {briefing.readiness?.delta != null && briefing.readiness.delta !== 0 && (
                    // Inline, not on a line of its own: the change is a footnote
                    // to the verdict, and giving it its own row made the hero
                    // four stacked texts deep.
                    <span style={{ fontWeight: 500, color: T.quiet, ...TNUM }}>
                      {'  '}{briefing.readiness.delta > 0 ? '+' : '−'}{Math.abs(Math.round(briefing.readiness.delta))}
                    </span>
                  )}
                </span>
              </div>

              {briefing.readiness && (
                <SegmentMeter frac={briefing.readiness.score / 100} hue={accent} reduce={!!reduce} />
              )}

              {briefing.contributors.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11, width: '100%' }}>
                  {briefing.contributors.map((c, i) => (
                    <ContributorRow key={c.key} c={c} reduce={!!reduce} i={i} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── 02 — RAUS ───────────────────────────────────────────────── */}
          {briefing.window && shownHour && (
            <motion.div {...step(3)} style={card}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: S.sm }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2, color: T.quiet }}>Raus</span>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.7, color: T.ink, marginLeft: 4, ...TNUM }}>
                  {briefing.window.label}
                </span>
                {briefing.window.verdict && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: accent }}>
                    {briefing.window.verdict}
                  </span>
                )}
              </div>
              <HourScrubber
                hours={hours} from={briefing.window.bestFrom} to={briefing.window.bestTo}
                accent={accent} reduce={!!reduce}
                selected={shownHour.hour} onSelect={setSelected} />
              <HourReadout h={shownHour} />
            </motion.div>
          )}

          <motion.button {...step(5)} ref={primaryRef} onClick={onToday}
            style={{
              width: '100%', height: 48, borderRadius: 100, border: 0, background: accent, color: T.bg,
              fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', gap: S.sm, justifyContent: 'center', alignItems: 'center', marginTop: 2,
            }}>
            Zum Tag<ArrowRight size={16} color={T.bg} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
