/**
 * LevelStripCard — the V2 Home "Level Strip" (.pen i5D9C), grounded honestly:
 * levels are earned from REAL mechanical work (kJ over the last 90 days,
 * 5,000 kJ per level) — competence feedback, not loot XP. The flame is the
 * forgiving P0.2 streak (pauses, never shames).
 */
import { useQuery } from '@tanstack/react-query'
import { Flame, Pause } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useStreak } from '../../hooks/useStreak'
import { useLocale } from '../../contexts/LocaleContext'

const KJ_PER_LEVEL = 5000

export default function LevelStripCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data: streak } = useStreak()
  const { data: profile } = useQuery<{ total_kj: number | null; available?: boolean }>({
    queryKey: ['analytics', 'power-profile'],
    queryFn: async () => (await apiClient.get('/analytics/power-profile')).data,
    staleTime: 30 * 60 * 1000,
  })

  const kj = profile?.total_kj ?? null
  if (kj == null || kj <= 0) return null

  const level = Math.floor(kj / KJ_PER_LEVEL) + 1
  const intoLevel = kj - (level - 1) * KJ_PER_LEVEL
  const pct = Math.min(100, Math.round((intoLevel / KJ_PER_LEVEL) * 100))
  const toNext = Math.max(0, Math.round(KJ_PER_LEVEL - intoLevel))

  const R = 26, C = 2 * Math.PI * R
  const streakDays = streak?.streak ?? 0
  const paused = streak?.paused ?? false

  return (
    <div className="flex items-center gap-4 rounded-[24px] p-4.5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', padding: 18 }}>
      {/* Level ring (amber→lime gradient arc per .pen) */}
      <div className="relative shrink-0" style={{ width: 62, height: 62 }}>
        <svg viewBox="0 0 62 62" style={{ width: 62, height: 62, transform: 'rotate(-90deg)' }}>
          <circle cx="31" cy="31" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="5" />
          <circle cx="31" cy="31" r={R} fill="none" stroke="url(#lvlGrad)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * C} ${C}`} />
          <defs>
            <linearGradient id="lvlGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-amber)" />
              <stop offset="100%" stopColor="var(--color-gold)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center" style={{ lineHeight: 1 }}>
            <span className="eyebrow" style={{ fontSize: 8, color: 'var(--color-muted)' }}>LVL</span>
            <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{level}</span>
          </div>
        </div>
      </div>

      {/* Mid: label + progress + honest unit */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>
            {de ? 'Arbeit im Sattel' : 'Work in the saddle'}
          </span>
          <span className="num-mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-gold)' }}>
            {Math.round(kj).toLocaleString(de ? 'de' : 'en')} kJ
          </span>
        </div>
        <div className="rounded-full overflow-hidden" style={{ height: 10, background: 'var(--color-surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-amber), var(--color-gold))' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>
          {de
            ? `${toNext.toLocaleString('de')} kJ bis Level ${level + 1} · echte Arbeit, kein XP`
            : `${toNext.toLocaleString('en')} kJ to level ${level + 1} · real work, not XP`}
        </span>
      </div>

      {/* Streak box — the forgiving streak */}
      <div className="flex flex-col items-center justify-center rounded-[16px] shrink-0" style={{ background: 'var(--color-surface-2)', padding: '10px 14px', gap: 2 }}>
        {paused
          ? <Pause size={20} style={{ color: 'var(--color-muted)' }} />
          : <Flame size={20} style={{ color: 'var(--color-amber)' }} />}
        <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{streakDays}</span>
        <span className="eyebrow" style={{ fontSize: 9, color: 'var(--color-muted)' }}>{de ? 'TAGE' : 'DAYS'}</span>
      </div>
    </div>
  )
}
