import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { classifyActivityPolarizedZone } from '../../utils/advanced-metrics'
import { formatHours } from '../../utils/format'
import UncertainValue from './UncertainValue'
import { confidence, MIN_DAYS_POLARIZED } from '../../utils/confidence'
import { useLocale } from '../../contexts/LocaleContext'

type Loc = 'en' | 'de'

// Seiler's polarized model: ~80% time in Z1–Z2 (low), ~20% in Z4–Z5 (high),
// minimal "grey zone" Z3. This two-peak histogram makes the 80/20 split
// instantly visible, whereas every consumer app shows a stacked zone bar
// that smears the insight. We compute zones from the canonical
// classifyActivityPolarizedZone, which anchors on profile LTHR (not session
// peak HR). Activities that cannot be classified are skipped — honest absence
// beats a wrong bucket.

// Grade scale based on Stephen Seiler's public interviews and
// Laursen/Plews review papers: A = 75%+ low, 5-25% high, <10% grey;
// anything meaningfully off that drops a letter.

type ZoneBucket = 'low' | 'grey' | 'high'

interface Distribution {
  low: number   // seconds in Z1–Z2
  grey: number  // seconds in Z3
  high: number  // seconds in Z4–Z5+
  total: number
}

// Map classifyActivityPolarizedZone's return values to the component's bucket names.
function polarizedZoneToZoneBucket(zone: 'easy' | 'moderate' | 'hard'): ZoneBucket {
  if (zone === 'easy') return 'low'
  if (zone === 'moderate') return 'grey'
  return 'high'
}

function grade(pct: { low: number; grey: number; high: number }, locale: Loc): {
  letter: 'A' | 'B' | 'C' | 'D'
  color: string
  note: string
  nextMove: string
} {
  const de = locale === 'de'
  const { low, grey, high } = pct
  if (low >= 75 && high >= 5 && high <= 25 && grey <= 10) {
    return {
      letter: 'A',
      color: 'var(--color-forest-2)',
      note: de
        ? 'Lehrbuch-80/20 — genau dort, wo die aeroben Anpassungen entstehen.'
        : 'Textbook 80/20 — exactly where aerobic adaptations live.',
      nextMove: de
        ? 'Muster halten. Nächste lockere Fahrt strikt unter LT1.'
        : 'Hold the pattern. Keep next easy ride strictly under LT1.',
    }
  }
  if (low >= 65 && grey <= 20) {
    return {
      letter: 'B',
      color: 'var(--color-forest-2)',
      note: de
        ? 'Nah an polarisiert — etwas mehr locker oder etwas weniger Mitte würde es festigen.'
        : 'Close to polarized — a touch more easy or a touch less middle would lock it.',
      nextMove: de
        ? (low < 75
            ? '30–60 Min reines Z2 diese Woche hinzufügen, um das Verhältnis zu kippen.'
            : 'Eine Tempo-Einheit gegen einen echten Intervallblock tauschen, um das obere Ende zu schärfen.')
        : (low < 75
            ? 'Add 30–60 min of pure Z2 this week to tilt the ratio.'
            : 'Swap one tempo session for a true interval block to sharpen the high end.'),
    }
  }
  if (grey > 30) {
    return {
      letter: 'C',
      color: 'var(--color-amber)',
      note: de
        ? 'Grauzonen-Drift. Zu viel Tempo bremst sowohl Ausdauer als auch Spitzengewinne.'
        : 'Grey-zone drift. Too much tempo dulls both endurance and peak gains.',
      nextMove: de
        ? 'Nächste Fahrt: HF bei 75 % LTHR begrenzen. Gib dem aeroben Motor die lockere Arbeit, die er braucht.'
        : 'Next ride: cap HR at 75% LTHR. Give the aerobic engine the easy work it needs.',
    }
  }
  if (high > 30) {
    return {
      letter: 'D',
      color: 'var(--color-alert)',
      note: de
        ? 'Überwiegend hart — es wird keine Grundlage aufgebaut.'
        : 'Mostly hard — no foundation is being built.',
      nextMove: de
        ? 'Die nächsten zwei Fahrten nur Z2. Intensität ohne Basis brennt in 2–3 Wochen aus.'
        : 'Swap the next two rides for Z2 only. Intensity without a base burns out in 2–3 weeks.',
    }
  }
  return {
    letter: 'D',
    color: 'var(--color-alert)',
    note: de
      ? 'Verteilung verfehlt sowohl polarisiert als auch pyramidal.'
      : 'Distribution is off-target for either polarized or pyramidal.',
    nextMove: de
      ? 'Woche neu aufbauen: 1 hart, 1 mittel, 2 locker — das Minimalmuster, das wirklich Fitness aufbaut.'
      : 'Rebuild the week: 1 hard, 1 medium, 2 easy — the minimum pattern that actually builds fitness.',
  }
}

export default function PolarizedDistribution() {
  const { locale } = useLocale()
  const today = new Date()
  const start = subDays(today, 14)
  const { data, isLoading } = useActivitiesRange(start, today)
  const { data: profile } = useAthleteProfile()

  const { distribution, gradeInfo, nDays } = useMemo(() => {
    const acts = data?.activities ?? []
    const dist: Distribution = { low: 0, grey: 0, high: 0, total: 0 }
    for (const a of acts) {
      const dur = a.duration_seconds ?? 0
      if (dur <= 0) continue
      // Use canonical classifier anchored on profile LTHR, not session max_hr.
      // Returns null when no usable LTHR is available — skip rather than guess.
      const zone = classifyActivityPolarizedZone(a, profile)
      if (zone == null) continue
      const bucket = polarizedZoneToZoneBucket(zone)
      dist[bucket] += dur
      dist.total += dur
    }
    const pct = {
      low: dist.total > 0 ? (dist.low / dist.total) * 100 : 0,
      grey: dist.total > 0 ? (dist.grey / dist.total) * 100 : 0,
      high: dist.total > 0 ? (dist.high / dist.total) * 100 : 0,
    }
    return {
      distribution: dist,
      gradeInfo: dist.total > 0 ? grade(pct, locale) : null,
      nDays: acts.filter(a => (a.duration_seconds ?? 0) > 0).length,
    }
  }, [data, locale])

  const pct = {
    low: distribution.total > 0 ? (distribution.low / distribution.total) * 100 : 0,
    grey: distribution.total > 0 ? (distribution.grey / distribution.total) * 100 : 0,
    high: distribution.total > 0 ? (distribution.high / distribution.total) * 100 : 0,
  }

  const polarizedConfidence = confidence({ n_days: nDays, min_days: MIN_DAYS_POLARIZED })
  const daysNeeded = Math.max(1, MIN_DAYS_POLARIZED - nDays)
  const lowConfidenceCopy = locale === 'de'
    ? `Noch ${daysNeeded} weitere${daysNeeded !== 1 ? '' : 'r'} Tag${daysNeeded !== 1 ? 'e' : ''} mit Trainingsdaten nötig.`
    : `Need ${daysNeeded} more day${daysNeeded !== 1 ? 's' : ''} of training data.`

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-start gap-4">
        {/* Grade letter — hero anchor. Gated through UncertainValue when n_days < MIN_DAYS_POLARIZED. */}
        {gradeInfo ? (
          <div
            className="shrink-0 flex flex-col items-center leading-none"
            style={{ animation: 'score-enter 600ms cubic-bezier(.22,1,.36,1) 100ms both' }}
          >
            <UncertainValue
              confidence={polarizedConfidence}
              value={
                <span
                  className="num-display"
                  style={{
                    fontSize: 'clamp(52px, 7vw, 72px)',
                    color: gradeInfo.color,
                    lineHeight: 1,
                    filter: `drop-shadow(0 0 16px color-mix(in srgb, ${gradeInfo.color} 35%, transparent))`,
                  }}
                >
                  {gradeInfo.letter}
                </span>
              }
              lowConfidenceCopy={lowConfidenceCopy}
            />
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 8, letterSpacing: '0.2em', marginTop: 2 }}>
              {locale === 'de' ? 'NOTE' : 'GRADE'}
            </span>
          </div>
        ) : (
          <div className="shrink-0 w-14" />
        )}

        <div className="flex flex-col gap-1 min-w-0 flex-1 pt-1">
          <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
            {locale === 'de' ? 'Polarisiertes Training · letzte 14 Tage' : 'Polarized training · last 14 days'}
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <UncertainValue
              confidence={polarizedConfidence}
              value={
                <span
                  className="num-display leading-none"
                  style={{ fontSize: 'clamp(20px, 2.8vw, 26px)', color: 'var(--color-ink)' }}
                >
                  {gradeInfo
                    ? (locale === 'de'
                        ? `${pct.low.toFixed(0)}% locker · ${pct.high.toFixed(0)}% hart`
                        : `${pct.low.toFixed(0)}% easy · ${pct.high.toFixed(0)}% hard`)
                    : (locale === 'de' ? 'Warte auf Daten' : 'Awaiting data')}
                </span>
              }
            />
          </div>
          <span
            className="num-mono text-[11px]"
            style={{ color: 'var(--color-muted)' }}
            title={locale === 'de' ? 'Ziel: Seiler 80/20 — 75 %+ niedrig, 5–25 % hoch, <10 % grau' : 'Target: Seiler 80/20 — 75%+ low, 5–25% high, <10% grey'}
          >
            {locale === 'de' ? 'Ziel 80 / <10 / 20' : 'Target 80 / <10 / 20'}
          </span>
        </div>
      </div>

      {/* Horizontal stacked bar — one-glance zone snapshot. Uses zone CSS tokens. */}
      {!isLoading && distribution.total > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <div
            className="flex rounded-full overflow-hidden h-2.5"
            style={{ backgroundColor: 'var(--color-rule)' }}
          >
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{ width: `${pct.low}%`, backgroundColor: 'var(--color-forest-2)' }}
              title={locale === 'de' ? `Locker: ${pct.low.toFixed(0)}%` : `Easy: ${pct.low.toFixed(0)}%`}
            />
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{ width: `${pct.grey}%`, backgroundColor: 'var(--color-zone-3)', marginLeft: pct.grey > 0 && pct.low > 0 ? 1 : 0 }}
              title={locale === 'de' ? `Grauzone: ${pct.grey.toFixed(0)}%` : `Grey zone: ${pct.grey.toFixed(0)}%`}
            />
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{ width: `${pct.high}%`, backgroundColor: 'var(--color-zone-4)', marginLeft: pct.high > 0 && (pct.grey > 0 || pct.low > 0) ? 1 : 0 }}
              title={locale === 'de' ? `Hart: ${pct.high.toFixed(0)}%` : `Hard: ${pct.high.toFixed(0)}%`}
            />
          </div>
          {/* Legend — zone token colors */}
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 num-mono text-[10px]" style={{ color: 'var(--color-forest-2)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-forest-2)' }} />
              {pct.low.toFixed(0)}% {locale === 'de' ? 'locker' : 'easy'}
            </span>
            <span className="inline-flex items-center gap-1 num-mono text-[10px]" style={{ color: 'var(--color-zone-3)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-zone-3)' }} />
              {pct.grey.toFixed(0)}% {locale === 'de' ? 'grau' : 'grey'}
            </span>
            <span className="inline-flex items-center gap-1 num-mono text-[10px]" style={{ color: 'var(--color-zone-4)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-zone-4)' }} />
              {pct.high.toFixed(0)}% {locale === 'de' ? 'hart' : 'hard'}
            </span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div
          className="mt-4 h-20 rounded animate-pulse"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
      ) : distribution.total === 0 ? (
        <p
          className="mt-3 text-[13px]"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {locale === 'de'
            ? 'Zeichne ein paar Einheiten in den letzten 14 Tagen auf, um deine Polarisierungsnote zu sehen.'
            : 'Log a couple of sessions in the last 14 days to see your polarization grade.'}
        </p>
      ) : (
        <>
          {/* 3-row zone table using var(--color-zone-N) swatches. formatHours from utils/format.ts. */}
          <div
            className="mt-4"
            role="table"
            aria-label={locale === 'de' ? 'Zonenverteilung' : 'Zone distribution'}
          >
            {/* Row: Endurance Z1-Z2 */}
            <div
              className="flex items-center gap-3 py-2"
              style={{ borderBottom: '1px solid var(--color-rule)' }}
              role="row"
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--color-zone-2)' }}
                aria-hidden
              />
              <span className="text-[13px] flex-1" style={{ color: 'var(--color-ink-2)' }}>{locale === 'de' ? 'Grundlage (Z1–Z2)' : 'Endurance (Z1–Z2)'}</span>
              <span className="num-mono text-[13px] tabular-nums" style={{ color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>
                {formatHours(distribution.low)}
              </span>
              <span className="num-mono text-[13px] tabular-nums w-[38px] text-right" style={{ color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {pct.low.toFixed(0)}%
              </span>
            </div>
            {/* Row: Tempo Z3 */}
            <div
              className="flex items-center gap-3 py-2"
              style={{ borderBottom: '1px solid var(--color-rule)' }}
              role="row"
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--color-zone-3)' }}
                aria-hidden
              />
              <span className="text-[13px] flex-1" style={{ color: 'var(--color-ink-2)' }}>{locale === 'de' ? 'Tempo (Z3)' : 'Tempo (Z3)'}</span>
              <span className="num-mono text-[13px] tabular-nums" style={{ color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>
                {formatHours(distribution.grey)}
              </span>
              <span className="num-mono text-[13px] tabular-nums w-[38px] text-right" style={{ color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {pct.grey.toFixed(0)}%
              </span>
            </div>
            {/* Row: Hard Z4+ */}
            <div
              className="flex items-center gap-3 py-2"
              role="row"
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--color-zone-4)' }}
                aria-hidden
              />
              <span className="text-[13px] flex-1" style={{ color: 'var(--color-ink-2)' }}>{locale === 'de' ? 'Hart (Z4+)' : 'Hard (Z4+)'}</span>
              <span className="num-mono text-[13px] tabular-nums" style={{ color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>
                {formatHours(distribution.high)}
              </span>
              <span className="num-mono text-[13px] tabular-nums w-[38px] text-right" style={{ color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {pct.high.toFixed(0)}%
              </span>
            </div>
          </div>

          {gradeInfo && (
            <div className="mt-3 flex flex-col gap-2">
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--color-ink-2)' }}
              >
                {gradeInfo.note}
              </p>
              {/* Prescribe-don't-describe — a specific next move per grade.
                 Users can act on a sentence; they can't act on a chart. */}
              <div
                className="flex items-start gap-2 text-[13px] leading-relaxed rounded-lg px-3 py-2"
                style={{
                  color: 'var(--color-ink)',
                  backgroundColor: `color-mix(in srgb, ${gradeInfo.color} 8%, transparent)`,
                  borderLeft: `2px solid ${gradeInfo.color}`,
                }}
              >
                <span
                  className="eyebrow mt-0.5"
                  style={{
                    color: gradeInfo.color,
                    fontSize: 9,
                    letterSpacing: '0.22em',
                  }}
                >
                  {locale === 'de' ? 'NÄCHSTER SCHRITT →' : 'NEXT →'}
                </span>
                <span>{gradeInfo.nextMove}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
