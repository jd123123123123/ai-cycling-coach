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

  if (has('recovery', 'recover', 'regen', 'erholung', 'shakeout', 'spin')) return 'Beine im Urlaub'
  if (has('vo2', 'anaerobic', 'sprint', 'attack', 'maximal', 'max ')) return 'Rodeo am Limit'
  if (has('threshold', 'ftp', 'sweetspot', 'sweet-spot', 'schwelle')) return 'Der Lungenbrenner'
  if (has('tempo', 'sst')) return 'Tempomat'
  if (has('endurance', 'long', 'base', 'grundlage', 'z2', 'zone 2', 'zone2', 'lsd')) return 'Die lange Bank'
  if (has('interval', 'over-under', 'over/under', 'block')) return 'Wieder und wieder'

  const iff = intensityFactor ?? null
  if (iff != null && Number.isFinite(iff)) {
    if (iff < 0.6) return 'Beine im Urlaub'
    if (iff < 0.72) return 'Die lange Bank'
    if (iff < 0.85) return 'Tempomat'
    if (iff < 0.95) return 'Der Lungenbrenner'
    return 'Rodeo am Limit'
  }
  const t = (title ?? '').trim()
  return t !== '' ? t : 'Deine Einheit'
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
      { label: 'BELASTUNG', value: 'Kaum spürbar', hint: 'Sobald es sich nach Training anfühlt, nimm zurück.', band: 'low' },
      { label: 'ATMUNG', value: 'Durch die Nase', hint: 'Du könntest die ganze Zeit ein Gespräch führen.', band: 'low' },
      { label: 'AUF DEN PEDALEN', value: 'Kurbeln, nicht drücken', hint: 'Hohe Trittfrequenz, kaum Druck — es geht um Durchblutung, nicht um Last.', band: 'low' },
    ],
    endurance: [
      { label: 'BELASTUNG', value: 'Tagestempo', hint: 'Das Tempo, das du stundenlang halten könntest, ohne leer zu werden.', band: 'low' },
      { label: 'ATMUNG', value: 'Ganze Sätze', hint: 'Sprechtest: plaudern ja, keuchen nein.', band: 'low' },
      { label: 'AUF DEN PEDALEN', value: 'Gleichmäßig', hint: 'Konstanter Druck — widersteh dem Drang, jede Kuppe zu attackieren.', band: 'mid' },
    ],
    tempo: [
      { label: 'BELASTUNG', value: 'Angenehm zügig', hint: 'Du arbeitest, hast es aber durchgehend im Griff.', band: 'mid' },
      { label: 'ATMUNG', value: 'Kurze Sätze', hint: 'Ein Satz am Stück — kein Gespräch.', band: 'mid' },
      { label: 'AUF DEN PEDALEN', value: 'Rhythmus halten', hint: 'Ein Gang, eine Trittfrequenz — einpendeln und dabei bleiben.', band: 'mid' },
    ],
    threshold: [
      { label: 'BELASTUNG', value: 'Angenehm hart', hint: 'Direkt an der Schwelle — bis heran, nie darüber.', band: 'high' },
      { label: 'ATMUNG', value: 'Drei bis vier Wörter', hint: 'Wörter kommen stoßweise, keine Sätze mehr.', band: 'high' },
      { label: 'AUF DEN PEDALEN', value: 'Einteilen', hint: 'Gleicher Druck über alle Blöcke — der letzte soll der härteste sein, nicht der erste.', band: 'mid' },
    ],
    vo2: [
      { label: 'BELASTUNG', value: 'Alles, was du hast', hint: 'Jede Wiederholung soll am Ende brennen — genau das ist der Sinn.', band: 'high' },
      { label: 'ATMUNG', value: 'Ein Wort am Stück', hint: 'Reden ist nicht mehr drin.', band: 'high' },
      { label: 'AUF DEN PEDALEN', value: 'Alles rausholen', hint: 'Teil die erste Wiederholung so ein, dass du sie in der letzten noch triffst.', band: 'high' },
    ],
  }
  return guides[tier]
}
