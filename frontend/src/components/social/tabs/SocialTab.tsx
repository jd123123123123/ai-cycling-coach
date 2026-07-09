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
  CalendarCheck,
  Award,
  Zap,
  Lock,
} from 'lucide-react'
import PillarSection from '../../dashboard/PillarSection'
import CoachSafetyBanner from '../CoachSafetyBanner'
import BandChip from '../BandChip'
import Confetti from '../../ui/Confetti'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import { useCountUp } from '../../../hooks/useCountUp'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { usePowerProfile } from '../../../hooks/usePowerProfile'
import { usePMC } from '../../../hooks/usePMC'
import { useAdaptiveGate } from '../../../hooks/useAdaptiveGate'
import { useCrew, useCreateCrew, useMyCrew } from '../../../hooks/useCrew'
import type { CrewMember } from '../../../hooks/useCrew'
import { useT, useLocale } from '../../../contexts/LocaleContext'
import type { Locale } from '../../../i18n/strings'
import type { ActivityRead } from '../../../api/dashboard'

// SocialTab — the fourth surface (spec §1, §6, §7 · Phase 0).
//
// Four MECE pillars, each answering exactly one question, plus a
// coach-safety banner above pillar 1 that outranks every competitive nudge.
// Runs entirely on one athlete's real data: solo "vs. past self" is the
// default. No fabricated rivals — credibility is the whole game (spec §0.2).

// ── Ring math — identical to CrewTab's shipped Squad Cup math (spec §2.1) ──
const DAILY_TARGET_DEFAULT = 70
const DAILY_CAP = 1.5

function dailyTargetFrom(profile: { weekly_hours_available?: number | null } | undefined): number {
  const weeklyHours = profile?.weekly_hours_available ?? null
  if (weeklyHours == null || weeklyHours <= 0) return DAILY_TARGET_DEFAULT
  return Math.max(30, Math.round((weeklyHours * 70) / 7))
}

interface WeekScore {
  dailyPct: number[] // 7 entries Mon..Sun
  weeklyScore: number
  weeklyTSS: number
  bestRide: number // best single-activity TSS in the window
}

function computeWeek(
  activities: ActivityRead[],
  start: Date,
  end: Date,
  dailyTarget: number,
): WeekScore {
  const dailyTSS = Array.from({ length: 7 }, () => 0)
  let bestRide = 0
  for (const a of activities) {
    const d = new Date(a.started_at)
    if (!isWithinInterval(d, { start, end })) continue
    const dow = (d.getDay() + 6) % 7 // Mon=0
    const tss = a.tss ?? 0
    dailyTSS[dow] += tss
    if (tss > bestRide) bestRide = tss
  }
  const dailyPct = dailyTSS.map((tss) => Math.min(DAILY_CAP, tss / dailyTarget))
  const weeklyScore = dailyPct.reduce((s, p) => s + p * 100, 0)
  const weeklyTSS = dailyTSS.reduce((s, t) => s + t, 0)
  return { dailyPct, weeklyScore, weeklyTSS, bestRide }
}

// ── Small shared UI (mirrors CrewTab exactly) ─────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) {
    return (
      <span
        className="num-mono shrink-0"
        style={{ color: 'var(--color-muted)', fontSize: 11, minWidth: 22, textAlign: 'center' }}
      >
        {rank}
      </span>
    )
  }
  const colors = ['#FFD60A', '#C7C7CC', '#BF6E2A']
  const color = colors[rank - 1]
  return (
    <Medal
      size={16}
      strokeWidth={2.2}
      style={{ color, filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 50%, transparent))` }}
    />
  )
}

function WeekBars({ dailyPct, isYou }: { dailyPct: number[]; isYou: boolean }) {
  const max = Math.max(1, ...dailyPct, DAILY_CAP)
  return (
    <div className="flex items-end gap-[3px] h-5" aria-hidden>
      {dailyPct.map((p, i) => {
        const h = Math.min(100, (p / max) * 100)
        const good = p >= 1
        const partial = p > 0 && p < 1
        const color = good
          ? (isYou ? 'var(--color-forest-2)' : '#30D158')
          : partial
            ? 'var(--color-amber)'
            : 'var(--color-rule)'
        return (
          <span
            key={i}
            style={{
              width: 5,
              height: `${Math.max(8, h)}%`,
              backgroundColor: color,
              borderRadius: 2,
              opacity: p === 0 ? 0.35 : 1,
              transition: 'height 500ms cubic-bezier(.22,1,.36,1)',
            }}
          />
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
    <span
      className="inline-flex items-center gap-1.5 num-mono"
      style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.14em' }}
    >
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
        backgroundColor: standing.isYou
          ? 'color-mix(in srgb, var(--color-forest-2) 10%, var(--color-paper-2))'
          : 'var(--color-paper-2)',
        border: standing.isYou
          ? '1px solid color-mix(in srgb, var(--color-forest-2) 35%, var(--color-rule))'
          : first
            ? '1px solid rgba(255, 214, 10, 0.35)'
            : '1px solid var(--color-rule)',
        boxShadow: first ? '0 0 16px rgba(255, 214, 10, 0.08) inset' : undefined,
      }}
    >
      <RankBadge rank={rank} />
      <div
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}
      >
        <span
          className="num-mono text-[12px] font-semibold"
          style={{ color: standing.isYou ? 'var(--color-forest-2)' : 'var(--color-muted)' }}
        >
          {standing.isYou ? (locale === 'de' ? 'DU' : 'YOU') : standing.handle.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-[14px] font-medium truncate" style={{ color: 'var(--color-ink)' }}>
            {standing.isYou ? (locale === 'de' ? 'Du' : 'You') : standing.handle}
          </p>
          {standing.status === 'pending' && (
            <span
              className="eyebrow shrink-0"
              style={{ fontSize: 9, color: 'var(--color-amber)', letterSpacing: '0.18em' }}
            >
              {locale === 'de' ? 'AUSSTEHEND' : 'PENDING'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <WeekBars dailyPct={standing.dailyPct} isYou={standing.isYou} />
          <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
            {Math.round(standing.weeklyTSS)} TSS
          </span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-baseline gap-1 justify-end">
          <span
            className="num-display leading-none"
            style={{ fontSize: 20, color: standing.isYou ? 'var(--color-forest-2)' : 'var(--color-ink)' }}
          >
            {s}
          </span>
          <span
            className="num-mono"
            style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.12em' }}
          >
            PTS
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Invite helpers (mirrors CrewTab) ──────────────────────────────────────

function copyInviteLink(): Promise<boolean> {
  const url = `${window.location.origin}/invite?ref=squad`
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(url).then(() => true).catch(() => false)
  }
  return Promise.resolve(false)
}

function shareInvite(weeklyScore: number, locale: Locale): Promise<boolean> {
  const url = `${window.location.origin}/invite?ref=squad`
  const text = locale === 'de'
    ? `Tritt meiner Crew bei — ich stehe diese Woche bei ${Math.round(weeklyScore)} Punkten. Hol mich ein, wenn du kannst.`
    : `Join my cycling squad — I'm at ${Math.round(weeklyScore)} pts this week. Catch me if you can.`
  const title = locale === 'de' ? 'Tritt meiner Crew bei' : 'Join my squad'
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
  if (nav.share) {
    return nav.share({ title, text, url }).then(() => true).catch(() => false)
  }
  return copyInviteLink()
}

// ── The tab ───────────────────────────────────────────────────────────────

type Lens = 'effort' | 'rising' | 'consistent'

export default function SocialTab() {
  const t = useT()
  const { locale } = useLocale()
  const de = locale === 'de'
  const gate = useAdaptiveGate()

  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const lastWeekStart = subDays(weekStart, 7)
  const lastWeekEnd = subDays(weekEnd, 7)

  // Pull two full weeks so both scores come from one query.
  const { data: actsData } = useActivitiesRange(lastWeekStart, today)
  const { data: profile } = useAthleteProfile()
  const { data: power } = usePowerProfile()
  const { data: pmc } = usePMC(90)

  const { crew, invite, remove } = useCrew()
  const { data: myCrewData } = useMyCrew()
  const createCrew = useCreateCrew()
  const hasCrew = !!myCrewData?.crew

  const dailyTarget = dailyTargetFrom(profile)
  const activities = useMemo(() => actsData?.activities ?? [], [actsData])

  const thisWeek = useMemo(
    () => computeWeek(activities, weekStart, weekEnd, dailyTarget),
    [activities, weekStart, weekEnd, dailyTarget],
  )
  const lastWeek = useMemo(
    () => computeWeek(activities, lastWeekStart, lastWeekEnd, dailyTarget),
    [activities, lastWeekStart, lastWeekEnd, dailyTarget],
  )

  const thisScore = Math.round(thisWeek.weeklyScore)
  const lastScore = Math.round(lastWeek.weeklyScore)
  const heroCount = useCountUp(thisScore, { durationMs: 1100 })

  const beatLastWeek = lastScore > 0 && thisScore > lastScore
  const gap = lastScore - thisScore

  // Confetti fires once, only on a genuine change (beating last week's score).
  const [celebrated, setCelebrated] = useState(false)
  useEffect(() => {
    if (beatLastWeek && !celebrated) setCelebrated(true)
  }, [beatLastWeek, celebrated])

  // ── Fairness inputs (spec §2.2–2.4) ──
  const ftp = profile?.ftp_watts ?? null
  const weight = profile?.weight_kg ?? null
  // Prefer explicit FTP W/kg from the profile; fall back to the power
  // profile's Coggan CP W/kg when weight/FTP aren't both on file.
  const wkgFtp = ftp && weight && weight > 0 ? ftp / weight : (power?.cp_wkg ?? null)

  // Improvement rate: CTL now vs 28d ago (spec §2.3)
  const improvement = useMemo(() => {
    const entries = pmc?.entries ?? []
    if (entries.length < 2) return null
    const now = entries[entries.length - 1]
    // find entry ~28 days before the last one
    const targetDate = subDays(parseISO(now.date), 28)
    let past = entries[0]
    for (const e of entries) {
      if (parseISO(e.date) <= targetDate) past = e
    }
    if (!past || past.ctl <= 0) return null
    return { rate: (now.ctl - past.ctl) / past.ctl, ctlNow: now.ctl, ctlThen: past.ctl }
  }, [pmc])

  // Consistency: ring-close streak + rolling-28d frequency (spec §2.4).
  // A day counts toward the streak if the ring closed (TSS ≥ target) OR it was
  // a rest day (0 TSS) — you can't lose a streak by following your coach.
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
    const last28 = entries.slice(-28)
    const frequency = last28.filter((e) => e.daily_tss > 0).length
    return { streak, frequency }
  }, [pmc, dailyTarget])

  // ── Standings (crew mode mirrors CrewTab exactly) ──
  const you: Standing = {
    id: 'you',
    handle: 'You',
    isYou: true,
    weeklyScore: thisWeek.weeklyScore,
    weeklyTSS: thisWeek.weeklyTSS,
    dailyPct: thisWeek.dailyPct,
    status: 'live',
  }
  const pastYou: Standing = {
    id: 'past-you',
    handle: de ? 'Letzte Woche' : 'Last week',
    isYou: false,
    weeklyScore: lastWeek.weeklyScore,
    weeklyTSS: lastWeek.weeklyTSS,
    dailyPct: lastWeek.dailyPct,
    status: 'live',
  }
  const standings = useMemo<Standing[]>(() => {
    const crewStandings: Standing[] = crew.map((m) => ({
      id: m.id,
      handle: m.handle,
      isYou: false,
      weeklyScore: 0,
      weeklyTSS: 0,
      dailyPct: Array.from({ length: 7 }, () => 0),
      status: 'pending' as const,
    }))
    return [you, ...crewStandings].sort((a, b) => b.weeklyScore - a.weeklyScore)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew, thisWeek])
  const yourRank = standings.findIndex((s) => s.isYou) + 1

  // ── Badges (client-derived, spec §5.3 / §4) ──
  const lastWeekPerfect = lastWeek.dailyPct.length === 7 && lastWeek.dailyPct.every((p) => p >= 1)
  const badges = useMemo(
    () => [
      {
        key: 'streak_7',
        icon: Flame,
        label: de ? '7-Tage-Serie' : '7-day streak',
        earned: consistency.streak >= 7,
        how: de ? '7 Tage in Folge den Ring schließen' : 'Close your ring 7 days running',
      },
      {
        key: 'streak_30',
        icon: Flame,
        label: de ? '30-Tage-Serie' : '30-day streak',
        earned: consistency.streak >= 30,
        how: de ? '30 Tage am Stück dranbleiben' : 'Stay on it 30 days straight',
      },
      {
        key: 'perfect_week',
        icon: CheckCircle2,
        label: de ? 'Perfekte Woche' : 'Perfect week',
        earned: lastWeekPerfect,
        how: de ? 'An allen 7 Tagen den Ring schließen' : 'Close the ring all 7 days',
      },
      {
        key: 'most_improved',
        icon: TrendingUp,
        label: de ? 'Größter Sprung' : 'Most improved',
        earned: (improvement?.rate ?? 0) >= 0.05,
        how: de ? 'CTL in 28 Tagen um 5% steigern' : 'Grow CTL 5% in 28 days',
      },
      {
        key: 'ring_week_win',
        icon: Trophy,
        label: de ? 'Woche geschlagen' : 'Beat last week',
        earned: beatLastWeek,
        how: de ? 'Den Ring-Score der Vorwoche übertreffen' : "Top last week's ring score",
      },
    ],
    [consistency.streak, lastWeekPerfect, improvement, beatLastWeek, de],
  )

  // ── Fairness lens ──
  const [lens, setLens] = useState<Lens>('effort')
  const lensTabs = [
    { id: 'effort' as const, label: de ? 'Leistung' : 'Effort' },
    { id: 'rising' as const, label: de ? 'Aufstieg' : 'Rising' },
    { id: 'consistent' as const, label: de ? 'Konstanz' : 'Consistent' },
  ]

  // ── Invite state ──
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [crewNameDraft, setCrewNameDraft] = useState('')

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (draft.trim()) {
      invite(draft)
      setDraft('')
    }
  }
  async function handleShare() {
    const ok = await shareInvite(thisWeek.weeklyScore, locale)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  const cardBase = {
    backgroundColor: 'var(--color-paper-2)',
    border: '1px solid var(--color-rule)',
  } as const

  // Endowed progress: real progress toward last week's total, stated truthfully.
  const progressPct = lastScore > 0 ? Math.min(1, thisScore / lastScore) : thisScore > 0 ? 1 : 0

  return (
    <div className="flex flex-col gap-9 sm:gap-11">
      {/* Coach-safety interlock — outranks everything below (spec §4) */}
      <CoachSafetyBanner />

      {/* ── ① This Week's Challenge ─────────────────────────────── */}
      <PillarSection
        index="1"
        title={de ? 'Diese Woche' : "This Week's Challenge"}
        question={de ? 'Was ist das Spiel diese Woche — und gewinne ich es?' : "What's the game this week — and am I winning it?"}
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
          <div className="px-6 py-6 sm:px-8 sm:py-7 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Trophy size={14} strokeWidth={2} style={{ color: beatLastWeek ? '#FFD60A' : 'var(--color-forest-2)' }} />
                <span className="eyebrow" style={{ color: 'var(--color-ink)', letterSpacing: '0.28em', fontSize: 10, fontWeight: 600 }}>
                  {de ? 'RING-WOCHE · DU GEGEN LETZTE WOCHE' : 'RING WEEK · YOU vs LAST WEEK'}
                </span>
              </div>
              <Countdown weekEnd={weekEnd} locale={locale} />
            </div>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className="num-display leading-none"
                style={{
                  fontSize: 'clamp(36px, 5vw, 52px)',
                  color: beatLastWeek ? '#FFD60A' : 'var(--color-ink)',
                  fontVariationSettings: '"opsz" 144, "wght" 500',
                }}
              >
                {heroCount}
              </span>
              <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.14em' }}>
                {t('points_label')}
              </span>
              {hasCrew && standings.length > 1 && (
                <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.12em' }}>
                  · {t('rank_label')} {yourRank} {t('of_label')} {standings.length}
                </span>
              )}
              <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.12em' }}>
                · {de ? 'LETZTE WOCHE' : 'LAST WEEK'} {lastScore}
              </span>
            </div>

            {/* Guiding sentence — serif italic */}
            <p
              className="text-[13px] leading-relaxed"
              style={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontVariationSettings: '"opsz" 30, "wght" 400',
                color: 'var(--color-ink-2)',
                maxWidth: '58ch',
              }}
            >
              {gate.mode === 'rest'
                ? de
                  ? 'Diese Woche pausiert das Rennen — dein Coach verordnet Erholung. Der Ring schließt heute durchs Ausruhen.'
                  : "The race pauses this week — your coach is prescribing recovery. Your ring closes today by resting."
                : beatLastWeek
                  ? de
                    ? `Du hast dein früheres Ich um ${thisScore - lastScore} Punkte geschlagen. Halte den Vorsprung bis Sonntag.`
                    : `You've beaten your past self by ${thisScore - lastScore} points. Hold the lead until Sunday.`
                  : gap > 0
                    ? gate.mode === 'ease'
                      ? de
                        ? 'Ein leichter Tag hält deinen Ring am Leben — kein Grund, die Lücke heute zu jagen.'
                        : 'A light spin keeps your ring alive — no need to chase the gap today.'
                      : de
                        ? `${gap} Punkte hinter der Vorwoche. Eine ${Math.ceil((gap / 100) * dailyTarget)}-TSS-Einheit schließt die Lücke.`
                        : `${gap} points behind last week. A ${Math.ceil((gap / 100) * dailyTarget)}-TSS session closes the gap.`
                    : de
                      ? 'Sammle jeden Tag Punkte — erreiche dein Tagesziel und du bekommst 100. Maximum sind 150% pro Tag.'
                      : 'Earn points each day — hit your daily target and bank 100. Cap is 150% per day.'}
            </p>

            {/* Endowed-progress bar toward last week's total — with a truthful reason */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-rule)' }} aria-hidden>
                <div
                  style={{
                    width: `${Math.round(progressPct * 100)}%`,
                    height: '100%',
                    backgroundColor: beatLastWeek ? '#FFD60A' : 'var(--color-forest-2)',
                    borderRadius: 999,
                    transition: 'width 600ms cubic-bezier(.22,1,.36,1)',
                  }}
                />
              </div>
              <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.08em' }}>
                {lastScore > 0
                  ? de
                    ? `DU STARTEST NICHT BEI NULL — LETZTE WOCHE HAST DU ${lastScore} PKT GESAMMELT. DAS IST DAS ZIEL.`
                    : `YOU DON'T START AT ZERO — YOU BANKED ${lastScore} PTS LAST WEEK. THAT'S THE MARK.`
                  : de
                    ? `TAGESZIEL ${dailyTarget} TSS · 150% MAX · 7 TAGE`
                    : `DAILY TARGET ${dailyTarget} TSS · 150% CAP · 7 DAYS`}
              </span>
            </div>

            {/* This week's 7-day ring texture */}
            <div className="flex items-center gap-3 pt-1">
              <WeekBars dailyPct={thisWeek.dailyPct} isYou />
              <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.12em' }}>
                {de ? 'MO → SO' : 'MON → SUN'} · {Math.round(thisWeek.weeklyTSS)} TSS
              </span>
            </div>
          </div>
        </div>
      </PillarSection>

      {/* ── ② The Crew ──────────────────────────────────────────── */}
      <PillarSection
        index="2"
        title={de ? 'Die Crew' : 'The Crew'}
        question={de ? 'Wie schlägt sich mein Team — und trage ich meinen Teil bei?' : 'How does my squad stack up — and am I pulling my weight?'}
      >
        {hasCrew ? (
          <>
            <div className="flex flex-col gap-2">
              {standings.map((s, i) => (
                <StandingRow key={s.id} standing={s} rank={i + 1} locale={locale} />
              ))}
            </div>

            {/* Invite card */}
            <div className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-6" style={cardBase}>
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(48, 209, 88, 0.10)' }}
                >
                  <UserPlus size={18} strokeWidth={2} color="#30D158" />
                </div>
                <div>
                  <p className="text-[15px] font-medium" style={{ color: 'var(--color-ink)' }}>
                    {t('riders_go_further')}
                  </p>
                  <p className="text-[12px] leading-relaxed mt-1" style={{ color: 'var(--color-muted)' }}>
                    {de
                      ? 'Bis zu 8 Fahrer. Nur Trainingsdaten (Serie, Wochen-TSS, Punkte) werden geteilt — niemals Körperdaten.'
                      : 'Up to 8 riders. Only training outputs (streak, weekly TSS, points) are shared — never body data.'}
                  </p>
                </div>
              </div>
              <form onSubmit={handleInvite} className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={de ? 'E-Mail einladen' : 'Invite by email'}
                  className="flex-1 px-3 py-2.5 rounded-[12px] text-[14px]"
                  style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="px-4 py-2.5 rounded-[12px] text-[13px] font-medium transition-opacity"
                  style={{ backgroundColor: '#30D158', color: '#0C0C0E', opacity: draft.trim() ? 1 : 0.5 }}
                >
                  {de ? 'Hinzufügen' : 'Add'}
                </button>
              </form>
              <button
                type="button"
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[12px] text-[13px] font-medium transition-all"
                style={{ backgroundColor: 'transparent', border: '1px solid var(--color-rule)', color: copied ? '#30D158' : 'var(--color-ink-2)' }}
              >
                {copied ? (
                  <>
                    <CheckCircle2 size={14} strokeWidth={2} />
                    {de ? 'Einladungslink kopiert' : 'Invite link copied'}
                  </>
                ) : (
                  <>
                    <Link2 size={14} strokeWidth={2} />
                    {t('share_invite_link')}
                  </>
                )}
              </button>
            </div>

            {/* Manage crew */}
            {crew.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="eyebrow px-1" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}>
                  {de ? 'Crew verwalten' : 'Manage crew'} · {crew.length}
                </span>
                {crew.map((m: CrewMember) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-4 py-2.5 rounded-[12px]"
                    style={cardBase}
                  >
                    <span className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>{m.handle}</span>
                    {m.id.startsWith('inv-') && (
                      <button
                        type="button"
                        onClick={() => remove(m.id)}
                        className="text-[11px]"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {de ? 'Zurückziehen' : 'Revoke'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          // Solo fallback — You vs. Past You
          <>
            <div className="paper-grain rounded-[20px] px-5 py-5 sm:px-6" style={cardBase}>
              <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}>
                {de ? 'DU GEGEN DEIN FRÜHERES ICH' : 'YOU vs PAST YOU'}
              </span>
              <div className="flex flex-col gap-2 mt-3">
                {[you, pastYou]
                  .slice()
                  .sort((a, b) => b.weeklyScore - a.weeklyScore)
                  .map((s, i) => (
                    <StandingRow key={s.id} standing={s} rank={i + 1} locale={locale} />
                  ))}
              </div>
              <p className="text-[12px] leading-relaxed mt-3" style={{ color: 'var(--color-muted)' }}>
                {de
                  ? 'Kein Gegner erfunden — du misst dich ehrlich an deiner eigenen Vorwoche. Lade eine Crew ein, wenn du das Feld erweitern willst.'
                  : "No opponent invented — you race honestly against your own last week. Add a crew when you want the field to grow."}
              </p>
            </div>

            {/* Create-crew CTA */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const name = crewNameDraft.trim()
                if (!name) return
                createCrew.mutate(name, { onSuccess: () => setCrewNameDraft('') })
              }}
              className="flex items-center gap-2 flex-wrap"
            >
              <input
                value={crewNameDraft}
                onChange={(e) => setCrewNameDraft(e.target.value)}
                placeholder={t('crew_name_placeholder')}
                maxLength={60}
                className="flex-1 min-w-[200px] px-3 py-2.5 rounded-[12px] text-[13px]"
                style={{ backgroundColor: 'var(--color-paper)', color: 'var(--color-ink)', border: '1px solid var(--color-rule)' }}
                aria-label={de ? 'Crew-Name' : 'Crew name'}
              />
              <button
                type="submit"
                disabled={!crewNameDraft.trim() || createCrew.isPending}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-forest-2)', color: 'var(--color-paper)', boxShadow: '0 1px 8px color-mix(in srgb, var(--color-forest-2) 35%, transparent)' }}
              >
                {createCrew.isPending ? t('creating') : t('create_crew')}
                <UserPlus size={14} strokeWidth={2} />
              </button>
            </form>
          </>
        )}
      </PillarSection>

      {/* ── ③ Where I Stand ─────────────────────────────────────── */}
      <PillarSection
        index="3"
        title={de ? 'Wo ich stehe' : 'Where I Stand'}
        question={de ? 'Fair — nicht nur am schnellsten — wie schneide ich ab?' : 'Fairly — not just fastest — how do I compare?'}
      >
        <div className="flex flex-col gap-4">
          <SegmentedTabs
            tabs={lensTabs}
            value={lens}
            onChange={setLens}
            ariaLabel={de ? 'Vergleichsobjektiv' : 'Comparison lens'}
            indicatorId="fairness-lens-indicator"
          />

          <div className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-6" style={cardBase}>
            {lens === 'effort' && (
              wkgFtp ? (
                <div className="flex flex-col gap-3">
                  <BandChip wkgFtp={wkgFtp} locale={locale} />
                  <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                    {de
                      ? 'Das ist du gegen deine eigene Decke — steige ein Band auf, nicht das eines anderen. Nie Watt-gegen-Watt, immer nur dein Verhältnis.'
                      : "This is you against your own ceiling — climb one band, not someone else's. Never watt-vs-watt, only your own ratio."}
                  </p>
                </div>
              ) : (
                <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
                  {de
                    ? 'Trage FTP und Gewicht im Profil ein, um dein faires Leistungsband zu sehen.'
                    : 'Add your FTP and weight in your profile to see your fair effort band.'}
                </p>
              )
            )}

            {lens === 'rising' && (
              <FairMetric
                icon={TrendingUp}
                eyebrow={de ? 'AUFSTIEG · CTL 28 TAGE' : 'RISING · CTL 28 DAYS'}
                value={improvement ? `${improvement.rate >= 0 ? '+' : ''}${(improvement.rate * 100).toFixed(1)}%` : '—'}
                caption={
                  improvement
                    ? de
                      ? `Fitness von ${Math.round(improvement.ctlThen)} auf ${Math.round(improvement.ctlNow)} — dein Zuwachs, nicht der eines Profis.`
                      : `Fitness from ${Math.round(improvement.ctlThen)} to ${Math.round(improvement.ctlNow)} — your gain, not a pro's.`
                    : de
                      ? 'Noch nicht genug Verlauf, um deine Aufstiegsrate zu berechnen.'
                      : 'Not enough history yet to compute your rising rate.'
                }
                positive={(improvement?.rate ?? 0) >= 0}
              />
            )}

            {lens === 'consistent' && (
              <FairMetric
                icon={CalendarCheck}
                eyebrow={de ? 'KONSTANZ · SERIE & FREQUENZ' : 'CONSISTENT · STREAK & FREQUENCY'}
                value={`${consistency.streak}${de ? ' T' : 'd'}`}
                caption={
                  de
                    ? `${consistency.frequency} Einheiten in den letzten 28 Tagen. Ruhetage zählen — du verlierst keine Serie, wenn du deinem Coach folgst.`
                    : `${consistency.frequency} sessions in the last 28 days. Rest days count — you can't lose a streak by following your coach.`
                }
                positive
              />
            )}
          </div>
        </div>
      </PillarSection>

      {/* ── ④ Duels & Honors ────────────────────────────────────── */}
      <PillarSection
        index="4"
        title={de ? 'Duelle & Auszeichnungen' : 'Duels & Honors'}
        question={de ? 'Wen habe ich geschlagen, und was habe ich verdient?' : 'Who did I beat, and what have I earned?'}
      >
        {/* Honors case */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {badges.map((b) => {
            const Icon = b.earned ? b.icon : Lock
            return (
              <div
                key={b.key}
                className="rounded-[16px] px-4 py-4 flex flex-col items-center text-center gap-2"
                style={{
                  backgroundColor: 'var(--color-paper-2)',
                  border: b.earned ? '1px solid rgba(255, 214, 10, 0.35)' : '1px solid var(--color-rule)',
                  boxShadow: b.earned ? '0 0 16px rgba(255, 214, 10, 0.06) inset' : undefined,
                  opacity: b.earned ? 1 : 0.62,
                }}
              >
                <Icon
                  size={20}
                  strokeWidth={2}
                  style={{ color: b.earned ? '#FFD60A' : 'var(--color-muted)' }}
                />
                <span className="text-[12px] font-medium" style={{ color: 'var(--color-ink)' }}>{b.label}</span>
                {!b.earned && (
                  <span className="text-[10px] leading-tight" style={{ color: 'var(--color-muted)' }}>{b.how}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Duel strip — You vs Past You, best ride each week */}
        <div className="paper-grain rounded-[20px] px-5 py-5 sm:px-6" style={cardBase}>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
            <span className="eyebrow" style={{ color: 'var(--color-ink)', letterSpacing: '0.22em', fontSize: 10, fontWeight: 600 }}>
              {de ? 'DUELL · BESTE EINHEIT · DU GEGEN FRÜHER' : 'DUEL · BEST RIDE · YOU vs PAST YOU'}
            </span>
          </div>
          <div className="flex items-stretch gap-3">
            <DuelSide
              label={de ? 'Diese Woche' : 'This week'}
              tss={thisWeek.bestRide}
              win={thisWeek.bestRide >= lastWeek.bestRide}
              isYou
            />
            <div className="flex items-center">
              <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.14em' }}>VS</span>
            </div>
            <DuelSide
              label={de ? 'Letzte Woche' : 'Last week'}
              tss={lastWeek.bestRide}
              win={lastWeek.bestRide > thisWeek.bestRide}
            />
          </div>
        </div>
      </PillarSection>
    </div>
  )
}

// ── FairMetric — one fair, relative number, framed vs your past self ──
function FairMetric({
  icon: Icon,
  eyebrow,
  value,
  caption,
  positive,
}: {
  icon: typeof TrendingUp
  eyebrow: string
  value: string
  caption: string
  positive: boolean
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-forest-2) 12%, transparent)' }}
      >
        <Icon size={20} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
      </div>
      <div className="min-w-0">
        <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.2em', fontSize: 9 }}>{eyebrow}</span>
        <div
          className="num-display leading-none mt-1.5"
          style={{ fontSize: 'clamp(28px, 4vw, 36px)', color: positive ? 'var(--color-forest-2)' : 'var(--color-ink)' }}
        >
          {value}
        </div>
        <p className="text-[12px] leading-relaxed mt-2" style={{ color: 'var(--color-muted)', maxWidth: '52ch' }}>{caption}</p>
      </div>
    </div>
  )
}

// ── DuelSide — one contestant in the best-ride duel ──
function DuelSide({ label, tss, win, isYou = false }: { label: string; tss: number; win: boolean; isYou?: boolean }) {
  return (
    <div
      className="flex-1 rounded-[16px] px-4 py-4 flex flex-col gap-1"
      style={{
        backgroundColor: isYou ? 'color-mix(in srgb, var(--color-forest-2) 10%, var(--color-paper-2))' : 'var(--color-paper-2)',
        border: win ? '1px solid rgba(255, 214, 10, 0.4)' : '1px solid var(--color-rule)',
        boxShadow: win ? '0 0 16px rgba(255, 214, 10, 0.08) inset' : undefined,
      }}
    >
      <div className="flex items-center gap-1.5">
        {win && <Award size={13} strokeWidth={2.2} style={{ color: '#FFD60A' }} />}
        <span className="text-[12px] font-medium" style={{ color: 'var(--color-ink)' }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="num-display leading-none" style={{ fontSize: 24, color: win ? '#FFD60A' : 'var(--color-ink)' }}>
          {Math.round(tss)}
        </span>
        <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.12em' }}>TSS</span>
      </div>
    </div>
  )
}
