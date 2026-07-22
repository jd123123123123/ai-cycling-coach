/**
 * rideVerdict — the "Did I do well?" answer, in one warm plain-language line.
 *
 * A casual rider's first post-ride question isn't "what was my IF?" — it's
 * simply "did I do well today?" This maps the REAL ride outcome (the debrief
 * grade/score, intensity factor, and load) onto a single reassuring verdict
 * that LEADS the recap, above the dense numbers. It is deterministic and
 * honest: an easy spin reads as "locker gehalten" (a win, not a shortfall),
 * a hard day that scored low reads kindly ("zählt trotzdem"), never as a
 * grade or a scolding. No fabricated praise — the tone tracks the data.
 *
 * Two orthogonal axes, same as the rest of the UI:
 *   - `locale: 'en' | 'de'`             — the UI LANGUAGE (German-first)
 *   - `language: 'simple' | 'technical'` — the coach VOICE (guide vs power)
 * Simple/guide mode stays purely feelings-based; technical mode keeps the
 * same warm headline but carries a compact metric tail (IF · TSS).
 */
import type { CoachLanguage } from '../contexts/LanguageContext'
import type { Locale } from '../i18n/strings'

export interface RideVerdictInput {
  /** Debrief grade_score, 0–100 (overall quality). */
  score: number | null | undefined
  /** Intensity factor — the character axis (easy ⇄ hard). */
  if_: number | null | undefined
  /** Training load for this ride. */
  tss: number | null | undefined
  /** Moving time in seconds — the last-resort "you got out and rode" fallback. */
  durationS: number | null | undefined
}

/** Drives the accent color of the chip. */
export type RideVerdictTone = 'strong' | 'solid' | 'easy' | 'honest'

export interface RideVerdict {
  tone: RideVerdictTone
  /** Bold one-liner — the answer. */
  headline: string
  /** Warm supporting clause. */
  sub: string
  /** Compact metric context, technical mode only (else null). */
  metricTail: string | null
}

type Pair = { en: string; de: string }
type Copy = { tone: RideVerdictTone; headline: Pair; sub: Pair }

// Intensity character from IF. Coggan-ish bands, kept coarse on purpose.
type Character = 'easy' | 'base' | 'tempo' | 'hard' | 'unknown'
function characterOf(if_: number | null | undefined): Character {
  if (if_ == null || !Number.isFinite(if_) || if_ <= 0) return 'unknown'
  if (if_ < 0.65) return 'easy'
  if (if_ < 0.8) return 'base'
  if (if_ < 0.92) return 'tempo'
  return 'hard'
}

// Quality tier from the debrief score.
type Quality = 'strong' | 'solid' | 'ok' | 'modest' | 'unknown'
function qualityOf(score: number | null | undefined): Quality {
  if (score == null || !Number.isFinite(score)) return 'unknown'
  if (score >= 82) return 'strong'
  if (score >= 62) return 'solid'
  if (score >= 40) return 'ok'
  return 'modest'
}

function copyFor(character: Character, quality: Quality): Copy {
  // Honesty rule: an easy ride is SUPPOSED to be easy — always a warm win,
  // never judged against a performance score.
  if (character === 'easy') {
    return {
      tone: 'easy',
      headline: { de: 'Locker gehalten', en: 'Kept it easy' },
      sub: { de: 'Genau richtig für einen ruhigen Tag.', en: 'Just right for an easy day.' },
    }
  }

  if (character === 'base') {
    if (quality === 'strong' || quality === 'solid') {
      return {
        tone: 'solid',
        headline: { de: 'Solide Grundlage', en: 'Solid base ride' },
        sub: { de: 'Sauber im Wohlfühlbereich gefahren.', en: 'Held a clean, comfortable zone.' },
      }
    }
    return {
      tone: 'solid',
      headline: { de: 'Grundlage im Kasten', en: 'Base miles banked' },
      sub: { de: 'Zeit auf dem Rad zählt — genau das baut auf.', en: 'Time on the bike counts — this is what builds you.' },
    }
  }

  if (character === 'tempo') {
    if (quality === 'strong') {
      return {
        tone: 'strong',
        headline: { de: 'Stark gefahren', en: 'Strong riding' },
        sub: { de: 'Guter Tempo-Reiz, sauber getroffen.', en: 'Good tempo work, well judged.' },
      }
    }
    return {
      tone: 'solid',
      headline: { de: 'Guter Reiz gesetzt', en: 'Good stimulus set' },
      sub: { de: 'Ordentlich Tempo gemacht heute.', en: 'A proper tempo effort today.' },
    }
  }

  if (character === 'hard') {
    if (quality === 'strong') {
      return {
        tone: 'strong',
        headline: { de: 'Starke Einheit', en: 'Strong session' },
        sub: { de: 'Harter Tag — genau richtig getroffen.', en: 'Hard day — nailed it.' },
      }
    }
    if (quality === 'solid') {
      return {
        tone: 'strong',
        headline: { de: 'Hart durchgezogen', en: 'Pushed hard' },
        sub: { de: 'Da hast du dich richtig reingekniet.', en: 'You really dug in on that one.' },
      }
    }
    // Hard effort that scored low — likely cut short or a rough day. Kind, honest.
    return {
      tone: 'honest',
      headline: { de: 'Intensiv angegangen', en: 'You went for it' },
      sub: { de: 'Nicht dein Tag? Zählt trotzdem — der Reiz sitzt.', en: 'Not your day? Still counts — the stimulus is in.' },
    }
  }

  // Unknown character (no power/IF — e.g. a basic-bike ride). Lean on quality,
  // else just honor that she got out and rode.
  if (quality === 'strong' || quality === 'solid') {
    return {
      tone: 'solid',
      headline: { de: 'Gute Einheit', en: 'Good ride' },
      sub: { de: 'Sauber durchgezogen — stark.', en: 'Cleanly done — nice work.' },
    }
  }
  return {
    tone: 'solid',
    headline: { de: 'Fahrt im Kasten', en: 'Ride done' },
    sub: { de: 'Rausgegangen und gefahren — das zählt.', en: 'You got out and rode — that counts.' },
  }
}

/**
 * Build the verdict line for the current locale + coach voice. Deterministic;
 * safe with every field null (falls back to the warm "you rode" verdict).
 */
export function rideVerdict(
  input: RideVerdictInput,
  language: CoachLanguage,
  locale: Locale = 'en',
): RideVerdict {
  const character = characterOf(input.if_)
  const quality = qualityOf(input.score)
  const copy = copyFor(character, quality)

  let metricTail: string | null = null
  if (language === 'technical') {
    const parts: string[] = []
    if (input.if_ != null && Number.isFinite(input.if_) && input.if_ > 0) {
      parts.push(`IF ${input.if_.toFixed(2)}`)
    }
    if (input.tss != null && Number.isFinite(input.tss) && input.tss > 0) {
      parts.push(`${Math.round(input.tss)} TSS`)
    }
    metricTail = parts.length ? parts.join(' · ') : null
  }

  return {
    tone: copy.tone,
    headline: copy.headline[locale] ?? copy.headline.en,
    sub: copy.sub[locale] ?? copy.sub.en,
    metricTail,
  }
}

/** Tone → CSS custom-property color for the chip accent. */
export function rideVerdictColor(tone: RideVerdictTone): string {
  switch (tone) {
    case 'strong':
      return 'var(--color-accent)'
    case 'honest':
      return 'var(--color-amber)'
    case 'easy':
    case 'solid':
    default:
      return 'var(--color-recovery)'
  }
}
