import { motion, useReducedMotion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import { S, lux } from './w3surfaces'
import W3WhyButton from './W3WhyButton'

/**
 * W3 · TODAY — the coach speaking, given the weight it was always claiming.
 *
 * IT WAS LOOSE TEXT ON THE PAGE GROUND: a small pill, a 25 px headline and a
 * paragraph, floating between the hero and the week with nothing under them.
 * The single most important sentence on Today had less presence than the
 * cards around it, so the eye skipped it on the way to the first thing that
 * looked like an object.
 *
 * It is an object now, in the hero's language rather than a new one: flat tone,
 * generous radius, no drawn edge, and one soft acid bloom in the corner where
 * the light comes from. `lux()` argues the case — depth from light and a tone
 * step, never from a line.
 *
 * ── THE ACCENTED FIGURE ──────────────────────────────────────────────────
 * The verdict almost always opens on the number it is about ("88 ist grünes
 * Licht…"), and that number is the whole reading. Setting it in the accent
 * gives the card the one dominant element every good surface in this app has,
 * WITHOUT inventing a headline: the words are the coach's, only their weight
 * is ours. When a verdict opens on something else, nothing is accented and the
 * card is simply a well-set paragraph — which is the honest outcome, not a
 * failure to decorate.
 *
 * ── WHAT IT DELIBERATELY DOES NOT REPEAT ─────────────────────────────────
 * The morning vitals. HRV, resting pulse and sleep already have a home in the
 * readiness dock a few hundred pixels above, and printing them again here
 * would be the same three numbers twice on one screen — which is how a page
 * starts to feel padded rather than full.
 */

/** The leading figure of a sentence, split off so it can carry the accent.
 *
 *  Deliberately only the FIRST token, and only when it is a number: "88" opens
 *  a verdict about readiness, but a "9" three clauses in is part of an
 *  argument and lifting it out of the middle of a sentence would emphasise a
 *  detail over the point. */
export function splitLeadFigure(text: string): [string | null, string] {
  const m = /^(\d+[\d.,]*\s*%?)(\s+\S)/.exec(text)
  if (!m) return [null, text]
  return [m[1].trim(), text.slice(m[1].length)]
}

export interface W3CoachCardProps {
  headline: string | null
  /**
   * THE REASONING, AND ON TODAY IT IS NOT DRAWN.
   *
   * The brief's `why` is prose about the overnight numbers — "HRV 71 ms (+9
   * auf den Basiswert), Ruhepuls 42 (−3), Schlaf 7:42 bei 91 Qualität". Those
   * three numbers are ALREADY on this screen, as three tiles with their own
   * deltas and their own sparklines, four hundred pixels below. Printing them
   * again as a sentence is the same fact three times: once as a chart, once as
   * a number, once as a paragraph.
   *
   * So Today passes `body={null}` and the card is a verdict. The reasoning is
   * not lost — `W3WhyButton` in this very header opens it, which is where a
   * rider goes when they want the argument rather than the answer.
   */
  body: string | null
  date: string
  /** Shown above the verdict on a day the plan prescribes rest, because a high
   *  readiness next to a rest day reads as a contradiction otherwise. */
  restNote?: string | null
}

/**
 * THE COACH SAYS WHAT THE HERO CANNOT.
 *
 * The brief opens by restating the readiness figure — "88 ist grünes Licht.
 * Dein Körper verarbeitet alles, was die heutige Einheit verlangt." The hero
 * panel four hundred pixels above already shows 88 AND the words grünes Licht,
 * on its own meter. So the first sentence is the third telling of a number the
 * rider has already read, and the SECOND is the only part that says anything
 * new: what it means for the session they are about to do.
 *
 * When the verdict opens on that figure, this drops that sentence and leads
 * with the consequence. When it does not — a brief phrased some other way —
 * the first sentence is the verdict and it stands.
 *
 * Split on the full stop rather than a word count, and the pattern requires
 * whitespace after it, so a decimal inside a number ("7.5 h") cannot cut a
 * line in half.
 */
/** Sentences, split only where a terminator is followed by space or the end.
 *
 *  A plain `[^.!?]+` split cuts "Schlaf 7.5 h" into "Schlaf 7." — the decimal
 *  point is a full stop to a regex and not to a reader. Lookahead only, no
 *  lookbehind, because Safari carried that gap longer than this app can
 *  assume. */
function sentences(text: string): string[] {
  return text
    .split(/([.!?])(?=\s|$)/)
    .reduce<string[]>((acc, part, i, all) => {
      if (i % 2 === 0) {
        const joined = (part + (all[i + 1] ?? '')).trim()
        if (joined) acc.push(joined)
      }
      return acc
    }, [])
}

function coachVerdict(text: string): string {
  const parts = sentences(text)
  if (parts.length === 0) return text.trim()

  const [lead] = splitLeadFigure(parts[0])
  if (lead && parts.length > 1) return parts.slice(1).join(' ').trim()
  return parts[0]
}

export default function W3CoachCard({ headline, body, date, restNote }: W3CoachCardProps) {
  const reduce = useReducedMotion()
  if (!headline && !body && !restNote) return null

  const verdict = headline ? coachVerdict(headline) : null
  const [figure, rest] = verdict ? splitLeadFigure(verdict) : [null, '']

  return (
    <div style={band(26)}>
      <div style={{
        ...lux(28),
        padding: S.xl,
        gap: S.lg,
        fontFamily: FONT,
        // The light source, in the corner the hero's own light comes from.
        // Layered over the flat tone rather than replacing it, so the card is
        // still one surface and not a gradient.
        backgroundImage: `radial-gradient(120% 90% at 8% 0%, ${T.acid}1A, transparent 62%)`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center', flex: 'none',
            padding: '6px 11px 6px 9px', borderRadius: 100, background: T.acidDim,
          }}>
            <Sparkles size={12} color={T.acid} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.1, color: T.acid }}>KI-COACH</span>
          </div>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, fontWeight: 600, color: T.quiet }}>
            {date}
          </span>
          {/* The reasoning, one tap away and in the same sheet the session
              header opens — one explanation, reachable from either question. */}
          <W3WhyButton />
        </div>

        {restNote && (
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{restNote}</span>
        )}

        {headline && (
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.18, color: T.ink, minWidth: 0 }}>
            {figure && <span style={{ color: T.acid }}>{figure}</span>}
            {figure ? rest : verdict}
          </motion.span>
        )}

        {body && (
          <span style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.62, color: T.mid, minWidth: 0 }}>
            {body}
          </span>
        )}
      </div>
    </div>
  )
}
