import { useLocale } from '../../contexts/LocaleContext'
import type { Prescription } from '../../api/debrief'

// Act 4 — the plan, framed as the closing "do this next" moment. Ranked
// prescriptions from this ride: a race tactic to carry into the next event and a
// training fix. The #1 action gets the warm hero treatment; the rest are calm
// rows. One prescription per problem the debrief surfaced, so every "Achtung"
// has an answer.

const TONE_COLOR: Record<string, string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink-2)',
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl px-3 py-2 min-w-0"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}
    >
      <span className="num-mono shrink-0 mt-0.5" style={{ fontSize: 8.5, letterSpacing: '0.14em', color, fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{value}</span>
    </div>
  )
}

export default function DebriefPlan({ plan }: { plan: Prescription[] }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!plan || plan.length === 0) return null
  const [hero, ...rest] = plan

  const raceLabel = de ? 'NÄCHSTES RENNEN' : 'NEXT RACE'
  const trainLabel = 'TRAINING'
  const heroAccent = TONE_COLOR[hero.tone] ?? 'var(--color-amber)'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <div className="flex flex-col gap-1">
          <span className="num-mono" style={{ color: 'var(--color-amber)', fontSize: 10, letterSpacing: '0.24em' }}>
            {de ? 'JETZT DAS' : 'DO THIS NEXT'}
          </span>
          <h2 style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1 }}>
            {de ? 'Dein Plan' : 'Your plan'}
          </h2>
        </div>
        <div className="flex-1 self-center" style={{ height: 1, background: 'var(--color-rule)' }} />
      </div>

      {/* Hero action — warm gradient, the single most important thing */}
      <div
        className="rounded-2xl p-6 sm:p-7 flex flex-col gap-4"
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-amber) 16%, var(--color-paper-2)), var(--color-paper-2) 65%)',
          border: '1px solid color-mix(in srgb, var(--color-amber) 30%, var(--color-rule))',
          boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 18px 40px -24px rgba(0,0,0,0.85)',
        }}
      >
        <div className="flex items-start gap-3">
          <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 26, height: 26, marginTop: 2, background: 'color-mix(in srgb, var(--color-amber) 22%, transparent)', color: 'var(--color-amber)', fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600 }}>1</span>
          <h3 style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)', fontSize: 'clamp(19px, 2.2vw, 23px)', fontWeight: 500, lineHeight: 1.2 }}>
            {hero.headline}
          </h3>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Chip label={raceLabel} value={hero.race_tactic} color={heroAccent} />
          <Chip label={trainLabel} value={hero.training_fix} color="var(--color-ink-2)" />
        </div>
      </div>

      {/* Remaining actions — calm rows */}
      {rest.length > 0 && (
        <div className="flex flex-col gap-3">
          {rest.map((p, i) => {
            const accent = TONE_COLOR[p.tone] ?? 'var(--color-ink-2)'
            return (
              <div
                key={p.priority ?? i}
                className="rounded-2xl p-5 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="shrink-0 flex items-center justify-center rounded-full num-mono" style={{ width: 22, height: 22, background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent, fontSize: 11, fontWeight: 700 }}>{i + 2}</span>
                  <span style={{ color: 'var(--color-ink)', fontSize: 15, fontWeight: 600 }}>{p.headline}</span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Chip label={raceLabel} value={p.race_tactic} color={accent} />
                  <Chip label={trainLabel} value={p.training_fix} color="var(--color-ink-2)" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
