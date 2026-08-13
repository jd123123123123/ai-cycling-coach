import type { W3ShapeBar, W3EffortRow } from './W3SessionView'

/**
 * Small, pure helpers for W3 · 06 SESSION DETAIL. No hooks, no fetches —
 * everything here is a deterministic function of already-real session data
 * (`W3SessionPage` owns the wiring). Two jobs:
 *
 *  1. `funName()` — a characterful display name for a session, so the hero
 *     reads "The lung-buster" instead of "Threshold blocks". The REAL
 *     prescribed title is never lost: the page keeps it as the subtitle, so
 *     the fun name is decoration over an honest label, never a replacement.
 *  2. `powerProfile()` / `effortGuide()` — turn the real prescription into the
 *     screen's two derived visuals (the power-shape bars and the how-to-ride
 *     effort scale). Both derive only from real numbers or from the session's
 *     own training zone; neither invents a per-athlete measurement.
 */

/** Characterful name from the workout's template id + intensity. Keyword
 *  match wins (most specific); otherwise the Coggan intensity-factor band
 *  decides. Falls back to the real title, then a generic, so it is never
 *  empty. Pure and deterministic. */
export function funName(
  templateId: string | null | undefined,
  intensityFactor: number | null | undefined,
  title: string | null | undefined,
): string {
  const hay = `${templateId ?? ''} ${title ?? ''}`.toLowerCase()
  const has = (...ks: string[]) => ks.some((k) => hay.includes(k))

  if (has('recovery', 'recover', 'regen', 'erholung', 'shakeout', 'spin')) return 'Legs on holiday'
  if (has('vo2', 'anaerobic', 'sprint', 'attack', 'maximal', 'max ')) return 'Red-line rodeo'
  if (has('threshold', 'ftp', 'sweetspot', 'sweet-spot', 'schwelle')) return 'The lung-buster'
  if (has('tempo', 'sst')) return 'Cruise control'
  if (has('endurance', 'long', 'base', 'grundlage', 'z2', 'zone 2', 'zone2', 'lsd')) return 'The long game'
  if (has('interval', 'over-under', 'over/under', 'block')) return 'Rinse and repeat'

  const iff = intensityFactor ?? null
  if (iff != null && Number.isFinite(iff)) {
    if (iff < 0.6) return 'Legs on holiday'
    if (iff < 0.72) return 'The long game'
    if (iff < 0.85) return 'Cruise control'
    if (iff < 0.95) return 'The lung-buster'
    return 'Red-line rodeo'
  }
  const t = (title ?? '').trim()
  return t !== '' ? t : 'Today’s session'
}

/** The "shape of it" bars. Real, structured sessions (3+ blocks) draw their
 *  own shape. A steady ride materialises to 1–2 blocks — a single flat beam
 *  that tells the rider nothing — so we render its TRUE shape instead: a
 *  warm-up ramp, a long steady body, and a cool-down. Same honest envelope
 *  `W3TodayPage` already draws for the Today session card. Returns `[]` when
 *  there is no session at all (the section then hides). */
export function powerProfile(bars: W3ShapeBar[], hasSession: boolean): W3ShapeBar[] {
  if (bars.length > 2) return bars
  if (!hasSession) return []
  return [
    { w: 0.34, work: false }, { w: 0.5, work: false }, { w: 0.66, work: false },
    ...Array.from({ length: 8 }, () => ({ w: 0.88, work: true })),
    { w: 0.6, work: false }, { w: 0.4, work: false },
  ]
}

type Tier = 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2'

/** Intensity band → training tier. Null IF (a planned-only fallback with no
 *  TSS/duration to derive from) returns null so the effort guide hides rather
 *  than guessing a zone. */
export function tierOf(intensityFactor: number | null | undefined): Tier | null {
  const iff = intensityFactor ?? null
  if (iff == null || !Number.isFinite(iff)) return null
  if (iff < 0.6) return 'recovery'
  if (iff < 0.72) return 'endurance'
  if (iff < 0.85) return 'tempo'
  if (iff < 0.95) return 'threshold'
  return 'vo2'
}

/** Honest "how to ride it" cues. These are the definitions of the session's
 *  own training zone — RPE, the talk test, how to meter the effort — NOT
 *  fabricated per-athlete read-outs (the old "HR at minute 3: 165 bpm" had no
 *  source and is gone). The band marks roughly where the effort sits on an
 *  easy→hard scale so the row's meter is meaningful. `[]` when the tier is
 *  unknown, so the section hides rather than inventing a zone. */
export function effortGuide(intensityFactor: number | null | undefined): W3EffortRow[] {
  const tier = tierOf(intensityFactor)
  if (!tier) return []
  const guides: Record<Tier, W3EffortRow[]> = {
    recovery: [
      { label: 'EFFORT', value: 'Barely there', hint: 'If it starts to feel like training, ease off.', band: 'low' },
      { label: 'BREATHING', value: 'Nose-easy', hint: 'You could hold a full conversation the whole way.', band: 'low' },
      { label: 'ON THE PEDALS', value: 'Spin, don’t push', hint: 'High cadence, feather the pressure — it’s about blood flow, not load.', band: 'low' },
    ],
    endurance: [
      { label: 'EFFORT', value: 'All-day pace', hint: 'The pace you could keep up for hours without emptying out.', band: 'low' },
      { label: 'BREATHING', value: 'Full sentences', hint: 'Talk test: chatty, never gasping.', band: 'low' },
      { label: 'ON THE PEDALS', value: 'Steady beam', hint: 'Even pressure — resist the urge to chase every rise.', band: 'mid' },
    ],
    tempo: [
      { label: 'EFFORT', value: 'Comfortably brisk', hint: 'Working, but firmly in control the whole time.', band: 'mid' },
      { label: 'BREATHING', value: 'Short sentences', hint: 'A sentence at a time — not a conversation.', band: 'mid' },
      { label: 'ON THE PEDALS', value: 'Hold the rhythm', hint: 'One gear, one cadence — let it settle and stay there.', band: 'mid' },
    ],
    threshold: [
      { label: 'EFFORT', value: 'Comfortably hard', hint: 'The edge of sustainable — right up to it, never over.', band: 'high' },
      { label: 'BREATHING', value: 'Three to four words', hint: 'Words come out in short bursts, not sentences.', band: 'high' },
      { label: 'ON THE PEDALS', value: 'Meter it out', hint: 'Even pressure across every block — the last one should feel the hardest, not the first.', band: 'mid' },
    ],
    vo2: [
      { label: 'EFFORT', value: 'All you’ve got', hint: 'Each rep should sting by the end — that’s the point.', band: 'high' },
      { label: 'BREATHING', value: 'One word at a time', hint: 'Talking is off the table.', band: 'high' },
      { label: 'ON THE PEDALS', value: 'Empty the tank', hint: 'Pace the first rep so you can still match it on the last.', band: 'high' },
    ],
  }
  return guides[tier]
}
