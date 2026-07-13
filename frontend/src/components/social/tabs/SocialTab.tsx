import { useEffect, useMemo, useState } from 'react'
import {
  subDays,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  differenceInSeconds,
  parseISO,
} from 'date-fns'
import {
  Trophy,
  Timer,
  Medal,
  UserPlus,
  Link2,
  CheckCircle2,
  Flame,
  TrendingUp,
  Zap,
  Lock,
  Clock,
  Bike,
  Crown,
} from 'lucide-react'
import PillarSection from '../../dashboard/PillarSection'
import PowerArena from '../PowerArena'
import MemberFinder from '../MemberFinder'
import DuelArena from '../DuelArena'
import Confetti from '../../ui/Confetti'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import { useCountUp } from '../../../hooks/useCountUp'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { usePowerProfile } from '../../../hooks/usePowerProfile'
import { usePMC } from '../../../hooks/usePMC'
import { useAdaptiveGate } from '../../../hooks/useAdaptiveGate'
import { useCrew, useCreateCrew, useMyCrew, useDuel } from '../../../hooks/useCrew'
import type { CrewMember } from '../../../hooks/useCrew'
import { useT, useLocale } from '../../../contexts/LocaleContext'
import type { Locale } from '../../../i18n/strings'
import type { ActivityRead } from '../../../api/dashboard'

// SocialTab — the fourth surface. Four MECE pillars, each a distinct dopamine
// beat, all running honestly on one athlete's real data (solo "vs. past self"
// is the default; no fabricated rivals). A coach-safety banner outranks every
// competitive nudge. Rebuilt to be genuinely addictive: an Apple-style closing
// ring, reactive/funny personality copy, and real "cool facts" from ride data.

// ── Ring math — identical to the shipped Squad Cup ──
const DAILY_TARGET_DEFAULT = 70
const DAILY_CAP = 1.5
const PERFECT_WEEK = 700 // 100 pts/day × 7 — the "close every ring" mark

function dailyTargetFrom(profile: { weekly_hours_available?: number | null } | undefined): number {
  const weeklyHours = profile?.weekly_hours_available ?? null
  if (weeklyHours == null || weeklyHours <= 0) return DAILY_TARGET_DEFAULT
  return Math.max(30, Math.round((weeklyHours * 70) / 7))
}

interface WeekScore {
  dailyPct: number[]
  weeklyScore: number
  weeklyTSS: number
  bestRide: number
}

function computeWeek(activities: ActivityRead[], start: Date, end: Date, dailyTarget: number): WeekScore {
  const dailyTSS = Array.from({ length: 7 }, () => 0)
  let bestRide = 0
  for (const a of activities) {
    const d = new Date(a.started_at)
    if (!isWithinInterval(d, { start, end })) continue
    const dow = (d.getDay() + 6) % 7
    const tss = a.tss ?? 0
    dailyTSS[dow] += tss
    if (tss > bestRide) bestRide = tss
  }
  const dailyPct = dailyTSS.map((tss) => Math.min(DAILY_CAP, tss / dailyTarget))
  const weeklyScore = dailyPct.reduce((s, p) => s + p * 100, 0)
  const weeklyTSS = dailyTSS.reduce((s, t) => s + t, 0)
  return { dailyPct, weeklyScore, weeklyTSS, bestRide }
}

// ── Cool-facts: real, celebratory numbers from the week's rides ──
interface Insights {
  kj: number
  km: number
  hours: number
  rides: number
  bestKm: number
  bestTss: number
}

function computeInsights(activities: ActivityRead[], start: Date, end: Date): Insights {
  let kj = 0, meters = 0, secs = 0, rides = 0, bestKm = 0, bestTss = 0
  for (const a of activities) {
    const d = new Date(a.started_at)
    if (!isWithinInterval(d, { start, end })) continue
    rides++
    const dur = a.duration_seconds ?? 0
    secs += dur
    const dist = a.distance_meters ?? 0
    meters += dist
    // kJ ≈ average power × time; NP is a fair proxy for a fun stat.
    if (a.normalized_power && dur) kj += (a.normalized_power * dur) / 1000
    const km = dist / 1000
    if (km > bestKm) bestKm = km
    if ((a.tss ?? 0) > bestTss) bestTss = a.tss ?? 0
  }
  return { kj: Math.round(kj), km: meters / 1000, hours: secs / 3600, rides, bestKm, bestTss }
}

// ── Small shared UI (mirrors CrewTab) ──
function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) {
    return (
      <span className="num-mono shrink-0" style={{ color: 'var(--color-muted)', fontSize: 11, minWidth: 22, textAlign: 'center' }}>
        {rank}
      </span>
    )
  }
  const colors = ['#FFD60A', '#C7C7CC', '#BF6E2A']
  const color = colors[rank - 1]
  return <Medal size={16} strokeWidth={2.2} style={{ color, filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 50%, transparent))` }} />
}

function WeekBars({ dailyPct, isYou }: { dailyPct: number[]; isYou: boolean }) {
  const { locale } = useLocale()
  const days = locale === 'de' ? ['M', 'D', 'M', 'D', 'F', 'S', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const max = Math.max(1, ...dailyPct, DAILY_CAP)
  return (
    <div className="flex items-end gap-[3px] h-5" aria-hidden>
      {dailyPct.map((p, i) => {
        const h = Math.min(100, (p / max) * 100)
        const good = p >= 1
        const partial = p > 0 && p < 1
        const color = good ? (isYou ? 'var(--color-forest-2)' : '#30D158') : partial ? 'var(--color-amber)' : 'var(--color-rule)'
        return (
          <span key={i} title={days[i]} style={{ width: 5, height: `${Math.max(8, h)}%`, backgroundColor: color, borderRadius: 2, opacity: p === 0 ? 0.35 : 1, transition: 'height 500ms cubic-bezier(.22,1,.36,1)' }} />
        )
      })}
    </div>
  )
}

function Countdown({ weekEnd, locale }: { weekEnd: Date; locale: Locale }) {
  const secs = Math.max(0, differenceInSeconds(weekEnd, new Date()))
  const days = Math.floor(secs / 86_400)
  const hrs = Math.floor((secs % 86_400) / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  const parts = days > 0 ? `${days}d ${hrs}h` : hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
  return (
    <span className="inline-flex items-center gap-1.5 num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.14em' }}>
      <Timer size={10} strokeWidth={2} />
      {parts} {locale === 'de' ? 'ÜBRIG' : 'LEFT'}
    </span>
  )
}

interface Standing {
  id: string
  handle: string
  isYou: boolean
  weeklyScore: number
  weeklyTSS: number
  dailyPct: number[]
  status: 'live' | 'pending'
}

function StandingRow({ standing, rank, locale }: { standing: Standing; rank: number; locale: Locale }) {
  const s = useCountUp(Math.round(standing.weeklyScore), { durationMs: 800 })
  const first = rank === 1
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-[14px]"
      style={{
        backgroundColor: standing.isYou ? 'color-mix(in srgb, var(--color-forest-2) 10%, var(--color-paper-2))' : 'var(--color-paper-2)',
        border: standing.isYou ? '1px solid color-mix(in srgb, var(--color-forest-2) 35%, var(--color-rule))' : first ? '1px solid rgba(255, 214, 10, 0.35)' : '1px solid var(--color-rule)',
        boxShadow: first ? '0 0 16px rgba(255, 214, 10, 0.08) inset' : undefined,
      }}
    >
      <RankBadge rank={rank} />
      <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}>
        <span className="num-mono text-[12px] font-semibold" style={{ color: standing.isYou ? 'var(--color-forest-2)' : 'var(--color-muted)' }}>
          {standing.isYou ? (locale === 'de' ? 'DU' : 'YOU') : standing.handle.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-[14px] font-medium truncate" style={{ color: 'var(--color-ink)' }}>
            {standing.isYou ? (locale === 'de' ? 'Du' : 'You') : standing.handle}
          </p>
          {standing.status === 'pending' && (
            <span className="eyebrow shrink-0" style={{ fontSize: 9, color: 'var(--color-amber)', letterSpacing: '0.18em' }}>
              {locale === 'de' ? 'AUSSTEHEND' : 'PENDING'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {standing.status === 'pending' ? (
            <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
              {locale === 'de' ? 'zählt, sobald sie beitreten' : 'counts once they join'}
            </span>
          ) : (
            <>
              <WeekBars dailyPct={standing.dailyPct} isYou={standing.isYou} />
              <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{Math.round(standing.weeklyTSS)} TSS</span>
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-baseline gap-1 justify-end">
          <span className="num-display leading-none" style={{ fontSize: 20, color: standing.isYou ? 'var(--color-forest-2)' : 'var(--color-ink)' }}>
            {standing.status === 'pending' ? '—' : s}
          </span>
          {standing.status !== 'pending' && (
            <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.12em' }}>PTS</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Invite helpers ──
function copyInviteLink(): Promise<boolean> {
  const url = `${window.location.origin}/invite?ref=squad`
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(url).then(() => true).catch(() => false)
  return Promise.resolve(false)
}
function shareInvite(weeklyScore: number, locale: Locale): Promise<boolean> {
  const url = `${window.location.origin}/invite?ref=squad`
  const text = locale === 'de'
    ? `Tritt meiner Crew bei — ich stehe diese Woche bei ${Math.round(weeklyScore)} Punkten. Hol mich ein, wenn du kannst.`
    : `Join my cycling squad — I'm at ${Math.round(weeklyScore)} pts this week. Catch me if you can.`
  const title = locale === 'de' ? 'Tritt meiner Crew bei' : 'Join my squad'
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
  if (nav.share) return nav.share({ title, text, url }).then(() => true).catch(() => false)
  return copyInviteLink()
}

// ── Reactive personality copy — funny, warm, never mean, coach-safe ──
interface Vibe { emoji: string; title: string; sub: string }
function weekVibe(o: {
  de: boolean; mode: 'go' | 'ease' | 'rest'; lead: number; gap: number; streak: number; thisScore: number; dailyTarget: number
}): Vibe {
  const { de, mode, lead, gap, streak, thisScore, dailyTarget } = o
  if (mode === 'rest')
    return {
      emoji: '⏸️',
      title: de ? 'Ring pausiert.' : 'Ring paused.',
      sub: de ? 'Deine Punkte sind bereit, sobald du fährst.' : 'Your points are ready the moment you ride.',
    }
  if (lead > 0)
    return {
      emoji: '👻💨',
      title: de ? 'Dein Geister-Ich ist abgehängt.' : 'You dropped your ghost.',
      sub: de ? `${lead} Punkte Vorsprung auf letzte Woche. Bis Sonntag draufbleiben.` : `${lead} points clear of last week. Keep the hammer down till Sunday.`,
    }
  if (streak >= 3)
    return {
      emoji: '🔥',
      title: de ? `${streak} Tage am Stück. Du brennst.` : `${streak} days straight. You're on fire.`,
      sub: de ? 'Nicht du wirst der Grund sein, dass die Serie stirbt.' : "Don't be the reason the streak dies.",
    }
  if (gap > 0 && gap <= 120)
    return {
      emoji: '☕',
      title: de ? `Nur ${gap} Punkte hinten.` : `Only ${gap} points back.`,
      sub: de ? `Ein Espresso und eine ${Math.ceil((gap / 100) * dailyTarget)}-TSS-Einheit — dann führst du.` : `One espresso and a ${Math.ceil((gap / 100) * dailyTarget)}-TSS session — then you lead.`,
    }
  if (thisScore === 0)
    return {
      emoji: '🌱',
      title: de ? 'Noch ein leeres Blatt.' : 'A blank week, so far.',
      sub: de ? 'Die erste Einheit schreibt die Schlagzeile.' : 'Your first session writes the headline.',
    }
  return {
    emoji: '🚀',
    title: de ? 'Die Woche rollt.' : 'The week is rolling.',
    sub: de ? 'Jeder Tag am Ziel bringt 100 Punkte. Maximum 150%.' : 'Every day at target banks 100 points. Cap is 150%.',
  }
}

// ── Ring hero — the addictive centrepiece (Apple closing-ring) ──
// NEVER a giant empty ring for a 0 value: when the week is blank we render a
// slim bar instead, per the shared type scale.
function RingHero({ animated, pct, target, beat, empty, locale }: { animated: number; pct: number; target: number; beat: boolean; empty: boolean; locale: Locale }) {
  const color = beat ? '#FFD60A' : 'var(--color-forest-2)'
  const de = locale === 'de'

  if (empty) {
    return (
      <div className="shrink-0 w-full sm:w-[172px] flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="num-display leading-none" style={{ fontSize: 'clamp(26px, 7vw, 34px)', color: 'var(--color-ink)' }}>0</span>
          <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-muted)', letterSpacing: '0.16em' }}>{de ? 'PUNKTE' : 'POINTS'}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-rule)' }} aria-hidden>
          <div style={{ width: '3%', height: '100%', backgroundColor: color, borderRadius: 999 }} />
        </div>
        <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-ink-2)' }}>{de ? `Ziel ${Math.round(target)}` : `Goal ${Math.round(target)}`}</span>
      </div>
    )
  }

  const size = 168, sw = 15, R = (size - sw) / 2, C = 2 * Math.PI * R
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--color-rule)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, pct))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)', filter: `drop-shadow(0 0 10px color-mix(in srgb, ${color} 55%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num-display leading-none" style={{ fontSize: 'clamp(26px, 7vw, 34px)', color, fontVariationSettings: '"opsz" 144, "wght" 560' }}>{animated}</span>
        <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.16em', marginTop: 3 }}>{de ? 'PUNKTE' : 'POINTS'}</span>
        <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-ink-2)', marginTop: 4 }}>{de ? `Ziel ${Math.round(target)}` : `Goal ${Math.round(target)}`}</span>
      </div>
    </div>
  )
}

// ── Cool-fact card — one striking number + a funny, true one-liner ──
function CoolFactCard({ icon: Icon, value, unit, label, quip, accent }: {
  icon: typeof Zap; value: string; unit: string; label: string; quip: string; accent?: string
}) {
  const color = accent ?? 'var(--color-forest-2)'
  return (
    <div className="rounded-[18px] p-4 sm:p-5 flex flex-col gap-2" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 30, height: 30, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          <Icon size={16} strokeWidth={2} style={{ color }} />
        </span>
        <span className="eyebrow num-mono" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="num-display leading-none" style={{ fontSize: 'clamp(26px, 7vw, 34px)', color: 'var(--color-ink)' }}>{value}</span>
        <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>{unit}</span>
      </div>
      <p className="text-[13px] leading-snug" style={{ color: 'var(--color-ink-2)' }}>{quip}</p>
    </div>
  )
}

// ── The tab ──
export default function SocialTab() {
  const t = useT()
  const { locale } = useLocale()
  const de = locale === 'de'
  const gate = useAdaptiveGate()

  // Sub-nav — Social stacked 5+ systems into one ~9,000px scroll. Splitting the
  // pillars into three groups caps visible height to one group at a time.
  type Group = 'wettkampf' | 'crew' | 'erfolge'
  const [group, setGroup] = useState<Group>('wettkampf')
  const groupTabs = [
    { id: 'wettkampf' as const, label: de ? 'Wettkampf' : 'Compete' },
    { id: 'crew' as const, label: 'Crew' },
    { id: 'erfolge' as const, label: de ? 'Erfolge' : 'Achievements' },
  ]

  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const lastWeekStart = subDays(weekStart, 7)
  const lastWeekEnd = subDays(weekEnd, 7)

  const { data: actsData } = useActivitiesRange(lastWeekStart, today)
  const { data: profile } = useAthleteProfile()
  const { data: power } = usePowerProfile()
  const { data: pmc } = usePMC(90)

  const { crew, invite, remove } = useCrew()
  const { data: myCrewData } = useMyCrew()
  const { data: duel } = useDuel()
  const createCrew = useCreateCrew()
  const hasCrew = !!myCrewData?.crew
  const crewId = myCrewData?.crew?.id ?? null

  const dailyTarget = dailyTargetFrom(profile)
  const activities = useMemo(() => actsData?.activities ?? [], [actsData])

  const thisWeek = useMemo(() => computeWeek(activities, weekStart, weekEnd, dailyTarget), [activities, weekStart, weekEnd, dailyTarget])
  const lastWeek = useMemo(() => computeWeek(activities, lastWeekStart, lastWeekEnd, dailyTarget), [activities, lastWeekStart, lastWeekEnd, dailyTarget])
  const insights = useMemo(() => computeInsights(activities, weekStart, weekEnd), [activities, weekStart, weekEnd])

  const thisScore = Math.round(thisWeek.weeklyScore)
  const lastScore = Math.round(lastWeek.weeklyScore)
  const heroCount = useCountUp(thisScore, { durationMs: 1100 })

  const beatLastWeek = lastScore > 0 && thisScore > lastScore
  const gap = lastScore - thisScore
  const lead = thisScore - lastScore
  // The ring fills toward last week's mark (your ghost) or a perfect week.
  const ringTarget = lastScore > 0 ? lastScore : PERFECT_WEEK
  const ringPct = ringTarget > 0 ? thisScore / ringTarget : 0

  const [celebrated, setCelebrated] = useState(false)
  useEffect(() => {
    if (beatLastWeek && !celebrated) setCelebrated(true)
  }, [beatLastWeek, celebrated])

  // ── Progress inputs (fed to the Power League) ──
  const improvement = useMemo(() => {
    const entries = pmc?.entries ?? []
    if (entries.length < 2) return null
    const now = entries[entries.length - 1]
    const targetDate = subDays(parseISO(now.date), 28)
    let past = entries[0]
    for (const e of entries) if (parseISO(e.date) <= targetDate) past = e
    if (!past || past.ctl <= 0) return null
    return { rate: (now.ctl - past.ctl) / past.ctl, ctlNow: now.ctl, ctlThen: past.ctl }
  }, [pmc])

  const consistency = useMemo(() => {
    const entries = pmc?.entries ?? []
    if (entries.length === 0) return { streak: 0, frequency: 0 }
    let streak = 0
    for (let i = entries.length - 1; i >= 0; i--) {
      const tss = entries[i].daily_tss
      const closed = tss >= dailyTarget || tss === 0
      if (closed) streak++
      else break
    }
    const frequency = entries.slice(-28).filter((e) => e.daily_tss > 0).length
    return { streak, frequency }
  }, [pmc, dailyTarget])

  const vibe = weekVibe({ de, mode: gate.mode, lead, gap, streak: consistency.streak, thisScore, dailyTarget })

  // ── Standings ──
  const you: Standing = { id: 'you', handle: 'You', isYou: true, weeklyScore: thisWeek.weeklyScore, weeklyTSS: thisWeek.weeklyTSS, dailyPct: thisWeek.dailyPct, status: 'live' }
  const pastYou: Standing = { id: 'past-you', handle: de ? 'Letzte Woche' : 'Last week', isYou: false, weeklyScore: lastWeek.weeklyScore, weeklyTSS: lastWeek.weeklyTSS, dailyPct: lastWeek.dailyPct, status: 'live' }
  const standings = useMemo<Standing[]>(() => {
    const crewStandings: Standing[] = crew.map((m) => ({ id: m.id, handle: m.handle, isYou: false, weeklyScore: 0, weeklyTSS: 0, dailyPct: Array.from({ length: 7 }, () => 0), status: 'pending' as const }))
    return [you, ...crewStandings].sort((a, b) => b.weeklyScore - a.weeklyScore)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew, thisWeek])
  const yourRank = standings.findIndex((s) => s.isYou) + 1

  // ── Badges ──
  const lastWeekPerfect = lastWeek.dailyPct.length === 7 && lastWeek.dailyPct.every((p) => p >= 1)
  const lastWeekClosedDays = lastWeek.dailyPct.filter((p) => p >= 1).length
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
  const badges = useMemo(() => [
    { key: 'streak_7', icon: Flame, color: '#FF9F0A', label: de ? '7-Tage-Serie' : '7-day streak', earned: consistency.streak >= 7, progress: clamp01(consistency.streak / 7), how: de ? '7 Tage in Folge' : 'Close 7 days running' },
    { key: 'streak_30', icon: Flame, color: '#FF375F', label: de ? '30-Tage-Serie' : '30-day streak', earned: consistency.streak >= 30, progress: clamp01(consistency.streak / 30), how: de ? '30 Tage am Stück' : 'Stay on it 30 days' },
    { key: 'perfect_week', icon: CheckCircle2, color: 'var(--color-forest-2)', label: de ? 'Perfekte Woche' : 'Perfect week', earned: lastWeekPerfect, progress: clamp01(lastWeekClosedDays / 7), how: de ? 'Alle 7 Tage schließen' : 'Close all 7 days' },
    { key: 'most_improved', icon: TrendingUp, color: 'var(--color-ink-blue)', label: de ? 'Größter Sprung' : 'Most improved', earned: (improvement?.rate ?? 0) >= 0.05, progress: clamp01((improvement?.rate ?? 0) / 0.05), how: de ? 'CTL +5% in 28 Tagen' : 'Grow CTL 5% / 28d' },
    { key: 'ring_week_win', icon: Trophy, color: '#FFD60A', label: de ? 'Woche geschlagen' : 'Beat last week', earned: beatLastWeek, progress: lastScore > 0 ? clamp01(thisScore / lastScore) : (thisScore > 0 ? 1 : 0), how: de ? 'Vorwoche übertreffen' : "Top last week's score" },
  ], [consistency.streak, lastWeekPerfect, lastWeekClosedDays, improvement, beatLastWeek, lastScore, thisScore, de])
  const earnedCount = badges.filter((b) => b.earned).length

  // ── Invite state ──
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [crewNameDraft, setCrewNameDraft] = useState('')
  function handleInvite(e: React.FormEvent) { e.preventDefault(); if (draft.trim()) { invite(draft); setDraft('') } }
  async function handleShare() { const ok = await shareInvite(thisWeek.weeklyScore, locale); if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }

  const cardBase = { backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const
  const progressPct = lastScore > 0 ? Math.min(1, thisScore / lastScore) : thisScore > 0 ? 1 : 0

  // ── Cool-fact quips (real numbers, funny & always-true) ──
  const croissants = Math.max(0, Math.round(insights.kj / 1004))
  const episodes = Math.max(0, Math.round(insights.hours / 0.75))
  const marathons = insights.km / 42.195

  return (
    <div className="flex flex-col gap-9 sm:gap-11">
      {/* ── Sub-nav: one group visible at a time (caps scroll height) ── */}
      <div className="flex justify-center sm:justify-start">
        <SegmentedTabs
          tabs={groupTabs}
          value={group}
          onChange={setGroup}
          ariaLabel={de ? 'Social-Bereich' : 'Social section'}
          indicatorId="social-group-indicator"
        />
      </div>

      {/* ══ Wettkampf — ring · duel · cool facts ══════════════════════ */}
      {group === 'wettkampf' && (
      <>
      {/* ── ① Diese Woche — the ring ─────────────────────────────── */}
      <PillarSection
        index="1"
        title={de ? 'Diese Woche' : 'This Week'}
        question={de ? 'Schlage ich mein früheres Ich?' : 'Am I beating my past self?'}
      >
        <div
          className="relative paper-grain rounded-[22px] overflow-hidden"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: beatLastWeek ? '1px solid rgba(255, 214, 10, 0.35)' : '1px solid var(--color-rule)',
            backgroundImage: beatLastWeek
              ? 'radial-gradient(100% 80% at 100% 0%, rgba(255, 214, 10, 0.14), transparent 55%)'
              : 'radial-gradient(80% 60% at 0% 0%, color-mix(in srgb, var(--color-forest-2) 9%, transparent), transparent 55%)',
          }}
        >
          {celebrated && <Confetti />}
          <div className="px-5 py-6 sm:px-8 sm:py-8 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Trophy size={14} strokeWidth={2} style={{ color: beatLastWeek ? '#FFD60A' : 'var(--color-forest-2)' }} />
                <span className="eyebrow" style={{ color: 'var(--color-ink)', letterSpacing: '0.26em', fontSize: 10, fontWeight: 600 }}>
                  {de ? 'RING-WOCHE' : 'RING WEEK'}
                </span>
              </div>
              <Countdown weekEnd={weekEnd} locale={locale} />
            </div>

            {/* Ring + reactive headline — stacks on mobile, row on sm+ */}
            <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-7 sm:text-left">
              <RingHero animated={heroCount} pct={ringPct} target={ringTarget} beat={beatLastWeek} empty={thisScore === 0} locale={locale} />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <span style={{ fontSize: 30, lineHeight: 1 }}>{vibe.emoji}</span>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(20px, 5.4vw, 26px)', fontWeight: 500, lineHeight: 1.12, letterSpacing: '-0.015em', color: 'var(--color-ink)' }}>
                  {vibe.title}
                </h3>
                <p style={{ color: 'var(--color-ink-2)', fontSize: 13.5, lineHeight: 1.5, maxWidth: '48ch' }}>{vibe.sub}</p>
              </div>
            </div>

            {/* Endowed-progress bar toward last week's total */}
            <div className="flex flex-col gap-1.5">
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-rule)' }} aria-hidden>
                <div style={{ width: `${Math.round(progressPct * 100)}%`, height: '100%', backgroundColor: beatLastWeek ? '#FFD60A' : 'var(--color-forest-2)', borderRadius: 999, transition: 'width 700ms cubic-bezier(.22,1,.36,1)' }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="num-mono" style={{ fontSize: 9.5, color: 'var(--color-muted)', letterSpacing: '0.08em' }}>
                  {lastScore > 0
                    ? de ? `LETZTE WOCHE: ${lastScore} PKT · DAS IST DIE MARKE` : `LAST WEEK: ${lastScore} PTS · THAT'S THE MARK`
                    : de ? `TAGESZIEL ${dailyTarget} TSS · 150% MAX` : `DAILY TARGET ${dailyTarget} TSS · 150% CAP`}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <WeekBars dailyPct={thisWeek.dailyPct} isYou />
                  {hasCrew && standings.length > 1 && (
                    <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>#{yourRank}/{standings.length}</span>
                  )}
                </div>
              </div>
              {/* Always-visible explainer — how the score works (audit: never hidden). */}
              <p className="text-[11px] leading-snug pt-0.5" style={{ color: 'var(--color-muted)' }}>
                {de
                  ? `So funktioniert's: Jeder Tag, an dem du dein Tagesziel (${dailyTarget} TSS) erreichst, bringt 100 Punkte — max. 150% pro Tag. „Ring" = dein Tagesziel; voll = erreicht. TSS = Trainingslast (Dauer × Intensität).`
                  : `How it works: each day you hit your daily target (${dailyTarget} TSS) banks 100 points — max 150%/day. "Ring" = your daily target; full = hit. TSS = training load (duration × intensity).`}
              </p>
            </div>
          </div>
        </div>
      </PillarSection>

      {/* ── ② Duell — head-to-head, straight after the ring ───────── */}
      <PillarSection
        index="2"
        title={de ? 'Duell' : 'Duel'}
        question={de ? 'Schlage ich mein früheres Ich — und die Crew?' : 'Am I beating my past self — and the crew?'}
      >
        <DuelArena duel={duel} locale={locale} restMode={gate.mode === 'rest'} />
      </PillarSection>

      {/* ── ③ Coole Fakten — the fun, celebratory numbers ─────────── */}
      <PillarSection
        index="3"
        title={de ? 'Coole Fakten' : 'Cool Facts'}
        question={de ? 'Was habe ich diese Woche eigentlich angerichtet?' : 'What did I actually pull off this week?'}
      >
        {insights.rides === 0 ? (
          <div className="flex items-center gap-2.5 rounded-[14px] px-4 py-3" style={{ border: '1px dashed var(--color-rule)' }}>
            <span style={{ fontSize: 16 }}>🫙</span>
            <p className="text-[13px] leading-snug" style={{ color: 'var(--color-muted)' }}>
              {de ? 'Noch keine Fahrt diese Woche — deine erste Einheit füllt diese Karten mit Angeber-Zahlen.' : 'No ride this week yet — your first session fills these cards with bragging numbers.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <CoolFactCard
              icon={Zap} accent="var(--color-amber)"
              value={insights.kj.toLocaleString(de ? 'de' : 'en')} unit="kJ"
              label={de ? 'ENERGIE' : 'ENERGY'}
              quip={croissants > 0 ? (de ? `≈ ${croissants} Croissants zurückverdient 🥐` : `≈ ${croissants} croissants earned back 🥐`) : (de ? 'Jede Faser zählt.' : 'Every fibre counts.')}
            />
            <CoolFactCard
              icon={Clock} accent="var(--color-forest-2)"
              value={insights.hours.toFixed(1)} unit="h"
              label={de ? 'IM SATTEL' : 'IN THE SADDLE'}
              quip={episodes > 0 ? (de ? `= ${episodes} Folgen deiner Serie 📺` : `= ${episodes} episodes of your show 📺`) : (de ? 'Kurz, aber knackig.' : 'Short but sharp.')}
            />
            <CoolFactCard
              icon={Bike} accent="var(--color-ink-blue)"
              value={insights.km.toFixed(0)} unit="km"
              label={de ? 'DISTANZ' : 'DISTANCE'}
              quip={marathons >= 1 ? (de ? `= ${marathons.toFixed(1)}× ein Marathon 🏃` : `= ${marathons.toFixed(1)}× a marathon 🏃`) : (de ? 'Die Reifen sind noch warm.' : 'Tyres still warm.')}
            />
            <CoolFactCard
              icon={Crown} accent="#FFD60A"
              value={Math.round(insights.bestTss).toString()} unit="TSS"
              label={de ? 'HÄRTESTE EINHEIT' : 'HARDEST RIDE'}
              quip={de ? `Deine intensivste Fahrt 👑${insights.bestKm >= 1 ? ` · ${insights.bestKm.toFixed(0)} km` : ''}` : `Your most intense ride 👑${insights.bestKm >= 1 ? ` · ${insights.bestKm.toFixed(0)} km` : ''}`}
            />
          </div>
        )}
      </PillarSection>

      </>
      )}

      {/* ══ Crew — find riders · standings · invite ═══════════════════ */}
      {group === 'crew' && (
      <PillarSection
        index="1"
        title={de ? 'Mitglieder finden' : 'Find Members'}
        question={de ? 'Mit wem messe ich mich?' : 'Who am I racing?'}
      >
        {/* Find + add other athletes on the app */}
        <MemberFinder crewId={crewId} locale={locale} />

        {hasCrew ? (
          <>
            <div className="flex flex-col gap-2">
              {standings.map((s, i) => <StandingRow key={s.id} standing={s} rank={i + 1} locale={locale} />)}
            </div>
            <div className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-6" style={cardBase}>
              <div className="flex items-start gap-3 mb-4">
                <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(48, 209, 88, 0.10)' }}>
                  <UserPlus size={18} strokeWidth={2} color="#30D158" />
                </div>
                <div>
                  <p className="text-[15px] font-medium" style={{ color: 'var(--color-ink)' }}>{t('riders_go_further')}</p>
                  <p className="text-[12px] leading-relaxed mt-1" style={{ color: 'var(--color-muted)' }}>
                    {de ? 'Bis zu 8 Fahrer. Nur Trainingsdaten (Serie, Wochen-TSS, Punkte) werden geteilt — niemals Körperdaten.' : 'Up to 8 riders. Only training outputs (streak, weekly TSS, points) are shared — never body data.'}
                  </p>
                </div>
              </div>
              <form onSubmit={handleInvite} className="flex gap-2 mb-3">
                <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={de ? 'E-Mail einladen' : 'Invite by email'}
                  className="flex-1 px-3 py-2.5 rounded-[12px] text-[14px]" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', outline: 'none' }} />
                <button type="submit" disabled={!draft.trim()} className="px-4 py-2.5 rounded-[12px] text-[13px] font-medium transition-opacity" style={{ backgroundColor: '#30D158', color: '#0C0C0E', opacity: draft.trim() ? 1 : 0.5 }}>
                  {de ? 'Hinzufügen' : 'Add'}
                </button>
              </form>
              <button type="button" onClick={handleShare} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[12px] text-[13px] font-medium transition-all" style={{ backgroundColor: 'transparent', border: '1px solid var(--color-rule)', color: copied ? '#30D158' : 'var(--color-ink-2)' }}>
                {copied ? <><CheckCircle2 size={14} strokeWidth={2} />{de ? 'Einladungslink kopiert' : 'Invite link copied'}</> : <><Link2 size={14} strokeWidth={2} />{t('share_invite_link')}</>}
              </button>
            </div>
            {crew.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="eyebrow px-1" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}>{de ? 'Crew verwalten' : 'Manage crew'} · {crew.length}</span>
                {crew.map((m: CrewMember) => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2.5 rounded-[12px]" style={cardBase}>
                    <span className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>{m.handle}</span>
                    {m.id.startsWith('inv-') && <button type="button" onClick={() => remove(m.id)} className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{de ? 'Zurückziehen' : 'Revoke'}</button>}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="paper-grain rounded-[20px] px-5 py-5 sm:px-6" style={cardBase}>
              <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}>{de ? 'DU GEGEN DEIN FRÜHERES ICH' : 'YOU vs PAST YOU'}</span>
              <div className="flex flex-col gap-2 mt-3">
                {[you, pastYou].slice().sort((a, b) => b.weeklyScore - a.weeklyScore).map((s, i) => <StandingRow key={s.id} standing={s} rank={i + 1} locale={locale} />)}
              </div>
              <p className="text-[12px] leading-relaxed mt-3" style={{ color: 'var(--color-muted)' }}>
                {de ? 'Kein Gegner erfunden — du misst dich ehrlich an deiner eigenen Vorwoche. Lade eine Crew ein, wenn das Feld wachsen soll.' : "No opponent invented — you race honestly against your own last week. Add a crew when you want the field to grow."}
              </p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); const name = crewNameDraft.trim(); if (!name) return; createCrew.mutate(name, { onSuccess: () => setCrewNameDraft('') }) }} className="flex items-center gap-2 flex-wrap">
              <input value={crewNameDraft} onChange={(e) => setCrewNameDraft(e.target.value)} placeholder={t('crew_name_placeholder')} maxLength={60}
                className="flex-1 min-w-[200px] px-3 py-2.5 rounded-[12px] text-[13px]" style={{ backgroundColor: 'var(--color-paper)', color: 'var(--color-ink)', border: '1px solid var(--color-rule)' }} aria-label={de ? 'Crew-Name' : 'Crew name'} />
              <button type="submit" disabled={!crewNameDraft.trim() || createCrew.isPending} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium disabled:opacity-50" style={{ backgroundColor: 'var(--color-forest-2)', color: 'var(--color-paper)', boxShadow: '0 1px 8px color-mix(in srgb, var(--color-forest-2) 35%, transparent)' }}>
                {createCrew.isPending ? t('creating') : t('create_crew')}
                <UserPlus size={14} strokeWidth={2} />
              </button>
            </form>
          </>
        )}
      </PillarSection>
      )}

      {/* ══ Erfolge — power league · honors ═══════════════════════════ */}
      {group === 'erfolge' && (
      <>
      {/* ── ① Die Kraft-Liga — how I stack up against every cyclist ── */}
      <PillarSection
        index="1"
        title={de ? 'Die Kraft-Liga' : 'The Power League'}
        question={de ? 'Wie stehe ich gegen alle anderen Fahrer da?' : 'How do I stack up against every other rider?'}
      >
        <PowerArena
          power={power}
          improvementRate={improvement?.rate ?? null}
          streak={consistency.streak}
          locale={locale}
        />
      </PillarSection>

      {/* ── ② Auszeichnungen — honors ─────────────────────────────── */}
      <PillarSection
        index="2"
        title={de ? 'Auszeichnungen' : 'Honors'}
        question={de ? 'Was habe ich verdient?' : 'What have I earned?'}
      >
        {/* Honors case */}
        <div className="flex items-center justify-between px-1 pt-2">
          <span className="eyebrow num-mono" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}>{de ? 'AUSZEICHNUNGEN' : 'HONORS'}</span>
          <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-amber)' }}>{earnedCount}/{badges.length} {de ? 'freigeschaltet' : 'unlocked'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {badges.map((b) => {
            const Icon = b.icon
            const pct = Math.round(b.progress * 100)
            return (
              <div key={b.key} className="rounded-[14px] px-2.5 py-3 flex flex-col items-center text-center gap-1.5"
                style={{
                  backgroundColor: b.earned ? `color-mix(in srgb, ${b.color} 10%, var(--color-paper-2))` : 'var(--color-paper-2)',
                  border: b.earned ? `1px solid color-mix(in srgb, ${b.color} 45%, transparent)` : '1px solid var(--color-rule)',
                  boxShadow: b.earned ? `0 0 14px color-mix(in srgb, ${b.color} 14%, transparent) inset` : undefined,
                }}>
                <span className="grid place-items-center rounded-full shrink-0" style={{ width: 30, height: 30, backgroundColor: b.earned ? `color-mix(in srgb, ${b.color} 18%, transparent)` : 'var(--color-rule)' }}>
                  {b.earned ? <Icon size={15} strokeWidth={2.2} style={{ color: b.color }} /> : <Lock size={13} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />}
                </span>
                <span className="text-[11px] font-medium leading-tight" style={{ color: b.earned ? 'var(--color-ink)' : 'var(--color-ink-2)' }}>{b.label}</span>
                {b.earned ? (
                  <span className="num-mono" style={{ fontSize: 8.5, letterSpacing: '0.14em', color: b.color }}>{de ? 'ERREICHT' : 'EARNED'}</span>
                ) : (
                  <div className="w-full flex flex-col items-center gap-1">
                    <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-rule)' }} aria-hidden>
                      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: `color-mix(in srgb, ${b.color} 60%, transparent)`, borderRadius: 999, transition: 'width 600ms cubic-bezier(.22,1,.36,1)' }} />
                    </div>
                    <span className="num-mono leading-tight" style={{ fontSize: 8.5, color: 'var(--color-muted)' }}>{b.how}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </PillarSection>
      </>
      )}
    </div>
  )
}

