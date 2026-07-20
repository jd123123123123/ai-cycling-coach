/**
 * metricLabel — the single label-mapping layer that makes Coach-Stil
 * 'Einfach' govern the whole UI (usability audit P1, 2026-07).
 *
 * In simple mode every jargon abbreviation renders as a plain word
 * (TSS→'Belastung', CTL→'Fitness', …); technical mode keeps the
 * abbreviation exactly as today. Two orthogonal axes, same as
 * coachLanguage.ts:
 *   - `language: 'simple' | 'technical'` — the coach VOICE
 *   - `locale: 'en' | 'de'`             — the UI LANGUAGE
 *
 * This file also hosts the bilingual glossary copy bank consumed by
 * GlossarySheet/useGlossary — it lives here (not in the .tsx) so the
 * copy is pure-importable and pinnable from node-env vitest.
 */
import type { CoachLanguage } from '../contexts/LanguageContext'
import type { Locale } from '../i18n/strings'

export type MetricKey =
  | 'tss'
  | 'ctl'
  | 'atl'
  | 'tsb'
  | 'cp'
  | 'eftp'
  | 'ftp'
  | 'kj'
  | 'if'
  | 'np'
  | 'hrv'
  | 'vo2max'
  | 'w_prime'
  | 'ef'
  | 'decoupling'
  | 'durability'

type LocalePair = { en: string; de: string }

/** Technical mode: the abbreviation, verbatim — what power users expect. */
const TECHNICAL: Record<MetricKey, LocalePair> = {
  tss:        { en: 'TSS', de: 'TSS' },
  ctl:        { en: 'CTL', de: 'CTL' },
  atl:        { en: 'ATL', de: 'ATL' },
  tsb:        { en: 'TSB', de: 'TSB' },
  cp:         { en: 'CP', de: 'CP' },
  eftp:       { en: 'eFTP', de: 'eFTP' },
  ftp:        { en: 'FTP', de: 'FTP' },
  kj:         { en: 'kJ', de: 'kJ' },
  if:         { en: 'IF', de: 'IF' },
  np:         { en: 'NP', de: 'NP' },
  hrv:        { en: 'HRV', de: 'HRV' },
  vo2max:     { en: 'VO2max', de: 'VO2max' },
  w_prime:    { en: 'W′', de: 'W′' },
  ef:         { en: 'EF', de: 'EF' },
  decoupling: { en: 'Decoupling', de: 'Entkopplung' },
  durability: { en: 'Durability', de: 'Haltbarkeit' },
}

/** Simple mode: audit-pinned plain words. VO2max stays — it's a household word. */
const SIMPLE: Record<MetricKey, LocalePair> = {
  tss:        { en: 'Load', de: 'Belastung' },
  ctl:        { en: 'Fitness', de: 'Fitness' },
  atl:        { en: 'Fatigue', de: 'Ermüdung' },
  tsb:        { en: 'Freshness', de: 'Frische' },
  cp:         { en: 'Threshold', de: 'Schwelle' },
  eftp:       { en: 'Threshold', de: 'Schwelle' },
  ftp:        { en: 'Threshold', de: 'Schwelle' },
  kj:         { en: 'Work', de: 'Arbeit' },
  if:         { en: 'Intensity', de: 'Intensität' },
  np:         { en: 'Power', de: 'Druck' },
  hrv:        { en: 'Recovery signal', de: 'Erholungssignal' },
  vo2max:     { en: 'VO2max', de: 'VO2max' },
  w_prime:    { en: 'Reserve', de: 'Reserve' },
  ef:         { en: 'Efficiency', de: 'Effizienz' },
  decoupling: { en: 'HR drift', de: 'Puls-Drift' },
  durability: { en: 'Durability', de: 'Haltbarkeit' },
}

/**
 * The one label function every metric chip must route through.
 * Technical mode returns the abbreviation unchanged; simple mode
 * returns the plain word for the current locale.
 */
export function metricLabel(
  key: MetricKey,
  language: CoachLanguage,
  locale: Locale = 'en',
): string {
  const map = language === 'simple' ? SIMPLE : TECHNICAL
  return map[key][locale] ?? map[key].en
}

/**
 * Unit-aware chip text: "Belastung · 62", "TSS · 62". The value arrives
 * pre-formatted (caller owns number formatting / units).
 */
export function metricChipText(
  key: MetricKey,
  value: string,
  language: CoachLanguage,
  locale: Locale = 'en',
): string {
  return `${metricLabel(key, language, locale)} · ${value}`
}

// ─── Glossary copy bank ───────────────────────────────────────────────────
//
// One entry per explainable metric: a plain sentence (may embed today's
// reading via {n}) + a "what to do" line. Same friendly register in both
// locales — explanation over blame, never guilt (audit no-guilt rule).

export type GlossaryKey =
  | 'tss'
  | 'ctl'
  | 'atl'
  | 'tsb'
  | 'cp'
  | 'eftp'
  | 'ftp'
  | 'w_prime'
  | 'ef'
  | 'decoupling'
  | 'durability'
  | 'hrv'

export interface GlossaryContent {
  /** Big sheet title — respects the coach voice via metricLabel. */
  title: string
  /** The bridge label: the other voice's name for the same metric. */
  eyebrow: string
  /** Today's reading, pre-formatted by the caller — null when absent. */
  reading: string | null
  /** One plain sentence (reading interpolated where the copy expects it). */
  explanation: string
  /** What to do about it. */
  action: string
}

interface BankEntry {
  explanation: LocalePair
  action: LocalePair
}

// eftp/ftp share the cp entry — same concept, one explanation.
const BANK: Record<Exclude<GlossaryKey, 'eftp' | 'ftp'>, BankEntry> = {
  decoupling: {
    // Audit-pinned reference copy (P1) — do not reword.
    explanation: {
      de: 'Puls-Drift {n} — dein Puls stieg leicht bei gleicher Leistung. Unter 5 % gilt als sehr ausdauernd; mehr lockere Grundlage senkt den Wert.',
      en: 'HR drift {n} — your heart rate crept up at the same power. Under 5% is very aerobic; more easy base riding brings it down.',
    },
    action: {
      de: 'Mehr lockere Grundlagen-Fahrten einplanen — der Wert sinkt von allein.',
      en: 'Plan more easy base rides — the number comes down on its own.',
    },
  },
  ctl: {
    explanation: {
      de: 'Fitness {n} — die Größe deines Motors, aufgebaut aus den letzten sechs Wochen Training. Sie wächst langsam mit stetigem Fahren und sinkt nur langsam in Pausen.',
      en: 'Fitness {n} — the size of your engine, built from the last six weeks of riding. It climbs slowly with steady training and fades only slowly when you rest.',
    },
    action: {
      de: 'Dranbleiben — Konstanz lässt diese Zahl wachsen, nicht einzelne Heldentage.',
      en: 'Keep showing up — consistency grows this number, not hero days.',
    },
  },
  atl: {
    explanation: {
      de: 'Ermüdung {n} — wie viel Last die letzte Woche auf dich gelegt hat. Für ein paar Tage hoch ist völlig okay; danach sollte sie wieder sinken.',
      en: 'Fatigue {n} — how much load the last week put on you. Running high for a few days is fine; it should come back down after.',
    },
    action: {
      de: 'Bleibt sie hoch und du fühlst dich platt, plane einen lockeren Tag ein.',
      en: 'If it stays high and you feel flat, plan an easier day.',
    },
  },
  tsb: {
    explanation: {
      de: 'Frische {n} — Fitness minus Ermüdung. Positiv heißt frische Beine, leicht negativ heißt produktives Training, tief im Minus heißt: Zeit zum Verarbeiten.',
      en: "Freshness {n} — fitness minus fatigue. Positive means fresh legs, slightly negative means productive training, deep negative means it's time to absorb.",
    },
    action: {
      de: 'Tief im Minus? Ein lockerer Tag zahlt auf morgen ein.',
      en: 'Deep in the minus? An easy day pays into tomorrow.',
    },
  },
  tss: {
    explanation: {
      de: 'Belastung {n} — wie viel eine Fahrt von deinem Körper verlangt, aus Dauer und Härte zusammen. 50 ist eine solide Stunde, 100 ein großer Tag.',
      en: 'Load {n} — how much a ride asks of your body, from how long and how hard combined. 50 is a solid hour, 100 a big day.',
    },
    action: {
      de: 'Vergleiche Tage über die Belastung, nicht nur über Stunden — kurz und hart kann mehr wiegen als lang und locker.',
      en: 'Compare days by load, not just hours — short and hard can outweigh long and easy.',
    },
  },
  cp: {
    explanation: {
      de: 'Schwelle {n} — das härteste Tempo, das du über einen langen Einsatz gleichmäßig halten kannst. Alles darüber verbrennt Streichhölzer, alles darunter ist haltbar.',
      en: 'Threshold {n} — the hardest pace you can hold steady for a long effort. Everything above it burns matches, everything below is sustainable.',
    },
    action: {
      de: 'Training knapp unter der Schwelle hebt sie mit der Zeit an.',
      en: 'Riding just under threshold raises it over time.',
    },
  },
  w_prime: {
    explanation: {
      de: 'Reserve {n} — dein Streichholzbriefchen: die Extra-Energie über der Schwelle, bevor du rausnehmen musst. Sie füllt sich wieder auf, wenn du locker fährst.',
      en: 'Reserve {n} — your matchbook: the extra energy you can spend above threshold before you have to back off. It refills when you ride easy.',
    },
    action: {
      de: 'Setz sie bewusst ein — wenige große Streichhölzer statt ständigem Knabbern.',
      en: 'Spend it deliberately — a few big matches, not constant nibbling.',
    },
  },
  ef: {
    explanation: {
      de: 'Effizienz {n} — wie viel Leistung du pro Herzschlag bekommst. Steigt sie über Wochen, wächst dein aerober Motor.',
      en: 'Efficiency {n} — how much power you get per heartbeat. When it climbs across weeks, your aerobic engine is growing.',
    },
    action: {
      de: 'Lockeres, konstantes Fahren treibt sie nach oben — beachte den Trend, nicht einzelne Tage.',
      en: 'Easy, consistent riding pushes it up — watch the trend, not single days.',
    },
  },
  durability: {
    explanation: {
      de: 'Haltbarkeit {n} — wie gut du spät in einer Fahrt die Leistung hältst. Näher an null heißt: du brichst müde weniger ein.',
      en: 'Durability {n} — how well you hold power late in a ride. Closer to zero means you fade less when tired.',
    },
    action: {
      de: 'Lange, gleichmäßige Fahrten mit starkem Finish trainieren das am besten.',
      en: 'Long steady rides with a strong finish train this best.',
    },
  },
  hrv: {
    explanation: {
      de: 'Erholungssignal {n} — die Schwankung von Herzschlag zu Herzschlag. Über deiner Basis heißt meist gut erholt; ein Knick heißt, dein Körper arbeitet noch.',
      en: 'Recovery signal {n} — the beat-to-beat variation of your heart. Above your baseline usually means recovered; a dip means your body is still working.',
    },
    action: {
      de: 'An einem Knick-Tag: Intensität freundlich halten und zuerst schlafen.',
      en: 'On a dipped day, keep intensity friendly and put sleep first.',
    },
  },
}

/** {n} → reading; when no reading exists the placeholder collapses cleanly. */
function fillReading(template: string, reading: string | null | undefined): string {
  const out = reading
    ? template.replace(/\{n\}/g, reading)
    : template.replace(/[ ]*\{n\}[ ]*/g, ' ')
  return out.replace(/ {2,}/g, ' ').trim()
}

/**
 * Assemble the full sheet content for one metric. `reading` arrives
 * pre-formatted with its unit (e.g. '5,8 %', '62', '+4') — the copy bank
 * interpolates it into the explanation and the sheet shows it big.
 */
export function buildGlossaryContent(
  key: GlossaryKey,
  language: CoachLanguage,
  locale: Locale = 'en',
  reading?: string | null,
): GlossaryContent {
  const bankKey = (key === 'eftp' || key === 'ftp' ? 'cp' : key) as Exclude<
    GlossaryKey,
    'eftp' | 'ftp'
  >
  const entry = BANK[bankKey]
  const otherVoice: CoachLanguage = language === 'simple' ? 'technical' : 'simple'
  return {
    title: metricLabel(key, language, locale),
    eyebrow: metricLabel(key, otherVoice, locale),
    reading: reading ?? null,
    explanation: fillReading(entry.explanation[locale] ?? entry.explanation.en, reading),
    action: entry.action[locale] ?? entry.action.en,
  }
}
