/**
 * BreakthroughCelebration — physiology-grounded celebration (roadmap P1.2).
 *
 * Renders only when the detector found a real breakthrough in the last 48h
 * (power-curve PB ≥60s / eFTP shift, conservative server-side gates). Fires
 * confetti exactly once per breakthrough (persisted guard, mirroring the
 * crew-challenge pattern) — celebration is earned, never nagging.
 */
import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Trophy, ChevronRight } from 'lucide-react'
import { apiClient } from '../../api/client'
import { celebrate } from '../../lib/confetti'
import { useLocale } from '../../contexts/LocaleContext'

interface Breakthrough {
  kind: 'power_pb' | 'eftp_shift'
  activity_id: number
  date: string
  duration_s?: number
  value_w: number
  prior_best_w: number
  gain_pct: number
  headline: string
  detail: string
}

const CELEBRATED_KEY = 'today:celebratedBreakthroughs'
const readCelebrated = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
const writeCelebrated = (ids: string[]) => {
  try { localStorage.setItem(CELEBRATED_KEY, JSON.stringify(ids.slice(-50))) } catch { /* ignore */ }
}
const bKey = (b: Breakthrough) => `${b.activity_id}:${b.kind}:${b.duration_s ?? 0}`

export default function BreakthroughCelebration() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useQuery<Breakthrough[]>({
    queryKey: ['analytics', 'breakthroughs', locale],
    queryFn: async () => (await apiClient.get<Breakthrough[]>(`/analytics/breakthroughs?days=2&locale=${locale}`)).data,
    staleTime: 30 * 60 * 1000,
  })

  const breakthroughs = useMemo(() => data ?? [], [data])

  // One confetti burst per new breakthrough, ever.
  useEffect(() => {
    if (breakthroughs.length === 0) return
    const seen = readCelebrated()
    const fresh = breakthroughs.filter((b) => !seen.includes(bKey(b)))
    if (fresh.length > 0) {
      celebrate()
      writeCelebrated([...seen, ...fresh.map(bKey)])
    }
  }, [breakthroughs])

  if (breakthroughs.length === 0) return null
  const top = breakthroughs[0]
  const rest = breakthroughs.slice(1, 3)

  return (
    <Link
      to={`/activities/${top.activity_id}/ride`}
      className="rounded-[24px] p-5 hover-card flex flex-col gap-3"
      style={{
        background: 'color-mix(in srgb, var(--color-amber) 10%, var(--color-paper-2))',
        border: '1px solid var(--color-amber)',
        boxShadow: '0 8px 26px -8px color-mix(in srgb, var(--color-amber) 45%, transparent)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center rounded-full" style={{ width: 34, height: 34, background: 'color-mix(in srgb, var(--color-amber) 20%, transparent)' }}>
            <Trophy size={17} style={{ color: 'var(--color-amber)' }} />
          </span>
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-amber)' }}>
            {de ? 'DURCHBRUCH' : 'BREAKTHROUGH'}
          </span>
        </div>
        <ChevronRight size={16} className="hover-arrow" style={{ color: 'var(--color-amber)' }} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{top.headline}</span>
        <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{top.detail}</p>
      </div>
      {rest.length > 0 && (
        <div className="flex flex-col gap-1" style={{ borderTop: '1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)', paddingTop: 8 }}>
          {rest.map((b, i) => (
            <span key={i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>+ {b.headline}</span>
          ))}
        </div>
      )}
    </Link>
  )
}
