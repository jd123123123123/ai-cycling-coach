import { useMemo, useState } from 'react'
import {
  subDays,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  differenceInSeconds,
} from 'date-fns'
import {
  UserPlus,
  Link2,
  X,
  Flame,
  Trophy,
  CheckCircle2,
  Medal,
  Timer,
} from 'lucide-react'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { useCountUp } from '../../../hooks/useCountUp'
import { useCrew, useCreateCrew, useMyCrew } from '../../../hooks/useCrew'
import type { CrewMember } from '../../../hooks/useCrew'
import { useT, useLocale } from '../../../contexts/LocaleContext'
import type { Locale } from '../../../i18n/strings'

// CrewTab — Apple-Fitness-inspired "Squad Cup" weekly competition.
// Mechanic: 7-day race (resets Monday 00:00). Each day, each rider earns
//   points = min(1.5, daily_TSS / daily_target) × 100
// Weekly score = sum across 7 days (max ~1050 with 1.5× cap). Top of the
// table gets the trophy. No cross-user data exists until backend ships, so
// invited friends show as PENDING — but you compete against yourself until
// they join, which is still motivating (beat last week's score).

const DAILY_TARGET_DEFAULT = 70 // TSS/day baseline when profile is empty
const DAILY_CAP = 1.5 // one huge day can't carry the whole week

interface Standing {
  id: string
  handle: string
  isYou: boolean
  weeklyScore: number
  weeklyTSS: number
  dailyPct: number[] // 7 entries Mon..Sun
  status: 'live' | 'pending'
}

function dailyTargetFrom(profile: { weekly_hours_available?: number | null } | undefined): number {
  const weeklyHours = profile?.weekly_hours_available ?? null
  if (weeklyHours == null || weeklyHours <= 0) return DAILY_TARGET_DEFAULT
  // ~70 TSS per training hour at moderate intensity, spread over 7 days
  return Math.max(30, Math.round((weeklyHours * 70) / 7))
}

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

// ─── Small UI bits ──────────────────────────────────────────────────────────

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

/** 7-bar micro-chart — one bar per day, colored by target achievement. */
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

function Countdown({ weekEnd }: { weekEnd: Date }) {
  const { locale } = useLocale()
  const secs = Math.max(0, differenceInSeconds(weekEnd, new Date()))
  const days = Math.floor(secs / 86_400)
  const hrs = Math.floor((secs % 86_400) / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  const parts = days > 0
    ? `${days}d ${hrs}h`
    : hrs > 0
      ? `${hrs}h ${mins}m`
      : `${mins}m`
  return (
    <span className="inline-flex items-center gap-1.5 num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.14em' }}>
      <Timer size={10} strokeWidth={2} />
      {parts} {locale === 'de' ? 'ÜBRIG' : 'LEFT'}
    </span>
  )
}

function StandingRow({ standing, rank }: { standing: Standing; rank: number }) {
  const { locale } = useLocale()
  const s = useCountUp(Math.round(standing.weeklyScore), { duration: 800, enabled: standing.status === 'live' })
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
        boxShadow: first
          ? '0 0 16px rgba(255, 214, 10, 0.08) inset'
          : undefined,
      }}
    >
      <RankBadge rank={rank} />

      <div
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
        }}
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
          <p
            className="text-[14px] font-medium truncate"
            style={{ color: 'var(--color-ink)' }}
          >
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
            style={{
              fontSize: 20,
              color: standing.isYou ? 'var(--color-forest-2)' : 'var(--color-ink)',
            }}
          >
            {s}
          </span>
          <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.12em' }}>
            PTS
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── The tab ────────────────────────────────────────────────────────────────

export default function CrewTab() {
  const t = useT()
  const { locale } = useLocale()
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const { data: actsData } = useActivitiesRange(weekStart, today)
  const { data: profile } = useAthleteProfile()
  const { crew, invite, remove } = useCrew()
  const { data: myCrewData, isLoading: myCrewLoading } = useMyCrew()
  const createCrew = useCreateCrew()
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [crewNameDraft, setCrewNameDraft] = useState('')
  const hasCrew = !!myCrewData?.crew

  const dailyTarget = dailyTargetFrom(profile)

  // Compute YOUR weekly scoring
  const you = useMemo<Standing>(() => {
    const activities = actsData?.activities ?? []
    const dailyTSS = Array.from({ length: 7 }, () => 0)
    for (const a of activities) {
      const d = new Date(a.started_at)
      if (!isWithinInterval(d, { start: weekStart, end: weekEnd })) continue
      const dow = (d.getDay() + 6) % 7 // Mon=0
      dailyTSS[dow] += a.tss ?? 0
    }
    const dailyPct = dailyTSS.map((tss) => Math.min(DAILY_CAP, tss / dailyTarget))
    const weeklyScore = dailyPct.reduce((s, p) => s + p * 100, 0)
    const weeklyTSS = dailyTSS.reduce((s, t) => s + t, 0)
    return {
      id: 'you',
      handle: 'You',
      isYou: true,
      weeklyScore,
      weeklyTSS,
      dailyPct,
      status: 'live',
    }
  }, [actsData, dailyTarget, weekStart, weekEnd])

  const standings = useMemo<Standing[]>(() => {
    const crewStandings: Standing[] = crew.map((m) => ({
      id: m.id,
      handle: m.handle,
      isYou: false,
      // Until backend is wired, pending members contribute nothing. They sit
      // at the bottom with zero — the leaderboard is truthful.
      weeklyScore: 0,
      weeklyTSS: 0,
      dailyPct: Array.from({ length: 7 }, () => 0),
      status: 'pending',
    }))
    return [you, ...crewStandings].sort((a, b) => b.weeklyScore - a.weeklyScore)
  }, [you, crew])

  const yourRank = standings.findIndex((s) => s.isYou) + 1
  const leaderScore = standings[0]?.weeklyScore ?? 0
  const yourScore = you.weeklyScore
  const behindLeader = yourRank > 1 ? Math.ceil(leaderScore - yourScore) : 0
  const countedMyScore = useCountUp(Math.round(yourScore), { duration: 900, enabled: true })

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (draft.trim()) {
      invite(draft)
      setDraft('')
    }
  }

  async function handleShare() {
    const ok = await shareInvite(yourScore, locale)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  const onTop = yourRank === 1 && standings.length > 1

  // No crew yet → show a clean create-your-crew flow above everything.
  // The Squad Cup mechanic only makes sense once a crew exists; before
  // that the standings would just be "you alone" which is exactly what
  // Today + Train already show.
  if (!myCrewLoading && !hasCrew) {
    return (
      <div className="flex flex-col gap-6 min-w-0 max-w-xl">
        <div
          className="rounded-[20px] px-6 py-7"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
            backgroundImage: `radial-gradient(80% 60% at 0% 0%, color-mix(in srgb, var(--color-forest-2) 10%, transparent), transparent 60%)`,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={14} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
            <span className="eyebrow" style={{ color: 'var(--color-ink)', letterSpacing: '0.24em', fontSize: 10, fontWeight: 600 }}>
              {t('start_your_squad_cup')}
            </span>
          </div>
          <h2
            className="leading-[1.1] mb-2"
            style={{
              fontFamily: 'var(--font-serif, serif)',
              fontStyle: 'italic',
              fontSize: 'clamp(22px, 3vw, 30px)',
              color: 'var(--color-ink)',
            }}
          >
            {t('riders_go_further')}
          </h2>
          <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--color-ink-2)' }}>
            {t('squad_cup_pitch')}
          </p>
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
              className="flex-1 min-w-[200px] px-3 py-2 rounded-md text-[13px]"
              style={{
                backgroundColor: 'var(--color-paper)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-rule)',
              }}
              aria-label={locale === 'de' ? 'Crew-Name' : 'Crew name'}
            />
            <button
              type="submit"
              disabled={!crewNameDraft.trim() || createCrew.isPending}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px] disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-forest-2)',
                color: 'var(--color-paper)',
                boxShadow: '0 1px 8px color-mix(in srgb, var(--color-forest-2) 35%, transparent)',
              }}
            >
              {createCrew.isPending ? t('creating') : t('create_crew')}
              <UserPlus size={14} strokeWidth={2} />
            </button>
          </form>
          {createCrew.isError && (
            <p className="mt-2 text-[12px]" style={{ color: 'var(--color-bad)' }}>
              {t('create_crew_error')}
            </p>
          )}
        </div>

        <div
          className="rounded-[20px] px-5 py-6 text-center"
          style={{ border: '1px dashed var(--color-rule)' }}
        >
          <Flame size={16} strokeWidth={2} style={{ color: 'var(--color-amber)' }} />
          <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--color-muted)' }}>
            {t('solo_laps_copy')}
            <br />
            <span style={{ color: 'var(--color-ink-2)' }}>
              {t('consistency_24x')}
            </span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 min-w-0">
      {/* ── Squad Cup banner — the 7-day competition frame ────────── */}
      <div
        className="relative paper-grain rounded-[22px] overflow-hidden"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: onTop
            ? '1px solid rgba(255, 214, 10, 0.35)'
            : '1px solid var(--color-rule)',
          backgroundImage: onTop
            ? `radial-gradient(100% 80% at 100% 0%, rgba(255, 214, 10, 0.14), transparent 55%)`
            : `radial-gradient(80% 60% at 0% 0%, color-mix(in srgb, var(--color-forest-2) 9%, transparent), transparent 55%)`,
        }}
      >
        <div className="px-6 py-6 sm:px-8 sm:py-7 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Trophy
                size={14}
                strokeWidth={2}
                style={{ color: onTop ? '#FFD60A' : 'var(--color-forest-2)' }}
              />
              <span
                className="eyebrow"
                style={{ color: 'var(--color-ink)', letterSpacing: '0.28em', fontSize: 10, fontWeight: 600 }}
              >
                {t('squad_cup_this_week')}
              </span>
            </div>
            <Countdown weekEnd={weekEnd} />
          </div>

          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="num-display leading-none"
              style={{
                fontSize: 'clamp(36px, 5vw, 52px)',
                color: onTop ? '#FFD60A' : 'var(--color-ink)',
                fontVariationSettings: '"opsz" 144, "wght" 500',
              }}
            >
              {countedMyScore}
            </span>
            <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.14em' }}>
              {t('points_label')}
            </span>
            {standings.length > 1 && (
              <span
                className="num-mono"
                style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.12em' }}
              >
                · {t('rank_label')} {yourRank} {t('of_label')} {standings.length}
              </span>
            )}
          </div>

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
            {onTop
              ? (locale === 'de'
                  ? 'Du führst das Feld an. Verteidige die Spitze — jeder TSS zählt bis Sonntag.'
                  : "You're leading the pack. Defend the throne — every daily TSS matters until Sunday.")
              : behindLeader > 0 && standings.length > 1
                ? (locale === 'de'
                    ? `${behindLeader} Punkte hinter der Spitze. Eine ${Math.ceil((behindLeader / 100) * dailyTarget)}-TSS-Einheit schließt die Lücke.`
                    : `${behindLeader} points behind the leader. A ${Math.ceil((behindLeader / 100) * dailyTarget)}-TSS session closes the gap.`)
                : (locale === 'de'
                    ? 'Sammle jeden Tag Punkte — erreiche dein tägliches TSS-Ziel und du bekommst 100. Maximum sind 150% pro Tag.'
                    : 'Earn points each day — hit your daily TSS target and you bank 100. Cap is 150% per day.')}
          </p>

          {/* Points calc legend */}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.12em' }}>
              {locale === 'de'
                ? `TAGESZIEL ${dailyTarget} TSS · 150% MAX · 7 TAGE`
                : `DAILY TARGET ${dailyTarget} TSS · 150% CAP · 7 DAYS`}
            </span>
          </div>
        </div>
      </div>

      {/* ── Leaderboard ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}
          >
            {locale === 'de' ? 'Rangliste' : 'Standings'} · {standings.length}
          </span>
          <span
            className="eyebrow hidden sm:inline"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}
          >
            {locale === 'de' ? 'MO → SO · PKT' : 'MON → SUN · PTS'}
          </span>
        </div>
        {standings.map((s, i) => (
          <StandingRow key={s.id} standing={s} rank={i + 1} />
        ))}
      </div>

      {/* ── Invite card ──────────────────────────────────────────── */}
      <div
        className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-6"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      >
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
              {locale === 'de'
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
            placeholder={locale === 'de' ? 'Name oder Handle' : 'Name or handle'}
            className="flex-1 px-3 py-2.5 rounded-[12px] text-[14px]"
            style={{
              backgroundColor: 'var(--color-paper)',
              border: '1px solid var(--color-rule)',
              color: 'var(--color-ink)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="px-4 py-2.5 rounded-[12px] text-[13px] font-medium transition-opacity"
            style={{
              backgroundColor: '#30D158',
              color: '#0C0C0E',
              opacity: draft.trim() ? 1 : 0.5,
            }}
          >
            {locale === 'de' ? 'Hinzufügen' : 'Add'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleShare}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[12px] text-[13px] font-medium transition-all"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--color-rule)',
            color: copied ? '#30D158' : 'var(--color-ink-2)',
          }}
        >
          {copied ? (
            <>
              <CheckCircle2 size={14} strokeWidth={2} />
              {locale === 'de' ? 'Einladungslink kopiert' : 'Invite link copied'}
            </>
          ) : (
            <>
              <Link2 size={14} strokeWidth={2} />
              {t('share_invite_link')}
            </>
          )}
        </button>
      </div>

      {/* ── Crew management ──────────────────────────────────────── */}
      {crew.length > 0 && (
        <div className="flex flex-col gap-2">
          <span
            className="eyebrow px-1"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}
          >
            {locale === 'de' ? 'Crew verwalten' : 'Manage crew'} · {crew.length}
          </span>
          {crew.map((m: CrewMember) => (
            <div
              key={m.id}
              className="flex items-center justify-between px-4 py-2.5 rounded-[12px] group"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                border: '1px solid var(--color-rule)',
              }}
            >
              <span className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>{m.handle}</span>
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-muted)' }}
                aria-label={locale === 'de' ? `${m.handle} entfernen` : `Remove ${m.handle}`}
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty-state nudge */}
      {crew.length === 0 && (
        <div
          className="rounded-[20px] px-5 py-6 text-center flex flex-col items-center gap-2"
          style={{
            border: '1px dashed var(--color-rule)',
          }}
        >
          <Flame size={16} strokeWidth={2} style={{ color: 'var(--color-amber)' }} />
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            {t('solo_laps_copy')}
            <br />
            <span style={{ color: 'var(--color-ink-2)' }}>{t('consistency_24x')}</span>
          </p>
        </div>
      )}
    </div>
  )
}
