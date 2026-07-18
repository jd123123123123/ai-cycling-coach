/**
 * WeeklyRecapStory — the Monday-morning story (roadmap P1.3).
 *
 * Full-screen swipeable panels over last week's REAL numbers: cover → the
 * work → best moment (breakthrough or biggest ride) → fitness moved →
 * what's next. Self-referential only (you vs. your own history — never a
 * leaderboard). Tap right/left to navigate; a final "save card" renders a
 * shareable PNG on a canvas — the outward-facing artifact that markets the
 * app while crews are still small.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { X, TrendingUp, TrendingDown, Trophy, Bike, Flame, ChevronRight, Download, Pause } from 'lucide-react'
import { apiClient } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'

interface Recap {
  week_start: string
  week_end: string
  totals: { sessions: number; hours: number; km: number; tss: number; active_days: number }
  prev_totals: { sessions: number; hours: number; km: number; tss: number; active_days: number }
  planned_tss: number | null
  ctl_delta: number | null
  breakthroughs: { headline: string; detail: string }[]
  best_ride: { activity_id: number; title: string; date: string | null; tss: number; km: number; hours: number } | null
  streak: { days: number; paused: boolean }
}

const BG = '#0A0C0F'

export default function WeeklyRecapStory() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [idx, setIdx] = useState(0)
  const { data } = useQuery<Recap>({
    queryKey: ['analytics', 'weekly-recap', locale],
    queryFn: async () => (await apiClient.get<Recap>(`/analytics/weekly-recap?locale=${locale}`)).data,
    staleTime: 60 * 60 * 1000,
  })

  const panels = useMemo(() => {
    if (!data) return []
    const t = data.totals
    const p = data.prev_totals
    const list: string[] = ['cover', 'work']
    if (data.breakthroughs.length > 0 || data.best_ride) list.push('moment')
    if (data.ctl_delta != null || data.planned_tss != null) list.push('fitness')
    list.push('next')
    void t; void p
    return list
  }, [data])

  if (!data || data.totals.sessions === 0) {
    return (
      <div className="min-h-screen grid place-items-center p-8" style={{ background: BG }}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span style={{ fontSize: 15, color: 'var(--color-ink-2)' }}>
            {de ? 'Letzte Woche war ruhig — die Story kommt, sobald Fahrten da sind.' : 'Last week was quiet — the story appears once there are rides.'}
          </span>
          <button type="button" onClick={() => navigate('/dashboard?tab=today')} style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: 14 }}>
            {de ? 'Zurück zu Heute' : 'Back to Today'}
          </button>
        </div>
      </div>
    )
  }

  const t = data.totals
  const p = data.prev_totals
  const range = `${format(parseISO(data.week_start), 'MMM d')} – ${format(parseISO(data.week_end), 'MMM d')}`
  const kind = panels[idx]
  const tssDelta = p.tss > 0 ? Math.round(((t.tss - p.tss) / p.tss) * 100) : null
  const compliance = data.planned_tss && data.planned_tss > 0 ? Math.round((t.tss / data.planned_tss) * 100) : null

  const advance = (dir: 1 | -1) => {
    const n = idx + dir
    if (n < 0) return
    if (n >= panels.length) { navigate('/dashboard?tab=today'); return }
    setIdx(n)
  }

  const saveCard = async () => {
    const c = document.createElement('canvas')
    c.width = 1080; c.height = 1350
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = BG; ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#FF5A2C'
    ctx.font = '700 44px Sora, sans-serif'
    ctx.fillText((de ? 'MEINE WOCHE' : 'MY WEEK') + ` · ${range.toUpperCase()}`, 80, 140)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '800 170px Sora, sans-serif'
    ctx.fillText(`${Math.round(t.km)} km`, 80, 360)
    ctx.font = '600 54px Sora, sans-serif'
    ctx.fillStyle = '#9AA3AF'
    const lines = [
      `${t.sessions} ${de ? 'Einheiten' : 'sessions'} · ${t.hours} h`,
      `${t.tss} TSS${tssDelta != null ? ` (${tssDelta >= 0 ? '+' : ''}${tssDelta}% ${de ? 'ggü. Vorwoche' : 'vs last week'})` : ''}`,
      data.ctl_delta != null ? `${de ? 'Fitness' : 'Fitness'} ${data.ctl_delta >= 0 ? '+' : ''}${data.ctl_delta} CTL` : '',
      data.breakthroughs[0]?.headline ?? (data.best_ride ? `${de ? 'Größte Fahrt' : 'Biggest ride'}: ${Math.round(data.best_ride.km)} km` : ''),
    ].filter(Boolean)
    lines.forEach((l, i) => ctx.fillText(l, 80, 500 + i * 90))
    ctx.fillStyle = '#16E08A'
    ctx.font = '700 40px Sora, sans-serif'
    ctx.fillText('AI Cycling Coach', 80, 1270)
    const url = c.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `week-${data.week_start}.png`
    a.click()
  }

  const enter = reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: BG, userSelect: 'none' }}
      onClick={(e) => {
        const x = e.clientX / window.innerWidth
        advance(x < 0.3 ? -1 : 1)
      }}
    >
      {/* progress bars */}
      <div className="flex gap-1.5 px-4 pt-4">
        {panels.map((_, i) => (
          <span key={i} className="flex-1 rounded-full" style={{ height: 3, background: i <= idx ? 'var(--color-accent)' : 'var(--color-surface-2)' }} />
        ))}
      </div>
      <div className="flex justify-end px-4 pt-3">
        <button type="button" aria-label="Close" onClick={(e) => { e.stopPropagation(); navigate('/dashboard?tab=today') }} className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: 'var(--color-surface-2)' }}>
          <X size={18} style={{ color: 'var(--color-ink-2)' }} />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-7 pb-16" style={{ maxWidth: 520, margin: '0 auto', width: '100%' }}>
        {kind === 'cover' && (
          <motion.div key="cover" {...enter} className="flex flex-col gap-3">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: '0.18em', color: 'var(--color-accent)', fontWeight: 700 }}>
              {de ? 'DEINE WOCHE' : 'YOUR WEEK'} · {range}
            </span>
            <span className="num-display" style={{ fontSize: 64, lineHeight: 1.02, color: 'var(--color-ink)' }}>
              {Math.round(t.km)} km
            </span>
            <p style={{ fontSize: 16, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
              {de
                ? `${t.sessions} Einheiten, ${t.hours} Stunden, ${t.tss} TSS. Tippe weiter — das hier hast du gebaut.`
                : `${t.sessions} sessions, ${t.hours} hours, ${t.tss} TSS. Tap through — you built this.`}
            </p>
          </motion.div>
        )}

        {kind === 'work' && (
          <motion.div key="work" {...enter} className="flex flex-col gap-5">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: '0.18em', color: 'var(--color-muted)', fontWeight: 700 }}>{de ? 'DIE ARBEIT' : 'THE WORK'}</span>
            {([
              { l: de ? 'Einheiten' : 'Sessions', v: t.sessions, pv: p.sessions },
              { l: de ? 'Stunden' : 'Hours', v: t.hours, pv: p.hours },
              { l: 'km', v: Math.round(t.km), pv: Math.round(p.km) },
              { l: de ? 'Last · TSS' : 'Load · TSS', v: t.tss, pv: p.tss },
            ]).map((row, i) => {
              const up = row.v >= row.pv
              return (
                <motion.div key={row.l} {...(reduce ? {} : { initial: { opacity: 0, x: -14 }, animate: { opacity: 1, x: 0 }, transition: { delay: 0.08 * i, duration: 0.3 } })} className="flex items-baseline justify-between" style={{ borderBottom: '1px solid var(--color-rule)', paddingBottom: 10 }}>
                  <span style={{ fontSize: 15, color: 'var(--color-ink-2)', fontWeight: 600 }}>{row.l}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="num-display" style={{ fontSize: 30, color: 'var(--color-ink)' }}>{row.v}</span>
                    <span className="inline-flex items-center gap-0.5" style={{ fontSize: 12.5, fontWeight: 600, color: up ? 'var(--color-recovery)' : 'var(--color-muted)' }}>
                      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {row.pv}
                    </span>
                  </span>
                </motion.div>
              )
            })}
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Kleine Zahl = Vorwoche' : 'Small number = the week before'}</span>
          </motion.div>
        )}

        {kind === 'moment' && (
          <motion.div key="moment" {...enter} className="flex flex-col gap-4">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: '0.18em', color: 'var(--color-amber)', fontWeight: 700 }}>
              {de ? 'DER MOMENT' : 'THE MOMENT'}
            </span>
            {data.breakthroughs.length > 0 ? (
              <>
                <span className="grid place-items-center rounded-full" style={{ width: 52, height: 52, background: 'color-mix(in srgb, var(--color-amber) 18%, transparent)' }}>
                  <Trophy size={26} style={{ color: 'var(--color-amber)' }} />
                </span>
                <span className="num-display" style={{ fontSize: 32, lineHeight: 1.15, color: 'var(--color-ink)' }}>{data.breakthroughs[0].headline}</span>
                <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>{data.breakthroughs[0].detail}</p>
              </>
            ) : data.best_ride && (
              <>
                <span className="grid place-items-center rounded-full" style={{ width: 52, height: 52, background: 'color-mix(in srgb, var(--color-strain) 18%, transparent)' }}>
                  <Bike size={26} style={{ color: 'var(--color-strain)' }} />
                </span>
                <span className="num-display" style={{ fontSize: 32, lineHeight: 1.15, color: 'var(--color-ink)' }}>
                  {Math.round(data.best_ride.km)} km · {data.best_ride.hours} h
                </span>
                <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                  {de
                    ? `${data.best_ride.title} — die größte Fahrt der Woche, ${data.best_ride.tss} TSS. Solche Tage bauen den Motor.`
                    : `${data.best_ride.title} — the week's biggest ride, ${data.best_ride.tss} TSS. Days like this build the engine.`}
                </p>
              </>
            )}
          </motion.div>
        )}

        {kind === 'fitness' && (
          <motion.div key="fitness" {...enter} className="flex flex-col gap-4">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: '0.18em', color: 'var(--color-recovery)', fontWeight: 700 }}>
              {de ? 'WAS ES GEBRACHT HAT' : 'WHAT IT BUILT'}
            </span>
            {data.ctl_delta != null && (
              <span className="num-display" style={{ fontSize: 56, lineHeight: 1, color: data.ctl_delta >= 0 ? 'var(--color-recovery)' : 'var(--color-amber)' }}>
                {data.ctl_delta >= 0 ? '+' : ''}{data.ctl_delta} <span style={{ fontSize: 22, color: 'var(--color-ink-2)' }}>{de ? 'Fitness (CTL)' : 'fitness (CTL)'}</span>
              </span>
            )}
            {compliance != null && (
              <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                {de
                  ? `Geplant waren ${data.planned_tss} TSS — du hast ${t.tss} geliefert (${compliance}%). ${compliance >= 110 ? 'Mehr als der Plan — die nächste Woche gleicht das aus.' : compliance >= 85 ? 'Genau im Korridor. So entsteht Form.' : 'Weniger als geplant — völlig okay, der Plan passt sich an.'}`
                  : `The plan asked for ${data.planned_tss} TSS — you delivered ${t.tss} (${compliance}%). ${compliance >= 110 ? 'More than planned — next week rebalances.' : compliance >= 85 ? 'Right in the corridor. This is how form is built.' : 'Less than planned — fine; the plan adapts.'}`}
              </p>
            )}
          </motion.div>
        )}

        {kind === 'next' && (
          <motion.div key="next" {...enter} className="flex flex-col gap-5">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: '0.18em', color: 'var(--color-accent)', fontWeight: 700 }}>
              {de ? 'JETZT DIESE WOCHE' : 'NOW THIS WEEK'}
            </span>
            <div className="flex items-center gap-2.5">
              {data.streak.paused
                ? <Pause size={20} style={{ color: 'var(--color-muted)' }} />
                : <Flame size={20} style={{ color: 'var(--color-amber)' }} />}
              <span style={{ fontSize: 16, color: 'var(--color-ink)', fontWeight: 600 }}>
                {data.streak.paused
                  ? (de ? 'Serie pausiert — sie wartet auf dich.' : 'Streak paused — it’s waiting for you.')
                  : de ? `${data.streak.days} Tage Serie — weiter geht's.` : `${data.streak.days}-day streak — keep rolling.`}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate('/dashboard?tab=today') }}
              className="inline-flex items-center justify-center gap-2 rounded-full py-3.5"
              style={{ background: 'var(--color-accent)', color: '#0A0C0F', fontSize: 15, fontWeight: 700 }}
            >
              {de ? 'Zum heutigen Plan' : "See today's plan"} <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void saveCard() }}
              className="inline-flex items-center justify-center gap-2 rounded-full py-3"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', fontSize: 14, fontWeight: 600 }}
            >
              <Download size={16} /> {de ? 'Wochen-Karte speichern' : 'Save week card'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
