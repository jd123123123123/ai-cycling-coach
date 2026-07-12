import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import type { RaceDebrief } from '../../api/debrief'
import { bestRead, worstRead, type Read } from './insights'

function gradeColor(letter: string | null): string {
  if (!letter) return 'var(--color-muted)'
  const c = letter[0]
  if (c === 'A') return 'var(--color-good)'
  if (c === 'B') return 'var(--color-ink)'
  if (c === 'C') return 'var(--color-caution)'
  return 'var(--color-bad)'
}

/** Plain-language word for the execution grade so a letter never stands alone —
 * a strong endurance day landing on a "C" shouldn't read as a school report. */
function gradeWord(letter: string | null, de: boolean): string {
  const c = letter?.[0]
  if (c === 'A') return de ? 'herausragend' : 'standout'
  if (c === 'B') return de ? 'stark' : 'strong'
  if (c === 'C') return de ? 'solide' : 'solid'
  if (c === 'D') return de ? 'zäh' : 'tough'
  return de ? 'lehrreich' : 'one to learn from'
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

function GradeBadge({ score, letter, color }: { score: number | null; letter: string | null; color: string }) {
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

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0" title={hint}>
      <span className="num-mono" style={{ fontSize: 18, color: 'var(--color-ink)', fontWeight: 600 }}>
        {value}
      </span>
      <span
        className="eyebrow num-mono"
        style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--color-muted)', cursor: hint ? 'help' : undefined }}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * The Hero's single biggest-win / biggest-fix pair. Distinct from KeyReads (which
 * carries the full ranked band) — this is the one-glance "best thing / worst thing,
 * and exactly what to do about it." Each carries the read's concrete action so the
 * verdict is never descriptive-only.
 */
function HeadlineCard({ kind, read, de }: { kind: 'win' | 'fix'; read: Read | undefined; de: boolean }) {
  const color = kind === 'win' ? 'var(--color-good)' : 'var(--color-bad)'
  const title = kind === 'win' ? (de ? 'GRÖSSTER GEWINN' : 'BIGGEST WIN') : (de ? 'WICHTIGSTER FIX' : 'BIGGEST FIX')
  return (
    <div
      className="flex flex-col gap-2 rounded-[14px] p-4"
      style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 26%, var(--color-rule))` }}
    >
      <span className="eyebrow num-mono" style={{ color, fontSize: 9.5, letterSpacing: '0.22em' }}>
        {title}
      </span>
      {read ? (
        <>
          <div className="flex items-baseline gap-2 flex-wrap">
            {read.metric && (
              <span className="num-mono" style={{ color, fontSize: 20, fontWeight: 600 }}>{read.metric}</span>
            )}
            <span style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)', fontSize: 15, fontWeight: 500 }}>
              {read.title}
            </span>
          </div>
          <p style={{ color: 'var(--color-ink-2)', fontSize: 13, lineHeight: 1.45 }}>{read.read}</p>
          {read.doThis && (
            <p className="mt-0.5 flex items-start gap-1.5" style={{ color: 'var(--color-ink)', fontSize: 13, lineHeight: 1.4, fontWeight: 500 }}>
              <span style={{ color }}>→</span>
              <span>{read.doThis}</span>
            </p>
          )}
        </>
      ) : (
        <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>
          {kind === 'win'
            ? (de ? 'Solide durchgezogen — kein einzelner Ausreißer nach oben.' : 'Solid throughout — no single standout to call out.')
            : (de ? 'Sauber ausgeführt — nichts Dringendes zu beheben.' : 'Cleanly executed — nothing urgent to fix.')}
        </span>
      )}
    </div>
  )
}

export default function DebriefHero({ report }: { report: RaceDebrief }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { header, verdict, segments } = report
  const color = gradeColor(verdict.grade_letter)
  const hideElevation = header.elevation_m === 0 && segments.length === 0
  const prCount = (report.efforts ?? []).filter((e) => e.is_pr).length

  // Achievement-first framing: celebrate what was conquered before judging how it
  // was executed, so the grade lands as context, not a verdict on the effort.
  const achievements: string[] = []
  if (!hideElevation && header.elevation_m > 0) achievements.push(`${Math.round(header.elevation_m).toLocaleString(de ? 'de' : 'en')} ${de ? 'Hm bezwungen' : 'm climbed'}`)
  if (prCount > 0) achievements.push(de ? `${prCount} neue Bestwerte` : `${prCount} new bests`)
  achievements.push(`${header.distance_km.toFixed(0)} km`)

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
        <div className="flex flex-col gap-1 min-w-0">
          <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
            {locale === 'de' ? 'RENN-DEBRIEF' : 'RACE DEBRIEF'}
          </span>
          <h1 style={{ fontFamily: 'var(--font-serif, serif)', color: 'var(--color-ink)', fontSize: 22, fontWeight: 500 }}>
            {header.title}
          </h1>
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
            {formatDate(header.date, locale)}
          </span>
          {achievements.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {achievements.map((a, i) => (
                <span key={i} className="num-mono rounded-full px-2.5 py-1"
                  style={{ fontSize: 10.5, color: 'var(--color-ink)', background: 'color-mix(in srgb, var(--color-good) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-good) 28%, var(--color-rule))' }}>
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <GradeBadge score={verdict.grade_score} letter={verdict.grade_letter} color={color} />
          <div className="flex flex-col items-center">
            <span className="num-mono" style={{ fontSize: 8.5, letterSpacing: '0.16em', color: 'var(--color-muted)' }}>
              {de ? 'AUSFÜHRUNG' : 'EXECUTION'}
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color, fontWeight: 500 }}>
              {gradeWord(verdict.grade_letter, de)}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p
            style={{
              fontFamily: 'var(--font-serif, serif)',
              color: 'var(--color-ink)',
              fontSize: 'clamp(17px, 4.6vw, 21px)',
              lineHeight: 1.34,
              maxWidth: '60ch',
              fontWeight: 400,
            }}
          >
            {renderVerdict(verdict.ai_verdict)}
          </p>
        </div>
      </div>

      {/* stat strip */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 mt-6 pt-5" style={{ borderTop: '1px solid var(--color-rule)' }}>
        <Stat label={locale === 'de' ? 'DISTANZ' : 'DISTANCE'} value={`${header.distance_km.toFixed(1)} km`} />
        {!hideElevation && (
          <Stat label={locale === 'de' ? 'HÖHENMETER' : 'ELEVATION'} value={`${Math.round(header.elevation_m)} m`} />
        )}
        <Stat label={locale === 'de' ? 'ZEIT' : 'TIME'} value={formatDuration(header.moving_time_s)} />
        <Stat label="NP" value={`${Math.round(header.np_watts)} W`}
          hint={de ? 'Normalized Power — gleichmäßige Vergleichsleistung' : 'Normalized Power — steady-state equivalent effort'} />
        <Stat label="IF" value={header.if_ != null ? header.if_.toFixed(2) : '—'}
          hint={de ? 'Intensitätsfaktor — wie hart ggü. deiner FTP (1,0 = Schwelle)' : 'Intensity Factor — how hard vs your FTP (1.0 = threshold)'} />
        <Stat label="TSS" value={`${Math.round(header.tss)}`}
          hint={de ? 'Trainingsbelastung — Gesamtstress der Fahrt' : 'Training Stress Score — total load of the ride'} />
        <Stat label="kJ" value={`${Math.round(header.total_kj)}`}
          hint={de ? 'Verrichtete Arbeit ≈ verbrannte Kalorien' : 'Work done ≈ calories burned'} />
        <Stat label={locale === 'de' ? 'GESCHW.' : 'AVG SPEED'} value={`${header.avg_speed_kmh.toFixed(1)} km/h`} />
      </div>

      {/* biggest win + biggest fix — one glance, each with its action.
          The full ranked band lives in KeyReads, so no duplication here. */}
      <div className="grid gap-4 md:grid-cols-2 mt-6 pt-5" style={{ borderTop: '1px solid var(--color-rule)' }}>
        <HeadlineCard kind="win" read={bestRead(report, de)} de={de} />
        <HeadlineCard kind="fix" read={worstRead(report, de)} de={de} />
      </div>
    </div>
  )
}
