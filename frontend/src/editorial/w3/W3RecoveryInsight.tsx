import { motion, useReducedMotion } from 'motion/react'
import { Activity, TrendingUp, TrendingDown, Minus, ShieldCheck } from 'lucide-react'
import { useAdaptive } from '../../hooks/useAdaptive'
import type { Tone, DirectiveKind } from '../../api/adaptive'
import { T, EASE, band } from './w3tokens'

/**
 * W3 · Recovery insight — the live app's readiness engine, in W3 dress.
 *
 * Real data: GET /coach/adaptive (services/adaptive_readiness + readiness_score).
 * It reads the athlete's morning HRV vs a 28-day baseline, TSB, sleep and
 * durability, and returns a push-vs-gentle DIRECTIVE plus per-signal evidence
 * (each `signal.tone`: good = a green light to push, warn/bad = ease off). This
 * card mirrors the live "Erholung" surface: a verdict, a readiness score, and
 * the signals split by whether they say push or be gentle. Honest by
 * construction — when the athlete has no fresh HRV/wearable data the directive
 * degrades to a TSB-based read and the card says so, never faking a green light.
 *
 * Self-contained (fetches its own data) so it drops into Today without threading
 * six fields through the vm; in a fixture preview with no backend it shows an
 * honest "connect a wearable" resting state instead of inventing signals.
 */

// Directive → the push/gentle stance it represents.
const DIRECTIVE_META: Record<DirectiveKind, { verb: string; push: boolean; color: string }> = {
  escalate: { verb: 'Escalate', push: true, color: T.acid },
  push: { verb: 'Push', push: true, color: T.training },
  hold: { verb: 'Hold', push: false, color: T.warn },
  deload: { verb: 'Deload', push: false, color: T.warn },
  rest: { verb: 'Rest', push: false, color: T.bad },
}

const TONE_COLOR: Record<Tone, string> = {
  good: T.training, warn: T.warn, bad: T.bad, neutral: T.mid,
}
const ToneIcon = ({ tone }: { tone: Tone }) =>
  tone === 'good' ? <TrendingUp size={13} color={TONE_COLOR.good} />
    : tone === 'neutral' ? <Minus size={13} color={TONE_COLOR.neutral} />
      : <TrendingDown size={13} color={TONE_COLOR[tone]} />

export default function W3RecoveryInsight() {
  const reduce = useReducedMotion()
  const { data, isLoading } = useAdaptive()

  // Honest resting state: no directive yet (loading, or no wearable/coach data).
  if (isLoading || !data) {
    return (
      <div style={{ ...band(26), gap: 12 }}>
        <SectionHead />
        <div style={{ padding: 20, borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.mid }}>
            {isLoading ? 'Reading your recovery…' : 'No recovery signal yet'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: T.quiet }}>
            {isLoading ? 'Checking HRV, sleep and load.' : 'Connect a wearable and log a morning HRV to see whether your body is primed to push or asking for a gentler day.'}
          </span>
        </div>
      </div>
    )
  }

  const meta = DIRECTIVE_META[data.directive] ?? DIRECTIVE_META.hold
  const score = data.daily_decision?.readiness?.score ?? null
  const good = data.signals.filter((s) => s.tone === 'good')
  const caution = data.signals.filter((s) => s.tone === 'warn' || s.tone === 'bad')
  const context = data.signals.filter((s) => s.tone === 'neutral')
  const ordered = [...good, ...caution, ...context]

  return (
    <div style={{ ...band(26), gap: 12 }}>
      <SectionHead />
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        style={{ padding: 20, borderRadius: 24, background: T.surface, display: 'flex', flexDirection: 'column', gap: 18, border: `1px solid ${meta.color}33` }}>

        {/* Verdict row: score ring + directive stance */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {score != null && <ScoreRing score={score} color={meta.color} reduce={reduce} />}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 11px', borderRadius: 100, background: `${meta.color}22`, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: meta.color }}>
                {meta.push ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{meta.verb.toUpperCase()}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>CEILING · {data.intensity_ceiling.toUpperCase()}</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.3, color: T.ink }}>{data.headline}</span>
          </div>
        </div>

        {/* Signal split: what says push (good) vs be gentle (warn/bad) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16, borderTop: `1px solid ${T.rule}` }}>
          {ordered.map((s, i) => (
            <motion.div key={i} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i, ease: EASE }}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ marginTop: 2, flex: 'none' }}><ToneIcon tone={s.tone} /></span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: s.tone === 'neutral' ? T.mid : T.ink }}>{s.text}</span>
              {s.evidence === 'RCT' && <span style={{ flex: 'none', marginTop: 1, display: 'flex', gap: 3, alignItems: 'center', fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: T.quiet }}><ShieldCheck size={10} />STUDY</span>}
              {s.evidence === 'guardrail' && <span style={{ flex: 'none', marginTop: 1, fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: T.warn }}>GUARDRAIL</span>}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function SectionHead() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <Activity size={15} color={T.acid} />
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>Recovery</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>· push or be gentle</span>
    </div>
  )
}

/** Readiness score ring (0–100), colored by the directive's stance. */
function ScoreRing({ score, color, reduce }: { score: number; color: string; reduce: boolean | null }) {
  const R = 26, C = 2 * Math.PI * R
  const frac = Math.max(0, Math.min(1, score / 100))
  return (
    <div style={{ position: 'relative', width: 64, height: 64, flex: 'none' }}>
      <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={32} cy={32} r={R} fill="none" stroke={T.rule} strokeWidth={6} />
        <motion.circle cx={32} cy={32} r={R} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={C} initial={reduce ? false : { strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - frac) }} transition={{ duration: 0.9, ease: EASE }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -1, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{Math.round(score)}</span>
      </div>
    </div>
  )
}
