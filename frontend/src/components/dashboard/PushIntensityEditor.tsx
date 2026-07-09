import { useEffect, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { getGoals, updateGoals } from '../../api/athletes'
import { useLocale } from '../../contexts/LocaleContext'
import type { TrainingGoals } from '../../types/athlete'

type Level = NonNullable<TrainingGoals['push_intensity']>

// How hard the coach should push. Persists to goals.push_intensity; the adaptive
// engine reads it as an "ambition" multiplier on the UPSIDE only (escalate/push
// volume + escalation eagerness). The HRV back-off safety gate is never relaxed —
// so picking "All-in" makes green days bigger, it never overrides a fatigue signal.
const LEVELS: {
  v: Level
  en: string
  de: string
  descEn: string
  descDe: string
  vol: string
}[] = [
  { v: 'steady', en: 'Steady', de: 'Sanft', descEn: 'Ease me in — protect recovery, smaller pushes.', descDe: 'Sanfter Aufbau — Erholung schützen, kleinere Pushs.', vol: '×0.85' },
  { v: 'balanced', en: 'Balanced', de: 'Ausgewogen', descEn: 'The evidence-graded default — push when green.', descDe: 'Der wissenschaftliche Standard — pushen wenn grün.', vol: '×1.0' },
  { v: 'aggressive', en: 'Aggressive', de: 'Aggressiv', descEn: 'Chase adaptation — bigger pushes, escalate readily.', descDe: 'Adaptation jagen — größere Pushs, schneller eskalieren.', vol: '×1.12' },
  { v: 'all_in', en: 'All-in', de: 'Volle Attacke', descEn: 'Send it — max overload the safety rails still allow.', descDe: 'Volles Risiko — maximale Last, die die Rails zulassen.', vol: '×1.25' },
]

export default function PushIntensityEditor() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const qc = useQueryClient()
  const { data: goals } = useQuery({ queryKey: ['athlete', 'goals'], queryFn: getGoals })

  const [level, setLevel] = useState<Level>('balanced')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (goals?.push_intensity) setLevel(goals.push_intensity)
  }, [goals?.push_intensity])

  const save = useMutation({
    mutationFn: async (next: Level) => {
      await updateGoals({ push_intensity: next })
    },
    onSuccess: async () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      // Adaptive directive + coach brief read this — refresh them.
      await qc.invalidateQueries({ queryKey: ['coach', 'adaptive'] })
      await qc.invalidateQueries({ queryKey: ['coach', 'brief'] })
      await qc.invalidateQueries({ queryKey: ['athlete', 'goals'] })
    },
  })

  const pick = (v: Level) => {
    setLevel(v)
    save.mutate(v)
  }

  const active = LEVELS.find((l) => l.v === level) ?? LEVELS[1]

  return (
    <section className="rounded-[16px] p-5 sm:p-6" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-amber)', fontSize: 10.5, letterSpacing: '0.2em' }}>
            {de ? 'WIE HART SOLL ICH DICH PUSHEN?' : 'HOW HARD SHOULD I PUSH YOU?'}
          </span>
          <p className="mt-1" style={{ color: 'var(--color-ink-2)', fontSize: 13, maxWidth: '46ch' }}>
            {de
              ? 'Regelt nur die grünen Tage — an denen dein Körper bereit ist. Ermüdungssignale (HRV) übersteuern das immer.'
              : 'Only shapes your green days — when your body is ready. Fatigue signals (HRV) always override it.'}
          </p>
        </div>
        {saved && (
          <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: 'var(--color-forest-2)' }}>
            {de ? '✓ Gespeichert' : '✓ Saved'}
          </span>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {LEVELS.map((l) => {
          const on = l.v === level
          return (
            <button
              key={l.v}
              type="button"
              onClick={() => pick(l.v)}
              className="text-left rounded-[12px] p-3.5 transition-all"
              style={{
                border: `1px solid ${on ? 'var(--color-amber)' : 'var(--color-rule)'}`,
                background: on ? 'color-mix(in srgb, var(--color-amber) 10%, transparent)' : 'var(--color-paper)',
                boxShadow: on ? '0 0 0 3px color-mix(in srgb, var(--color-amber) 14%, transparent)' : 'none',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[14px]" style={{ color: on ? 'var(--color-amber)' : 'var(--color-ink)' }}>
                  {de ? l.de : l.en}
                </span>
                <span className="num-display text-[12px]" style={{ color: on ? 'var(--color-amber)' : 'var(--color-muted)' }}>
                  {l.vol}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--color-ink-2)' }}>
                {de ? l.descDe : l.descEn}
              </p>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-[12px]" style={{ color: 'var(--color-muted)' }}>
        {de
          ? `Aktiv: ${active.de} — grüne Tage skalieren mit ${active.vol} Volumen.`
          : `Active: ${active.en} — green days scale volume by ${active.vol}.`}
      </p>
    </section>
  )
}
