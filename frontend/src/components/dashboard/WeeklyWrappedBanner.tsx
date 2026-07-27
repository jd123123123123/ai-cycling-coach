/**
 * WeeklyWrappedBanner — the once-a-week, high-dopamine announcement that the
 * athlete's Weekly Wrapped is ready. Shown on the Today tab near the top.
 *
 * Rules:
 *   · Available once per ISO week (from Monday), covering the PREVIOUS week.
 *   · Only shown when there's a real Wrapped to show (>= 1 ride in the covered
 *     week — the backend's `has_rides`).
 *   · "Seen/dismissed this week" is tracked client-side in localStorage keyed by
 *     ISO week, so it appears once and never nags.
 *
 * Tapping opens /wrapped; a small X dismisses for the week. The banner animates
 * (gradient sheen + entrance) but freezes for prefers-reduced-motion.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Sparkles, X, ChevronRight } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useLocale } from '../../contexts/LocaleContext'
import type { Wrapped } from '../../pages/WeeklyWrapped'

/** ISO-week key like "2026-W29" — the once-per-week dedupe handle. */
export function isoWeekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const STORAGE_KEY = 'wrapped_seen_week'

export default function WeeklyWrappedBanner() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const week = isoWeekKey()

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === week } catch { return false }
  })

  const { data } = useQuery<Wrapped>({
    queryKey: ['analytics', 'weekly-wrapped', locale],
    queryFn: async () => (await apiClient.get<Wrapped>(`/analytics/weekly-wrapped?locale=${locale}`)).data,
    staleTime: 60 * 60 * 1000,
    enabled: !dismissed,
  })

  if (dismissed || !data?.has_rides) return null

  const markSeen = () => {
    try { localStorage.setItem(STORAGE_KEY, week) } catch { /* private mode */ }
  }
  const open = () => { markSeen(); navigate('/wrapped') }
  const dismiss = () => { markSeen(); setDismissed(true) }

  const km = Math.round(data.totals.km)

  return (
    <motion.button
      type="button"
      onClick={open}
      {...(reduce ? {} : { initial: { opacity: 0, y: -10, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } })}
      className="relative w-full overflow-hidden text-left"
      style={{ borderRadius: 22, padding: '16px 18px', border: '1px solid #FFFFFF24' }}
    >
      {/* Animated gradient background (frozen under reduced-motion). */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'linear-gradient(110deg, #FF5A3C 0%, #B14BFF 48%, #2E6BFF 100%)', backgroundSize: '220% 220%' }}
        {...(reduce ? {} : { animate: { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }, transition: { duration: 9, repeat: Infinity, ease: 'linear' } })}
      />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 90% 10%, rgba(255,255,255,0.28), transparent 55%)' }} aria-hidden />

      <div className="relative flex items-center gap-3">
        <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 40, height: 40, background: '#FFFFFF2E', backdropFilter: 'blur(8px)' }}>
          <Sparkles size={20} style={{ color: '#fff' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
            {de ? 'Deine Woche ist da ✨' : 'Your week is here ✨'}
          </div>
          {/* Two lines, not `truncate`. At 390 px the German string clipped to
              "37 km, 2 Fahrten — dein Week…", cutting the payoff off the app's
              single most celebratory element. The week's numbers are the reward
              here, so they lead and are emphasised; the sentence is allowed to
              wrap rather than lose its ending. */}
          <div style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFFE0', lineHeight: 1.35 }}>
            <strong style={{ fontWeight: 800, color: '#fff' }}>{km} km · {data.rides} {de ? 'Fahrten' : 'rides'}</strong>
            {de ? ' — dein Weekly Wrapped wartet.' : ' — your Weekly Wrapped awaits.'}
          </div>
        </div>
        <ChevronRight size={20} className="shrink-0" style={{ color: '#fff' }} />
        <span
          role="button"
          tabIndex={0}
          aria-label={de ? 'Ausblenden' : 'Dismiss'}
          onClick={(e) => { e.stopPropagation(); dismiss() }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); dismiss() } }}
          className="shrink-0 grid place-items-center rounded-full"
          style={{ width: 26, height: 26, background: '#00000026' }}
        >
          <X size={14} style={{ color: '#fff' }} />
        </span>
      </div>
    </motion.button>
  )
}
