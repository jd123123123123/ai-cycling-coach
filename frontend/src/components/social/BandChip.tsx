import type { Locale } from '../../i18n/strings'

// BandChip — Coggan/Allen power-profile band label (spec §2.2).
//
// The whole point of fairness: never show a raw watt or a number-vs-number.
// Show the *band label* so a Cat-D rider is celebrated as "Good, climbing
// toward Very Good" rather than shamed against a Cat-A. Mirrors Zwift A/B/C/D
// matchmaking and running age-grading — comparison frames that exist precisely
// so different bodies compete fairly.
//
// Bands are FTP W/kg buckets (men's reference from trainingpeaks power
// profiling). Phase 0 uses a single reference ladder; a gender-aware refinement
// is a later-phase concern (the backend comparison endpoint, spec §5).

interface Band {
  key: string
  min: number // FTP W/kg lower bound
  en: string
  de: string
}

// Ascending. Each band's [min, next.min) is its range; the top band is open-ended.
const BANDS: Band[] = [
  { key: 'untrained', min: 0, en: 'Untrained', de: 'Untrainiert' },
  { key: 'fair', min: 2.0, en: 'Fair', de: 'Solide' },
  { key: 'moderate', min: 2.9, en: 'Moderate', de: 'Moderat' },
  { key: 'good', min: 3.3, en: 'Good', de: 'Gut' },
  { key: 'very_good', min: 3.8, en: 'Very Good', de: 'Sehr gut' },
  { key: 'excellent', min: 4.4, en: 'Excellent', de: 'Exzellent' },
  { key: 'exceptional', min: 5.0, en: 'Exceptional', de: 'Außergewöhnlich' },
  { key: 'world_class', min: 5.7, en: 'World Class', de: 'Weltklasse' },
]

export interface BandResult {
  label: string
  nextLabel: string | null
  /** 0..1 progress from this band's floor to the next band's floor. */
  progressToNext: number
  wkg: number
}

export function bandFor(wkgFtp: number, locale: Locale): BandResult {
  const de = locale === 'de'
  let idx = 0
  for (let i = 0; i < BANDS.length; i++) {
    if (wkgFtp >= BANDS[i].min) idx = i
  }
  const band = BANDS[idx]
  const next = BANDS[idx + 1] ?? null
  const progressToNext = next
    ? Math.max(0, Math.min(1, (wkgFtp - band.min) / (next.min - band.min)))
    : 1
  return {
    label: de ? band.de : band.en,
    nextLabel: next ? (de ? next.de : next.en) : null,
    progressToNext,
    wkg: wkgFtp,
  }
}

export default function BandChip({
  wkgFtp,
  locale,
}: {
  wkgFtp: number
  locale: Locale
}) {
  const de = locale === 'de'
  const b = bandFor(wkgFtp, locale)
  const caption = b.nextLabel
    ? de
      ? `aufsteigend zu ${b.nextLabel}`
      : `climbing toward ${b.nextLabel}`
    : de
      ? 'Spitzenband erreicht'
      : 'top band reached'

  return (
    <div
      className="rounded-[16px] px-4 py-4"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid color-mix(in srgb, var(--color-forest-2) 30%, var(--color-rule))',
      }}
    >
      <span
        className="eyebrow"
        style={{ color: 'var(--color-muted)', letterSpacing: '0.2em', fontSize: 9 }}
      >
        {de ? 'DEIN BAND · FTP W/KG' : 'YOUR BAND · FTP W/KG'}
      </span>
      <div className="flex items-baseline gap-2 mt-2">
        <span
          style={{
            fontFamily: 'var(--font-serif, serif)',
            fontSize: 'clamp(20px, 3vw, 26px)',
            fontWeight: 500,
            color: 'var(--color-forest-2)',
          }}
        >
          {b.label}
        </span>
        <span className="text-[12px] italic" style={{ color: 'var(--color-ink-2)' }}>
          {caption}
        </span>
      </div>
      {/* progress toward the next band — hope, not shame */}
      <div
        className="mt-3 h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-rule)' }}
        aria-hidden
      >
        <div
          style={{
            width: `${Math.round(b.progressToNext * 100)}%`,
            height: '100%',
            backgroundColor: 'var(--color-forest-2)',
            borderRadius: 999,
            transition: 'width 600ms cubic-bezier(.22,1,.36,1)',
          }}
        />
      </div>
    </div>
  )
}
