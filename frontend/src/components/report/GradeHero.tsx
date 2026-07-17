import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import Sparkline from '../dashboard/Sparkline'
import type { PeriodReport, EvidenceChip } from '../../api/report'

function gradeColor(letter: string | null): string {
  if (!letter) return 'var(--color-muted)'
  const c = letter[0]
  if (c === 'A') return 'var(--color-good)'
  if (c === 'B') return 'var(--color-ink)'
  if (c === 'C') return 'var(--color-caution)'
  return 'var(--color-bad)'
}

function chipColor(tone: string): string {
  if (tone === 'good') return 'var(--color-good)'
  if (tone === 'bad') return 'var(--color-bad)'
  return 'var(--color-ink-2)'
}

/** Plain-language, supportive read of the letter grade — never demoralizing,
 * so a "D" reads as "im Aufbau" (building) rather than a failing verdict. */
function gradeWord(letter: string | null, de: boolean): string {
  const c = letter?.[0]
  if (c === 'A') return de ? 'stark' : 'strong'
  if (c === 'B') return de ? 'solide' : 'solid'
  if (c === 'C') return de ? 'stabil' : 'steady'
  return de ? 'im Aufbau' : 'building'
}

/** Render the AI verdict, turning `**bold**` markdown spans into real emphasis
 * (the model emits markdown; raw asterisks would read as noise in the hero). */
function renderVerdict(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>
      : part,
  )
}

/** Animated count-up of a 0-100 score over ~900ms (ease-out). */
function useCountUp(target: number | null, duration = 900): number {
  const [val, setVal] = useState(0)
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    if (target == null) { setVal(0); return }
    let raf = 0
    const tick = (t: number) => {
      if (startRef.current == null) startRef.current = t
      const p = Math.min(1, (t - startRef.current) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); startRef.current = null }
  }, [target, duration])
  return val
}

function GradeRing({ score, letter, color }: { score: number | null; letter: string | null; color: string }) {
  const animated = useCountUp(score)
  const R = 29
  const C = 2 * Math.PI * R
  const pct = score == null ? 0 : Math.min(1, animated / 100)
  return (
    <div className="relative shrink-0" style={{ width: 70, height: 70 }}>
      <svg width={70} height={70} viewBox="0 0 70 70">
        <circle cx={35} cy={35} r={R} fill="none" stroke="var(--color-rule)" strokeWidth={5} />
        <circle
          cx={35} cy={35} r={R} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 35 35)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="leading-none" style={{ color, fontSize: 22, fontWeight: 600 }}>
          {letter ?? '—'}
        </span>
        {score != null && (
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 9.5, marginTop: 1 }}>
            {Math.round(animated)}
          </span>
        )}
      </div>
    </div>
  )
}

/** Window-scope the CTL/TSB chip labels so they never read as Today's live
 * "Form heute" / "Fitness" — here they are the PERIOD AVERAGE. Also drops the
 * grey-zone chip, which the IntensityMix panel owns in full (no triple-stated
 * intensity finding). */
function scopeEvidence(chips: EvidenceChip[], de: boolean): EvidenceChip[] {
  return chips
    .filter((c) => c.label !== 'Graue Zone' && c.label !== 'Grey zone')
    .map((c) => {
      if (c.label === 'TSB') return { ...c, label: de ? 'Ø Form (TSB)' : 'Avg form (TSB)' }
      if (c.label === 'CTL') return { ...c, label: de ? 'Ø Fitness (CTL)' : 'Avg fitness (CTL)' }
      return c
    })
}

const PRESETS = [7, 14, 30] as const

/** Compact segmented window control — "the lens on this verdict." Lives inside
 * the hero top-right; replaces the retired standalone WindowToggle. */
function WindowSegmented({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const { locale } = useLocale()
  const isPreset = (PRESETS as readonly number[]).includes(value)
  const [customOpen, setCustomOpen] = useState(!isPreset)

  const segStyle = (active: boolean) => ({
    fontSize: 11,
    letterSpacing: '0.06em',
    backgroundColor: active ? 'var(--color-ink)' : 'transparent',
    color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
  })

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className="flex items-center p-0.5 rounded-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ink) 6%, transparent)', border: '1px solid var(--color-rule)' }}
      >
        {PRESETS.map((d) => {
          const active = value === d && !customOpen
          return (
            <button
              key={d}
              type="button"
              onClick={() => { setCustomOpen(false); onChange(d) }}
              className="px-2.5 py-1 rounded-full num-mono transition-colors"
              style={segStyle(active)}
              aria-pressed={active}
            >
              {d}D
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="px-2.5 py-1 rounded-full num-mono transition-colors"
          style={segStyle(customOpen)}
          aria-pressed={customOpen}
          title={locale === 'de' ? 'Benutzerdefiniert' : 'Custom'}
        >
          {locale === 'de' ? 'Bel.' : 'Custom'}
        </button>
      </div>
      {customOpen && (
        <input
          type="number"
          min={3}
          max={365}
          value={value}
          onChange={(e) => {
            const n = Math.max(3, Math.min(365, Number(e.target.value) || 3))
            onChange(n)
          }}
          className="w-16 px-2 py-1 rounded-full num-mono"
          style={{
            fontSize: 11,
            backgroundColor: 'var(--color-paper)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-rule)',
          }}
          aria-label={locale === 'de' ? 'Benutzerdefinierte Tagesanzahl' : 'Custom day count'}
        />
      )}
    </div>
  )
}

export default function GradeHero({
  report,
  days,
  onDaysChange,
}: {
  report: PeriodReport
  days: number
  onDaysChange: (days: number) => void
}) {
  const { locale } = useLocale()
  const color = gradeColor(report.grade_letter)
  const delta = report.grade_delta
  const evidence = scopeEvidence(report.evidence, locale === 'de')
  return (
    <div
      className="relative rounded-[20px] p-5 sm:p-7 overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        boxShadow: 'var(--shadow-glass-rim), var(--shadow-2)',
        backgroundImage: `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${color} 14%, transparent), transparent 60%)`,
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          {/* Act-1 badge — matches the numbered ActSection headers below so the
             Analyze surface reads 1 → 2 → 3, not an unnumbered hero then 2, 3. */}
          <span
            className="num-mono shrink-0 grid place-items-center rounded-full self-center"
            style={{
              width: 22, height: 22, fontSize: 11, fontWeight: 600,
              color: 'var(--color-forest-2)',
              border: '1px solid color-mix(in srgb, var(--color-forest-2) 40%, transparent)',
            }}
          >1</span>
          <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
            {locale === 'de' ? 'ZEITRAUMBERICHT' : 'PERIOD REPORT'}
          </span>
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
            {report.has_baseline
              ? (locale === 'de' ? `vs. vorherige ${report.days} Tage` : `vs previous ${report.days} days`)
              : (locale === 'de' ? 'noch keine Vergleichsbasis' : 'no baseline yet')}
          </span>
        </div>
        <WindowSegmented value={days} onChange={onDaysChange} />
      </div>

      {/* Verdict leads; the grade is a small supporting chip beside it. */}
      <div className="flex items-start gap-4 sm:gap-5">
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <GradeRing score={report.grade_score} letter={report.grade_letter} color={color} />
          <span
            className="num-mono rounded-full px-2 py-0.5"
            style={{
              fontSize: 10.5, letterSpacing: '0.06em', color,
              backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
            }}
            title={locale === 'de'
              ? 'Gesamtnote für deine Form über diesen Zeitraum — aus Belastung, Intensität und Erholung'
              : 'Overall grade for your fitness across this period — from load, intensity and recovery'}
          >
            {gradeWord(report.grade_letter, locale === 'de')}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* AI verdict — the emotional headline, on the type scale (not oversized) */}
          <p
            style={{
              fontFamily: 'var(--font-serif, serif)',
              color: 'var(--color-ink)',
              fontSize: 'clamp(15px, 3.4vw, 17px)',
              lineHeight: 1.4,
              maxWidth: '60ch',
              fontWeight: 400,
            }}
          >
            {renderVerdict(report.ai_verdict)}
          </p>

          {/* consolidated stat row — delta, percentile, trend */}
          <div className="flex items-center gap-3 flex-wrap mt-3">
            {delta != null && delta !== 0 && (
              <span className="num-mono" style={{
                fontSize: 11, color: delta > 0 ? 'var(--color-good)' : 'var(--color-bad)',
              }}>
                {delta > 0 ? '▲' : '▼'}{Math.abs(delta)} {locale === 'de' ? `vs. letzte ${report.days}T` : `vs last ${report.days}d`}
              </span>
            )}
            {report.grade_percentile != null && (
              <span className="num-mono px-2 py-0.5 rounded-full" style={{
                fontSize: 10, color: 'var(--color-ink-2)', cursor: 'help',
                backgroundColor: 'color-mix(in srgb, var(--color-ink) 6%, transparent)',
              }}
                title={locale === 'de'
                  ? 'Rang unter deinen eigenen bisherigen Zeiträumen — kein globaler Vergleich'
                  : 'Ranked against your own past periods — not a global leaderboard'}
              >
                {locale === 'de' ? `Top ${Math.max(1, 100 - report.grade_percentile)}% deiner Zeiträume` : `Top ${Math.max(1, 100 - report.grade_percentile)}% of your past periods`}
              </span>
            )}
            {report.composite_trend.length >= 3 && (
              <Sparkline values={report.composite_trend} width={90} height={22} stroke="var(--color-ink-2)" showDot={false} />
            )}
          </div>
        </div>
      </div>

      {/* Scannable headline metrics — one uniform row (value 16px, label 10.5px). */}
      {evidence.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
          {evidence.map((c: EvidenceChip, i: number) => (
            <div
              key={i}
              className="flex flex-col gap-0.5 rounded-[12px] px-3 py-2.5"
              style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}
            >
              <span className="num-mono leading-none" style={{ fontSize: 16, fontWeight: 600, color: chipColor(c.tone) }}>
                {c.value}
              </span>
              <span className="num-mono" style={{ fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--color-muted)' }}>
                {c.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
