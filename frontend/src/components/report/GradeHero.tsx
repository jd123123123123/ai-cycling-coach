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
  const R = 46
  const C = 2 * Math.PI * R
  const pct = score == null ? 0 : Math.min(1, animated / 100)
  return (
    <div className="relative shrink-0" style={{ width: 112, height: 112 }}>
      <svg width={112} height={112} viewBox="0 0 112 112">
        <circle cx={56} cy={56} r={R} fill="none" stroke="var(--color-rule)" strokeWidth={8} />
        <circle
          cx={56} cy={56} r={R} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 56 56)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="leading-none" style={{ color, fontSize: 34, fontWeight: 600 }}>
          {letter ?? '—'}
        </span>
        {score != null && (
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11, marginTop: 2 }}>
            {Math.round(animated)}
          </span>
        )}
      </div>
    </div>
  )
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

      <div className="flex items-start gap-5">
        <GradeRing score={report.grade_score} letter={report.grade_letter} color={color} />

        <div className="flex-1 min-w-0">
          {/* AI verdict — editorial headline */}
          <p
            style={{
              fontFamily: 'var(--font-serif, serif)',
              color: 'var(--color-ink)',
              fontSize: 21,
              lineHeight: 1.32,
              maxWidth: '60ch',
              fontWeight: 400,
            }}
          >
            {renderVerdict(report.ai_verdict)}
          </p>

          {/* consolidated stat row — delta, percentile, trend */}
          <div className="flex items-center gap-3 flex-wrap mt-3.5">
            {delta != null && delta !== 0 && (
              <span className="num-mono" style={{
                fontSize: 11, color: delta > 0 ? 'var(--color-good)' : 'var(--color-bad)',
              }}>
                {delta > 0 ? '▲' : '▼'}{Math.abs(delta)} {locale === 'de' ? `vs. letzte ${report.days}T` : `vs last ${report.days}d`}
              </span>
            )}
            {report.grade_percentile != null && (
              <span className="num-mono px-2 py-0.5 rounded-full" style={{
                fontSize: 10, color: 'var(--color-ink-2)',
                backgroundColor: 'color-mix(in srgb, var(--color-ink) 6%, transparent)',
              }}>
                {locale === 'de' ? `Top ${Math.max(1, 100 - report.grade_percentile)}% · deine Historie` : `Top ${Math.max(1, 100 - report.grade_percentile)}% · your history`}
              </span>
            )}
            {report.composite_trend.length >= 3 && (
              <Sparkline values={report.composite_trend} width={90} height={22} stroke="var(--color-ink-2)" showDot={false} />
            )}
          </div>
        </div>
      </div>

      {/* evidence chips — bordered pills */}
      {report.evidence.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-5">
          {report.evidence.map((c: EvidenceChip, i: number) => (
            <span
              key={i}
              className="num-mono inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ fontSize: 11, color: 'var(--color-muted)', border: '1px solid var(--color-rule)' }}
            >
              {c.label} <span style={{ color: chipColor(c.tone) }}>{c.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
