/**
 * SocialTab — rebuilt 1:1 against the Pencil "Community" design. Renders, top to
 * bottom: a header (crew eyebrow + title + invite/notifications actions), a jump
 * chip row (Battles · Segments · Challenges · Feed), the weekly Battle scorecard
 * (you vs rival across 6 real weekly metrics), the normalized Crew Leaderboard,
 * a Segments card, a Challenges card, the crew Feed, and a Club card. Every
 * number comes from real duel/standings data. Cards whose data the backend does
 * not yet expose (GPS segment leaderboards, rich activity feed with kudos)
 * render the real structure with honest "—"/empty notes — never fabricated.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Swords, Trophy, Flame, Check, Users, UserPlus, Bell, Clock,
  Hand, Scale, Info, BarChart3, Bike, MessageCircle, Share2, ChevronRight,
  Mountain, Search, X, Send, LogOut, Plus, Sparkles, Inbox, Target, Trash2,
} from 'lucide-react'
import {
  useDuel, useCrewStandings, useMyCrew, useCreateCrew, useLeaveCrew,
} from '../../../hooks/useCrew'
import type { DuelStats, CrewPeriod, StandingRow } from '../../../api/crew'
import {
  useDiscover, useIncomingInvites, useConnect, useAcceptInvite, useDeclineInvite,
} from '../../../hooks/useConnections'
import type { IncomingInvite, DiscoverResult } from '../../../api/connections'
import {
  useIncomingNudges, useSendNudge, useMarkNudgeRead,
} from '../../../hooks/useNudges'
import type { IncomingNudge } from '../../../api/nudges'
import {
  useCrewChallenges, useCreateChallenge, useDeleteChallenge,
} from '../../../hooks/useChallenges'
import type {
  ChallengeMetric, ChallengePeriod, CrewChallenge, CreateChallengeInput,
} from '../../../api/challenges'
import CoachSafetyBanner from '../CoachSafetyBanner'
import { useLocale } from '../../../contexts/LocaleContext'
import { useAuth } from '../../../contexts/AuthContext'
import { celebrate } from '../../../lib/confetti'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

// Crew-leaderboard window options + their copy (subtitle prefix + row suffix).
const BOARD_PERIODS: { id: CrewPeriod; en: string; de: string; phraseEn: string; phraseDe: string }[] = [
  { id: 'day', en: 'Day', de: 'Tag', phraseEn: 'today', phraseDe: 'heute' },
  { id: 'week', en: 'Week', de: 'Woche', phraseEn: 'this week', phraseDe: 'diese Woche' },
  { id: 'month', en: 'Month', de: 'Monat', phraseEn: 'this month', phraseDe: 'diesen Monat' },
  { id: 'year', en: 'Year', de: 'Jahr', phraseEn: 'this year', phraseDe: 'dieses Jahr' },
]
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Crew-leaderboard ranking metrics. `live` chips re-rank + relabel the board
// off real per-member data over the selected window; disabled chips (Elev,
// 5K PR) have no data source yet and are greyed out honestly.
type BoardMetricId = 'load' | 'distance' | 'wkg' | 'vo2max' | 'elev' | 'pr5k'
interface BoardMetric {
  id: BoardMetricId
  en: string
  de: string
  live: boolean
  unit?: string
  unitDe?: string
  value?: (s: StandingRow) => number | null
  fmt?: (v: number) => string
}
const BOARD_METRICS: BoardMetric[] = [
  { id: 'load', en: 'Load', de: 'Last', live: true, unit: 'pts', unitDe: 'Pkt',
    value: (s) => s.weekly_score, fmt: (v) => `${Math.round(v)}` },
  { id: 'distance', en: 'Distance', de: 'Distanz', live: true, unit: 'km', unitDe: 'km',
    value: (s) => s.distance_km ?? null, fmt: (v) => `${Math.round(v)}` },
  { id: 'wkg', en: 'W/kg', de: 'W/kg', live: true, unit: 'W/kg', unitDe: 'W/kg',
    value: (s) => s.wkg ?? null, fmt: (v) => v.toFixed(1) },
  { id: 'vo2max', en: 'VO2max', de: 'VO2max', live: true, unit: 'ml/kg', unitDe: 'ml/kg',
    value: (s) => s.vo2max ?? null, fmt: (v) => v.toFixed(1) },
  { id: 'elev', en: 'Elev', de: 'Höhe', live: false },
  { id: 'pr5k', en: '5K PR', de: '5K-Best', live: false },
]

const innerStyle = { background: 'var(--color-surface-2)' } as const

// Weekly personal load-challenge target (TSS). A round, honest weekly-volume goal.
const LOAD_TARGET = 800

// Challenges are personal/derived, so opting out of one is a client-side
// preference persisted to localStorage (hidden ids), with a re-add affordance.
const HIDDEN_CHALLENGES_KEY = 'social:hiddenChallenges'
function readHiddenChallenges(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_CHALLENGES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function writeHiddenChallenges(ids: string[]) {
  try {
    localStorage.setItem(HIDDEN_CHALLENGES_KEY, JSON.stringify(ids))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

// Crew-challenge completion is celebrated exactly once per challenge. The set
// of already-celebrated ids is persisted so a refresh (or a re-poll of a
// still-complete challenge) never re-fires confetti.
const CELEBRATED_CHALLENGES_KEY = 'social:celebratedChallenges'
function readCelebrated(): Set<number> {
  try {
    const raw = localStorage.getItem(CELEBRATED_CHALLENGES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === 'number') : [])
  } catch {
    return new Set()
  }
}
function writeCelebrated(ids: Set<number>) {
  try {
    localStorage.setItem(CELEBRATED_CHALLENGES_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

// Friendly metric labels for the create form + challenge cards.
const METRIC_OPTIONS: Array<{ value: ChallengeMetric; en: string; de: string }> = [
  { value: 'tss', en: 'TSS', de: 'TSS' },
  { value: 'distance_km', en: 'Distance (km)', de: 'Distanz (km)' },
  { value: 'active_days', en: 'Active days', de: 'Aktive Tage' },
  { value: 'hours', en: 'Hours', de: 'Stunden' },
  { value: 'kj', en: 'kJ', de: 'kJ' },
  { value: 'rides', en: 'Sessions', de: 'Einheiten' },
]
function metricLabel(metric: ChallengeMetric, de: boolean): string {
  const o = METRIC_OPTIONS.find((m) => m.value === metric)
  return o ? (de ? o.de : o.en) : metric
}
function fmtChallengeValue(metric: ChallengeMetric, n: number, de: boolean): string {
  if (metric === 'hours') return n.toFixed(1)
  if (metric === 'kj') return Math.round(n).toLocaleString(de ? 'de' : 'en')
  return `${Math.round(n)}`
}

// Avatar palette — deterministic per handle, from the token set.
const AV_COLORS = ['var(--color-move)', 'var(--color-stand)', 'var(--color-accent)', 'var(--color-strain)', 'var(--color-recovery)', 'var(--color-amber)']
const avColor = (h: string) => AV_COLORS[[...h].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_COLORS.length]
const initial = (h: string) => (h.trim()[0] ?? '?').toUpperCase()

function timeLeft(weekEnd: string | undefined, de: boolean): string {
  if (!weekEnd) return de ? '—' : '—'
  const diff = new Date(weekEnd).getTime() - Date.now()
  if (diff <= 0) return de ? 'Beendet' : 'Ended'
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  return de ? `${d}T ${h}h übrig` : `${d}d ${h}h left`
}

export default function SocialTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data: duel } = useDuel()
  const [boardPeriod, setBoardPeriod] = useState<CrewPeriod>('week')
  const [boardMetric, setBoardMetric] = useState<BoardMetricId>('load')
  const { data: standings } = useCrewStandings(boardPeriod)
  const { data: myCrew } = useMyCrew()

  // ── Connections: incoming invites + find people ──
  const { data: incoming } = useIncomingInvites()
  const invites = incoming ?? []
  const acceptInvite = useAcceptInvite()
  const declineInvite = useDeclineInvite()
  const [findOpen, setFindOpen] = useState(false)

  // ── Nudges: incoming trash-talk feed + send ──
  const { data: incomingNudges } = useIncomingNudges()
  const nudges = incomingNudges ?? []
  const markNudge = useMarkNudgeRead()
  const sendNudge = useSendNudge()
  const [nudgeSent, setNudgeSent] = useState<string | null>(null)

  // ── Crew membership mutations ──
  const leaveCrew = useLeaveCrew()
  const [leaveConfirm, setLeaveConfirm] = useState(false)

  // ── Inbox (bell) + battle details toggles ──
  const [inboxOpen, setInboxOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const inboxCount = invites.length + nudges.length

  // ── Challenges opt-out (localStorage) ──
  const [hiddenChallenges, setHiddenChallenges] = useState<string[]>(() => readHiddenChallenges())
  const hideChallenge = (id: string) =>
    setHiddenChallenges((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id]
      writeHiddenChallenges(next)
      return next
    })
  const restoreChallenge = (id: string) =>
    setHiddenChallenges((prev) => {
      const next = prev.filter((x) => x !== id)
      writeHiddenChallenges(next)
      return next
    })

  // ── Crew Challenges (custom, crew-wide) ──
  const { user } = useAuth()
  const myId = user?.id
  const { data: crewChallenges } = useCrewChallenges()
  const challenges = crewChallenges ?? []
  const createChallenge = useCreateChallenge()
  const deleteChallenge = useDeleteChallenge()
  const [challengeFormOpen, setChallengeFormOpen] = useState(false)
  const [celebrateName, setCelebrateName] = useState<string | null>(null)

  // Track which of MY completed challenges have already been celebrated, so
  // confetti + toast fire exactly once per challenge.
  const celebratedRef = useRef<Set<number> | null>(null)
  const seededRef = useRef(false)
  useEffect(() => {
    if (myId == null || !crewChallenges) return
    // First data arrival: SEED the seen-set from localStorage and mark every
    // already-complete challenge as celebrated WITHOUT firing — pre-done
    // challenges must not spam on load/refresh.
    if (!seededRef.current) {
      const seen = readCelebrated()
      for (const c of crewChallenges) {
        const me = c.participants.find((p) => p.user_id === myId)
        if (me?.reached) seen.add(c.id)
      }
      celebratedRef.current = seen
      writeCelebrated(seen)
      seededRef.current = true
      return
    }
    // Subsequent polls: a fresh transition to reached for MY row → celebrate.
    const seen = celebratedRef.current ?? readCelebrated()
    for (const c of crewChallenges) {
      const me = c.participants.find((p) => p.user_id === myId)
      if (me?.reached && !seen.has(c.id)) {
        seen.add(c.id)
        writeCelebrated(seen)
        celebrate()
        setCelebrateName(c.name)
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(de ? `🏆 Challenge geschafft: ${c.name}!` : `🏆 Challenge complete: ${c.name}!`)
          } catch {
            /* ignore notification construction errors */
          }
        }
      }
    }
    celebratedRef.current = seen
  }, [crewChallenges, myId, de])

  const you = duel?.you_this_week
  const hasCrew = !!(duel?.crew && duel.crew.length > 0)
  const rival: DuelStats | undefined = hasCrew ? duel!.crew[0] : duel?.you_last_week
  const rivalIsPast = !hasCrew
  const crewSize = hasCrew ? duel!.crew.length + 1 : 0
  // Opponent to nudge — only a real crew rival (never "Past You").
  const opponentId = !rivalIsPast && rival?.user_id ? rival.user_id : undefined

  function onNudge() {
    if (!opponentId) return
    sendNudge.mutate(opponentId, {
      onSuccess: (res) => setNudgeSent(res.text),
    })
  }

  function onBellClick() {
    setInboxOpen((v) => !v)
    requestAnimationFrame(() => inboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function onOpenFinder() {
    setFindOpen(true)
    requestAnimationFrame(() => finderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // ── Battle: 6-metric weekly scorecard ──
  const metrics = useMemo(() => {
    if (!you || !rival) return []
    const def: Array<{ key: keyof DuelStats; label: string; fmt: (n: number) => string; color: string }> = [
      { key: 'distance_km', label: de ? 'Distanz · km' : 'Distance · km', fmt: (n) => `${Math.round(n)}`, color: 'var(--color-strain)' },
      { key: 'tss', label: de ? 'Last · TSS' : 'Load · TSS', fmt: (n) => `${Math.round(n)}`, color: 'var(--color-accent)' },
      { key: 'hours', label: de ? 'Zeit · h' : 'Active · h', fmt: (n) => n.toFixed(1), color: 'var(--color-recovery)' },
      { key: 'kj', label: de ? 'Energie · kJ' : 'Energy · kJ', fmt: (n) => Math.round(n).toLocaleString(de ? 'de' : 'en'), color: 'var(--color-amber)' },
      { key: 'rides', label: de ? 'Einheiten' : 'Sessions', fmt: (n) => `${Math.round(n)}`, color: 'var(--color-exercise)' },
      { key: 'best_tss', label: de ? 'Beste · TSS' : 'Best · TSS', fmt: (n) => `${Math.round(n)}`, color: 'var(--color-move)' },
    ]
    return def.map((d) => {
      const yv = Number(you[d.key] ?? 0)
      const rv = Number(rival[d.key] ?? 0)
      return { ...d, yv, rv, youWin: yv >= rv }
    })
  }, [you, rival, de])
  const youScore = metrics.filter((m) => m.youWin).length * 10
  const rivalScore = metrics.filter((m) => !m.youWin).length * 10

  // Copy for the selected leaderboard window (subtitle prefix + row suffix).
  const boardPhrase = BOARD_PERIODS.find((p) => p.id === boardPeriod) ?? BOARD_PERIODS[1]

  // Active ranking metric (falls back to Load if a disabled chip is somehow set).
  const boardMetricDef = useMemo(
    () => BOARD_METRICS.find((m) => m.id === boardMetric && m.live) ?? BOARD_METRICS[0],
    [boardMetric],
  )

  // ── Leaderboard rows (real standings, ranked by the selected metric desc;
  // members missing a value sort last, then by weekly score as a tiebreak) ──
  const board = useMemo(() => {
    const rows: StandingRow[] = standings?.standings ? [...standings.standings] : []
    const val = boardMetricDef.value!
    return rows.sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      const an = av == null
      const bn = bv == null
      if (an && bn) return b.weekly_score - a.weekly_score
      if (an) return 1
      if (bn) return -1
      if (bv !== av) return (bv as number) - (av as number)
      return b.weekly_score - a.weekly_score
    })
  }, [standings, boardMetricDef])

  // ── Feed: crew this week ──
  const feed = duel?.crew ?? []

  // ── Club summary ──
  const clubName = myCrew?.crew?.name
  const combinedKm = useMemo(() => {
    if (!hasCrew) return 0
    const crewSum = duel!.crew.reduce((s, c) => s + Number(c.distance_km ?? 0), 0)
    return Math.round(crewSum + Number(you?.distance_km ?? 0))
  }, [hasCrew, duel, you])

  // ── Challenges (real) ──
  const loadPct = you ? Math.min(100, Math.round((you.tss / LOAD_TARGET) * 100)) : 0
  const daysPct = you ? Math.round((you.active_days / 7) * 100) : 0

  // ── Jump chips → smooth-scroll anchors ──
  const battleRef = useRef<HTMLDivElement>(null)
  const segmentsRef = useRef<HTMLDivElement>(null)
  const challengeRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const inboxRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const finderRef = useRef<HTMLDivElement>(null)
  const CHIPS: Array<{ label: string; ref: React.RefObject<HTMLDivElement | null>; active?: boolean }> = [
    { label: de ? 'Duelle' : 'Battles', ref: battleRef, active: true },
    { label: 'Segments', ref: segmentsRef },
    { label: 'Challenges', ref: challengeRef },
    { label: 'Feed', ref: feedRef },
  ]

  return (
    <div className="flex flex-col gap-5 pb-6">
      <CoachSafetyBanner />

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow" style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>
            {hasCrew ? (de ? `DEINE CREW · ${crewSize} FREUNDE` : `YOUR CREW · ${crewSize} FRIENDS`) : (de ? 'DEINE CREW' : 'YOUR CREW')}
          </span>
          <h1 className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)' }}>Community</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onOpenFinder} aria-label={de ? 'Fahrer einladen' : 'Invite riders'} className="grid place-items-center rounded-full" style={{ width: 44, height: 44, ...cardStyle }}>
            <UserPlus size={20} style={{ color: 'var(--color-ink-2)' }} />
          </button>
          <button type="button" onClick={onBellClick} aria-label={de ? 'Postfach' : 'Inbox'} className="relative grid place-items-center rounded-full" style={{ width: 44, height: 44, background: inboxOpen ? 'var(--color-accent)' : 'var(--color-paper-2)', border: `1px solid ${inboxOpen ? 'var(--color-accent)' : 'var(--color-rule)'}` }}>
            <Bell size={20} style={{ color: inboxOpen ? 'var(--color-ink)' : 'var(--color-ink-2)' }} />
            {inboxCount > 0 && (
              <span className="num-mono grid place-items-center rounded-full" style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px', fontSize: 10, fontWeight: 700, color: 'var(--color-ink)', background: 'var(--color-strain)', border: '2px solid var(--color-paper-2)' }}>
                {inboxCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── INBOX: incoming nudges + invites (toggled by the Bell) ── */}
      <div ref={inboxRef}>
        {(inboxOpen || inboxCount > 0) && (
          <div className="flex flex-col gap-2.5">
            {nudges.map((n) => (
              <NudgeCard key={n.id} n={n} de={de} onDismiss={() => markNudge.mutate(n.id)} dismissing={markNudge.isPending && markNudge.variables === n.id} />
            ))}
            {invites.map((inv) => (
              <InviteCard
                key={inv.invite_id}
                inv={inv}
                de={de}
                onAccept={() => acceptInvite.mutate(inv.invite_id)}
                onDecline={() => declineInvite.mutate(inv.invite_id)}
                accepting={acceptInvite.isPending && acceptInvite.variables === inv.invite_id}
                declining={declineInvite.isPending && declineInvite.variables === inv.invite_id}
              />
            ))}
            {inboxCount === 0 && (
              <div className="rounded-[24px] p-5 flex items-center gap-3" style={cardStyle}>
                <span className="grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, ...innerStyle }}>
                  <Inbox size={20} style={{ color: 'var(--color-muted)' }} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Keine Nachrichten' : 'No invites right now'}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Einladungen und Anstupser erscheinen hier.' : 'Invites and nudges show up here.'}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── FILTERS / JUMP CHIPS ── */}
      <div className="flex gap-2">
        {CHIPS.map(({ label, ref, active }) => (
          <button key={label} type="button" onClick={() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex-1 inline-flex items-center justify-center rounded-full py-2.5"
            style={{
              background: active ? 'var(--color-accent)' : 'var(--color-paper-2)',
              border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-rule)'}`,
              color: active ? 'var(--color-ink)' : 'var(--color-ink-2)',
              fontSize: 12, fontWeight: 600,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── BATTLE HERO ── */}
      <div ref={battleRef}>
        {you && rival ? (
          <div className="rounded-[24px] p-5 flex flex-col gap-4 hover-card" style={{ ...cardStyle, borderColor: 'var(--color-accent)' }}>
            {/* Head */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[7px]">
                <Swords size={18} style={{ color: 'var(--color-accent)' }} />
                <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Wochenduell' : 'Weekly Battle'}</span>
                <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-accent)' }} /></span>
              </div>
              <div className="inline-flex items-center gap-[5px] rounded-full" style={{ background: 'var(--color-surface-2)', padding: '5px 10px' }}>
                <Clock size={13} style={{ color: 'var(--color-amber)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)' }}>{timeLeft(duel?.week_end, de)}</span>
              </div>
            </div>

            {/* Face-off */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center gap-[7px] flex-1">
                <span className="num-display grid place-items-center rounded-full" style={{ width: 56, height: 56, fontSize: 20, color: 'var(--color-ink)', background: 'var(--color-accent)', border: '3px solid var(--color-accent)' }}>{initial(you.handle || 'You')}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Du' : 'You'}</span>
                <span className="num-display" style={{ fontSize: 30, color: youScore >= rivalScore ? 'var(--color-accent)' : 'var(--color-muted)' }}>{youScore}</span>
              </div>
              <div className="flex flex-col items-center gap-[3px]">
                <span className="eyebrow" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'PUNKTE' : 'BATTLE PTS'}</span>
                <span className="num-display grid place-items-center rounded-full" style={{ width: 38, height: 38, fontSize: 13, color: 'var(--color-muted)', background: 'var(--color-surface-2)' }}>VS</span>
              </div>
              <div className="flex flex-col items-center gap-[7px] flex-1">
                <span className="num-display grid place-items-center rounded-full" style={{ width: 56, height: 56, fontSize: 20, color: 'var(--color-ink)', background: 'var(--color-strain)' }}>{initial(rivalIsPast ? (de ? 'Du' : 'You') : rival.handle)}</span>
                <span className="truncate" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)', maxWidth: 90 }}>{rivalIsPast ? (de ? 'Du letzte Wo.' : 'Past You') : rival.handle}</span>
                <span className="num-display" style={{ fontSize: 30, color: rivalScore > youScore ? 'var(--color-strain)' : 'var(--color-muted)' }}>{rivalScore}</span>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--color-rule)' }} />

            {/* Table head */}
            <div className="flex items-center gap-2.5">
              <span className="eyebrow flex-1" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'WERTUNG JE METRIK' : 'SCORE BY METRIC'}</span>
              <span className="eyebrow text-right" style={{ fontSize: 10, color: 'var(--color-accent)', width: 64 }}>{de ? 'DU' : 'YOU'}</span>
              <span className="eyebrow text-right truncate" style={{ fontSize: 10, color: 'var(--color-strain)', width: 64 }}>{(rivalIsPast ? (de ? 'DU' : 'PAST') : rival.handle).toUpperCase()}</span>
            </div>

            {/* Metric rows */}
            {metrics.map((m) => (
              <div key={m.key} className="flex items-center gap-2.5" style={{ padding: '3px 0' }}>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: m.youWin ? 'var(--color-accent)' : 'var(--color-strain)', flexShrink: 0 }} />
                  <span className="truncate" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{m.label}</span>
                </div>
                <span className="num-mono text-right inline-flex items-center justify-end gap-1" style={{ fontSize: 14, fontWeight: 700, color: m.youWin ? 'var(--color-accent)' : 'var(--color-muted)', width: 64 }}>
                  {m.fmt(m.yv)}{m.youWin && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="num-mono text-right" style={{ fontSize: 14, fontWeight: 700, color: !m.youWin ? 'var(--color-strain)' : 'var(--color-muted)', width: 64 }}>{m.fmt(m.rv)}</span>
              </div>
            ))}

            {/* Hover: per-metric head-to-head margin */}
            <div className="hover-reveal">
              <div className="rounded-[12px] flex flex-col gap-2" style={{ background: 'var(--color-surface-2)', padding: '11px 12px' }}>
                <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'VORSPRUNG JE METRIK' : 'HEAD-TO-HEAD MARGIN'}</span>
                {metrics.map((m) => (
                  <div key={m.key} className="flex items-center gap-2.5">
                    <span className="truncate flex-1" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{m.label}</span>
                    <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: m.youWin ? 'var(--color-accent)' : 'var(--color-strain)' }}>
                      {m.fmt(Math.abs(m.yv - m.rv))} {m.youWin ? (de ? 'vorn' : 'ahead') : (de ? 'zurück' : 'behind')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.4 }}>
              {de ? '6 Metriken · je 10 Punkte · Wochensieger gewinnt.' : '6 metrics · each metric worth 10 pts · winner takes the week.'}
            </p>

            {/* Tap-to-expand head-to-head margin (mirrors the hover panel for touch) */}
            {detailsOpen && (
              <div className="rounded-[12px] flex flex-col gap-2" style={{ background: 'var(--color-surface-2)', padding: '11px 12px' }}>
                <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'VORSPRUNG JE METRIK' : 'HEAD-TO-HEAD MARGIN'}</span>
                {metrics.map((m) => (
                  <div key={m.key} className="flex items-center gap-2.5">
                    <span className="truncate flex-1" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{m.label}</span>
                    <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: m.youWin ? 'var(--color-accent)' : 'var(--color-strain)' }}>
                      {m.fmt(Math.abs(m.yv - m.rv))} {m.youWin ? (de ? 'vorn' : 'ahead') : (de ? 'zurück' : 'behind')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <div className="flex gap-2.5">
              <button type="button" onClick={() => setDetailsOpen((v) => !v)} className="flex-1 inline-flex items-center justify-center gap-[7px] rounded-full" style={{ background: 'var(--color-surface-2)', padding: 13 }}>
                <BarChart3 size={17} style={{ color: 'var(--color-ink-2)' }} />
                <span className="num-display" style={{ fontSize: 14, color: 'var(--color-ink-2)' }}>{de ? (detailsOpen ? 'Details schließen' : 'Duell-Details') : (detailsOpen ? 'Hide details' : 'Battle details')}</span>
              </button>
              <button type="button" onClick={onNudge} disabled={!opponentId || sendNudge.isPending} title={!opponentId ? (de ? 'Anstupsen sobald du einen Crew-Rivalen hast' : 'Nudge works once you have a crew rival') : undefined} className="inline-flex items-center justify-center gap-1.5 rounded-full" style={{ background: 'var(--color-accent)', padding: '13px 18px', opacity: !opponentId || sendNudge.isPending ? 0.5 : 1 }}>
                <Hand size={17} style={{ color: 'var(--color-ink)' }} />
                <span className="num-display" style={{ fontSize: 14, color: 'var(--color-ink)' }}>{de ? 'Anstupsen' : 'Nudge'}</span>
              </button>
            </div>

            {/* Nudge confirmation — shows the funny line the server sent */}
            {nudgeSent && (
              <div className="rounded-[12px] flex items-start gap-2" style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', padding: '10px 12px' }}>
                <Send size={14} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: 2 }} />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-accent)' }}>
                    {de ? `GESENDET AN ${(rival?.handle ?? '').toUpperCase()}` : `SENT TO ${(rival?.handle ?? '').toUpperCase()}`}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.35 }}>“{nudgeSent}”</span>
                </div>
                <button type="button" onClick={() => setNudgeSent(null)} aria-label={de ? 'Schließen' : 'Dismiss'} className="grid place-items-center shrink-0">
                  <X size={15} style={{ color: 'var(--color-muted)' }} />
                </button>
              </div>
            )}
            {sendNudge.isError && (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Anstupsen fehlgeschlagen — versuch es nochmal.' : 'Nudge failed — try again.'}</span>
            )}
          </div>
        ) : (
          <EmptyCrew de={de} onFind={onOpenFinder} />
        )}
      </div>

      {/* ── LEADERBOARD ── */}
      <div ref={boardRef} className="rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Crew-Rangliste' : 'Crew Leaderboard'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? `${capFirst(boardPhrase.de)} · ${hasCrew ? crewSize : '—'} Freunde` : `${capFirst(boardPhrase.en)} · ${hasCrew ? `your ${crewSize} friends` : 'your crew'}`}</span>
          </div>
          <div className="inline-flex items-center gap-[5px] rounded-full" style={{ background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)', padding: '5px 10px' }}>
            <Scale size={13} style={{ color: 'var(--color-recovery)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-recovery)' }}>{de ? 'Normalisiert' : 'Normalized'}</span>
          </div>
        </div>

        {/* Day / Week / Month / Year window toggle */}
        <div className="flex gap-1 rounded-full" style={{ background: 'var(--color-surface-2)', padding: 3 }}>
          {BOARD_PERIODS.map((p) => {
            const active = p.id === boardPeriod
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setBoardPeriod(p.id)}
                aria-pressed={active}
                className="flex-1 rounded-full"
                style={{
                  padding: '7px 4px', fontSize: 12,
                  fontWeight: active ? 700 : 600,
                  color: active ? 'var(--color-ink)' : 'var(--color-ink-2)',
                  background: active ? 'var(--color-paper-2)' : 'transparent',
                  border: active ? '1px solid var(--color-rule)' : '1px solid transparent',
                  transition: 'color 120ms, background 120ms',
                }}
              >{de ? p.de : p.en}</button>
            )
          })}
        </div>

        {/* Metric chips — a real ranking selector. Live chips re-rank + relabel
            the board off real per-member data; Elev & 5K PR are greyed out
            (no data source yet). */}
        <div className="flex gap-1.5">
          {BOARD_METRICS.map((m) => {
            const active = m.live && m.id === boardMetric
            return (
              <button
                key={m.id}
                type="button"
                disabled={!m.live}
                onClick={() => m.live && setBoardMetric(m.id)}
                aria-pressed={active}
                title={!m.live ? (de ? 'Noch nicht erfasst' : 'Not tracked yet') : undefined}
                className="flex-1 text-center rounded-full"
                style={{
                  background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                  color: active ? 'var(--color-ink)' : m.live ? 'var(--color-ink-2)' : 'var(--color-muted)',
                  padding: '8px 4px', fontSize: 11, fontWeight: active ? 700 : 600,
                  opacity: m.live ? 1 : 0.5,
                  cursor: m.live ? 'pointer' : 'not-allowed',
                  transition: 'color 120ms, background 120ms',
                }}
              >{de ? m.de : m.en}</button>
            )
          })}
        </div>

        {/* Ranking note — reflects the live metric + honest gaps */}
        <div className="flex items-center gap-1.5 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '8px 11px' }}>
          <Info size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.35 }}>
            {de
              ? `Gewertet nach ${boardMetricDef.de} · ${boardPhrase.phraseDe}. Höhenmeter & 5K-Best werden noch nicht erfasst.`
              : `Ranked by ${boardMetricDef.en} · ${boardPhrase.phraseEn}. Elevation & 5K PR aren't tracked yet.`}
          </span>
        </div>

        {board.length > 0 ? (
          <>
            {board.map((s, i) => {
              const activeDays = s.daily_pct?.filter((d) => d > 0).length ?? 0
              const bucketCount = s.daily_pct?.length ?? 7
              // Prominent value + unit for the selected metric ("—" when missing).
              const metricRaw = boardMetricDef.value!(s)
              const metricShown = metricRaw == null ? '—' : boardMetricDef.fmt!(metricRaw)
              const metricUnit = de ? boardMetricDef.unitDe : boardMetricDef.unit
              // Gap to the leader, expressed in the selected metric (only when
              // both this row and the leader have a value).
              const leadRaw = boardMetricDef.value!(board[0])
              const gapToLead =
                leadRaw != null && metricRaw != null
                  ? `${boardMetricDef.fmt!(leadRaw - metricRaw)} ${metricUnit}`
                  : '—'
              return (
              <div key={s.user_id} className="hover-card flex flex-col rounded-[12px]" style={{ background: s.is_you ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent', padding: '8px 10px' }}>
                <div className="flex items-center gap-2.5">
                  <span className="num-display" style={{ fontSize: 14, width: 18, color: s.is_you ? 'var(--color-accent)' : 'var(--color-muted)' }}>{i + 1}</span>
                  <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 34, height: 34, fontSize: 14, color: 'var(--color-ink)', background: avColor(s.handle) }}>{initial(s.handle)}</span>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="truncate" style={{ fontSize: 14, fontWeight: s.is_you ? 700 : 600, color: 'var(--color-ink)' }}>{s.handle}{s.is_you && <span style={{ fontWeight: 500, color: 'var(--color-muted)' }}> · {de ? 'du' : 'you'}</span>}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{Math.round(s.weekly_tss)} TSS · {de ? boardPhrase.phraseDe : boardPhrase.phraseEn}</span>
                  </div>
                  <div className="flex items-end gap-[3px]">
                    <span className="num-display" style={{ fontSize: 19, color: metricRaw == null ? 'var(--color-muted)' : s.is_you ? 'var(--color-accent)' : 'var(--color-ink)' }}>{metricShown}</span>
                    {metricRaw != null && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', paddingBottom: 3 }}>{metricUnit}</span>}
                  </div>
                  <span className="hover-arrow"><ChevronRight size={15} style={{ color: 'var(--color-muted)' }} /></span>
                </div>
                {/* Hover: extra weekly stats + rank context */}
                <div className="hover-reveal">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-[10px]" style={{ background: 'var(--color-surface-2)', padding: '9px 11px' }}>
                    <MiniStat label={de ? 'RANG' : 'RANK'} value={`${i + 1} / ${board.length}`} />
                    <MiniStat label={de ? 'LAST' : 'LOAD'} value={`${Math.round(s.weekly_tss)} TSS`} />
                    <MiniStat label={de ? 'PUNKTE' : 'SCORE'} value={`${Math.round(s.weekly_score)}`} />
                    <MiniStat label={de ? 'AKTIV' : 'ACTIVE'} value={de ? `${activeDays}/${bucketCount} aktiv` : `${activeDays}/${bucketCount} active`} />
                    {i > 0 && <MiniStat label={de ? 'RÜCKSTAND' : 'TO LEAD'} value={gapToLead} />}
                  </div>
                </div>
              </div>
            )})}
            {boardMetric === 'load' && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? `Punkte = Anteil am Tagesziel (${Math.round(standings!.daily_target_tss)} TSS/Tag).` : `Score = share of the daily target (${Math.round(standings!.daily_target_tss)} TSS/day).`}</p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? 'Die Rangliste erscheint, sobald deine Crew fährt.' : 'The leaderboard fills once your crew rides.'}</p>
        )}
      </div>

      {/* ── SEGMENTS ── */}
      <div ref={segmentsRef} className="rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
        <div className="flex items-center justify-between">
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>Segments</span>
          <div className="inline-flex items-center gap-[5px] rounded-full" style={{ background: 'var(--color-surface-3)', padding: '4px 9px' }}>
            <Mountain size={12} style={{ color: 'var(--color-ink-2)' }} />
            <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-ink-2)' }}>{de ? 'GPS-SEGMENTE' : 'GPS SEGMENTS'}</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2.5 rounded-[14px] text-center" style={{ background: 'var(--color-surface-2)', padding: 18 }}>
          <span className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-3)' }}><BarChart3 size={20} style={{ color: 'var(--color-muted)' }} /></span>
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)', maxWidth: '34ch' }}>
            {de
              ? 'Segment-Rennen sind noch nicht verbunden — Bestzeiten & KOM-Duelle folgen, sobald GPS-Segmente live sind.'
              : "Segment racing isn't connected yet — your PRs and KOM duels appear once GPS segments go live."}
          </p>
        </div>
      </div>

      {/* ── CHALLENGES ── */}
      <div ref={challengeRef} className="rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
        <div className="flex items-center justify-between">
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>Challenges</span>
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'CREW · PERSÖNLICH' : 'CREW · PERSONAL'}</span>
        </div>

        {/* ── CREW CHALLENGES (custom, crew-wide) ── */}
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--color-ink-2)' }}>{de ? 'CREW-CHALLENGES' : 'CREW CHALLENGES'}</span>
          <button type="button" onClick={() => setChallengeFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full shrink-0" style={{ background: challengeFormOpen ? 'var(--color-surface-2)' : 'var(--color-accent)', padding: '7px 13px' }}>
            {challengeFormOpen ? <X size={14} style={{ color: 'var(--color-ink-2)' }} /> : <Plus size={14} style={{ color: 'var(--color-ink)' }} />}
            <span className="num-display" style={{ fontSize: 12, color: challengeFormOpen ? 'var(--color-ink-2)' : 'var(--color-ink)' }}>
              {challengeFormOpen ? (de ? 'Abbrechen' : 'Cancel') : (de ? '+ Neue Challenge' : '+ New challenge')}
            </span>
          </button>
        </div>

        {celebrateName && (
          <div className="rounded-[12px] flex items-start gap-2" style={{ background: 'color-mix(in srgb, var(--color-recovery) 16%, transparent)', padding: '10px 12px' }}>
            <Trophy size={16} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 1 }} />
            <span className="flex-1 min-w-0" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.35 }}>
              {de ? `🏆 Challenge geschafft: ${celebrateName}!` : `🏆 Challenge complete: ${celebrateName}!`}
            </span>
            <button type="button" onClick={() => setCelebrateName(null)} aria-label={de ? 'Schließen' : 'Dismiss'} className="grid place-items-center shrink-0">
              <X size={15} style={{ color: 'var(--color-muted)' }} />
            </button>
          </div>
        )}

        {challengeFormOpen && (
          <NewChallengeForm
            de={de}
            pending={createChallenge.isPending}
            error={createChallenge.isError}
            onSubmit={(input) =>
              createChallenge.mutate(input, { onSuccess: () => setChallengeFormOpen(false) })
            }
          />
        )}

        {challenges.length > 0 ? (
          challenges.map((c) => (
            <CrewChallengeCard
              key={c.id}
              c={c}
              myId={myId}
              de={de}
              onDelete={() => deleteChallenge.mutate(c.id)}
              deleting={deleteChallenge.isPending && deleteChallenge.variables === c.id}
            />
          ))
        ) : (
          <div className="flex items-center gap-2.5 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '12px 12px' }}>
            <Target size={16} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.35 }}>
              {de ? 'Noch keine Crew-Challenges — erstelle eine, um gegeneinander anzutreten.' : 'No crew challenges yet — create one to compete.'}
            </span>
          </div>
        )}

        <div style={{ height: 1, background: 'var(--color-rule)' }} />
        <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--color-ink-2)' }}>{de ? 'PERSÖNLICH' : 'PERSONAL'}</span>

        {you ? (
          <>
            {!hiddenChallenges.includes('load') && (
              <ChallengeRow icon={Trophy} color="var(--color-amber)" name={de ? 'Wochen-Last' : 'Weekly Load'} sub={de ? 'persönlich' : 'personal'} pct={loadPct} progress={`${Math.round(you.tss)} / ${LOAD_TARGET} TSS`} detail={de ? `Noch ${Math.max(0, LOAD_TARGET - Math.round(you.tss))} TSS · ${timeLeft(duel?.week_end, de)}` : `${Math.max(0, LOAD_TARGET - Math.round(you.tss))} TSS to go · ${timeLeft(duel?.week_end, de)}`} de={de} onLeave={() => hideChallenge('load')} />
            )}
            {!hiddenChallenges.includes('days') && (
              <ChallengeRow icon={Flame} color="var(--color-accent)" name={de ? 'Aktive Tage' : 'Active Days'} sub={de ? 'persönlich' : 'personal'} pct={daysPct} progress={de ? `${you.active_days} / 7 Tage` : `${you.active_days} / 7 days`} detail={de ? `Noch ${Math.max(0, 7 - you.active_days)} Tage offen · ${timeLeft(duel?.week_end, de)}` : `${Math.max(0, 7 - you.active_days)} days open · ${timeLeft(duel?.week_end, de)}`} de={de} onLeave={() => hideChallenge('days')} />
            )}
            {hiddenChallenges.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Verlasse eine Challenge, um sie auszublenden — du kannst sie jederzeit wieder aufnehmen.' : 'Leave a challenge to hide it — you can re-add it any time.'}</p>
            )}
            {hiddenChallenges.length > 0 && (
              <div className="flex flex-col gap-2 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '10px 11px' }}>
                <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'VERLASSEN' : 'LEFT'}</span>
                <div className="flex flex-wrap gap-2">
                  {hiddenChallenges.includes('load') && (
                    <ReAddChip label={de ? 'Wochen-Last' : 'Weekly Load'} onClick={() => restoreChallenge('load')} />
                  )}
                  {hiddenChallenges.includes('days') && (
                    <ReAddChip label={de ? 'Aktive Tage' : 'Active Days'} onClick={() => restoreChallenge('days')} />
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? 'Sammle diese Woche Trainingslast, um Challenges zu starten.' : 'Bank some training load this week to start challenges.'}</p>
        )}
      </div>

      {/* ── FEED ── */}
      <div ref={feedRef} className="flex flex-col gap-3">
        <h2 className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{de ? 'Aus deiner Crew' : 'From your crew'}</h2>
        {feed.length > 0 ? (
          feed.map((c) => (
            <div key={c.user_id ?? c.handle} className="hover-card rounded-[24px] p-4 flex flex-col gap-3" style={cardStyle}>
              {/* top */}
              <div className="flex items-center gap-2.5">
                <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 38, height: 38, fontSize: 15, color: 'var(--color-ink)', background: avColor(c.handle) }}>{initial(c.handle)}</span>
                <div className="flex flex-col gap-0 flex-1 min-w-0">
                  <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{c.handle}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'diese Woche' : 'this week'}</span>
                </div>
                <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
                <span className="grid place-items-center rounded-full shrink-0" style={{ width: 30, height: 30, background: 'var(--color-surface-2)' }}><Bike size={16} style={{ color: 'var(--color-ink-2)' }} /></span>
              </div>
              {/* title */}
              <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Wochenzusammenfassung' : 'Weekly summary'}</span>
              {/* stats */}
              <div className="flex gap-6">
                <FeedStat v={`${Math.round(c.distance_km)}`} u="km" />
                <FeedStat v={c.hours.toFixed(1)} u={de ? 'Std' : 'hr'} />
                <FeedStat v={Math.round(c.kj).toLocaleString(de ? 'de' : 'en')} u="kJ" />
              </div>
              {/* Hover: extra weekly stats */}
              <div className="hover-reveal">
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-[10px]" style={{ background: 'var(--color-surface-2)', padding: '9px 11px' }}>
                  <MiniStat label={de ? 'EINHEITEN' : 'SESSIONS'} value={`${Math.round(c.rides)}`} />
                  <MiniStat label="TSS" value={`${Math.round(c.tss)}`} />
                  <MiniStat label={de ? 'BESTE' : 'BEST'} value={`${Math.round(c.best_tss)} TSS`} />
                  <MiniStat label={de ? 'AKTIV' : 'ACTIVE'} value={de ? `${c.active_days}/7 Tage` : `${c.active_days}/7 days`} />
                  <MiniStat label="IF" value={c.avg_if.toFixed(2)} />
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--color-rule)' }} />
              {/* actions */}
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full" style={{ background: 'var(--color-surface-2)', padding: '7px 13px' }}>
                  <Flame size={16} style={{ color: 'var(--color-muted)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-muted)' }}>—</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full" style={{ background: 'var(--color-surface-2)', padding: '7px 13px' }}>
                  <MessageCircle size={15} style={{ color: 'var(--color-muted)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-muted)' }}>—</span>
                </span>
                <span className="flex-1" />
                <span className="grid place-items-center rounded-full" style={{ width: 34, height: 34, background: 'var(--color-surface-2)' }}><Share2 size={15} style={{ color: 'var(--color-ink-2)' }} /></span>
              </div>
            </div>
          ))
        ) : (
          <EmptyCrew de={de} onFind={onOpenFinder} note={de ? 'Sobald deine Crew fährt, siehst du hier ihre Woche.' : "Once your crew rides, you'll see their week here."} />
        )}
      </div>

      {/* ── CLUB ── */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
        <div className="flex items-center gap-3">
          <span className="grid place-items-center rounded-[14px] shrink-0" style={{ width: 46, height: 46, background: 'var(--color-accent)' }}><Users size={26} style={{ color: 'var(--color-ink)' }} /></span>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="num-display truncate" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{clubName ?? (de ? 'Deine Crew' : 'Your crew')}</span>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {hasCrew
                ? (de ? `${crewSize} Mitglieder · ${combinedKm.toLocaleString('de')} km diese Woche` : `${crewSize} members · ${combinedKm.toLocaleString('en')} km this week`)
                : (de ? 'Noch keine Crew — lade Fahrer ein' : 'No crew yet — invite riders')}
            </span>
          </div>
        </div>
        {hasCrew ? (
          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex items-center justify-center gap-1.5 rounded-full w-full" style={{ background: 'var(--color-surface-3)', padding: 12 }}>
              <Trophy size={16} style={{ color: 'var(--color-accent)' }} />
              <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{de ? 'Club-Rangliste ansehen' : 'View club leaderboard'}</span>
              <ChevronRight size={14} style={{ color: 'var(--color-ink-2)' }} />
            </button>
            {leaveConfirm ? (
              <div className="flex items-center gap-2.5 rounded-full" style={{ background: 'var(--color-surface-3)', padding: '8px 8px 8px 14px' }}>
                <span className="flex-1 min-w-0" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Crew wirklich verlassen?' : 'Leave this crew?'}</span>
                <button type="button" onClick={() => leaveCrew.mutate(undefined, { onSuccess: () => setLeaveConfirm(false) })} disabled={leaveCrew.isPending} className="inline-flex items-center gap-1.5 rounded-full shrink-0" style={{ background: 'var(--color-strain)', padding: '7px 13px', opacity: leaveCrew.isPending ? 0.6 : 1 }}>
                  <LogOut size={14} style={{ color: 'var(--color-ink)' }} />
                  <span className="num-display" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{de ? 'Verlassen' : 'Leave'}</span>
                </button>
                <button type="button" onClick={() => setLeaveConfirm(false)} className="inline-flex items-center rounded-full shrink-0" style={{ background: 'var(--color-surface-2)', padding: '7px 13px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Abbrechen' : 'Cancel'}</span>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setLeaveConfirm(true)} className="inline-flex items-center justify-center gap-1.5 rounded-full w-full" style={{ background: 'transparent', border: '1px solid var(--color-rule)', padding: 11 }}>
                <LogOut size={15} style={{ color: 'var(--color-strain)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Crew verlassen' : 'Leave crew'}</span>
              </button>
            )}
            {leaveCrew.isError && (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Verlassen fehlgeschlagen — versuch es nochmal.' : 'Could not leave — try again.'}</span>
            )}
          </div>
        ) : (
          <button type="button" onClick={onOpenFinder} className="inline-flex items-center justify-center gap-1.5 rounded-full w-full" style={{ background: 'var(--color-accent)', padding: 12 }}>
            <UserPlus size={16} style={{ color: 'var(--color-ink)' }} />
            <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{de ? 'Fahrer finden' : 'Find riders'}</span>
            <ChevronRight size={14} style={{ color: 'var(--color-ink)' }} />
          </button>
        )}
      </div>

      {/* ── FIND PEOPLE ── */}
      <div ref={finderRef} className="rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
        <button type="button" onClick={() => setFindOpen((v) => !v)} className="flex items-center gap-3 w-full text-left">
          <span className="grid place-items-center rounded-[14px] shrink-0" style={{ width: 46, height: 46, background: 'var(--color-surface-2)' }}>
            <UserPlus size={24} style={{ color: 'var(--color-accent)' }} />
          </span>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="num-display truncate" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Menschen finden' : 'Find people'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Fahrer nach Handle suchen und verbinden' : 'Search riders by handle and connect'}</span>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--color-muted)', transform: findOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {findOpen && <FindPeople de={de} />}
      </div>
    </div>
  )
}

function InviteCard({ inv, de, onAccept, onDecline, accepting, declining }: {
  inv: IncomingInvite; de: boolean; onAccept: () => void; onDecline: () => void; accepting: boolean; declining: boolean
}) {
  const busy = accepting || declining
  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={{ ...cardStyle, borderColor: 'var(--color-accent)' }}>
      <div className="flex items-center gap-3">
        <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, fontSize: 16, color: 'var(--color-ink)', background: avColor(inv.inviter_handle) }}>{initial(inv.inviter_handle)}</span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{inv.inviter_handle}</span>
          <span className="truncate" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {de ? 'möchte sich verbinden' : 'wants to connect'} · {inv.crew_name}
          </span>
        </div>
      </div>
      <div className="flex gap-2.5">
        <button type="button" onClick={onAccept} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full" style={{ background: 'var(--color-accent)', padding: 12, opacity: busy ? 0.6 : 1 }}>
          <Check size={16} style={{ color: 'var(--color-ink)' }} />
          <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{de ? 'Annehmen' : 'Accept'}</span>
        </button>
        <button type="button" onClick={onDecline} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-full" style={{ background: 'var(--color-surface-2)', padding: '12px 18px', opacity: busy ? 0.6 : 1 }}>
          <X size={16} style={{ color: 'var(--color-ink-2)' }} />
          <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? 'Ablehnen' : 'Decline'}</span>
        </button>
      </div>
    </div>
  )
}

function FindPeople({ de }: { de: boolean }) {
  const [q, setQ] = useState('')
  const { data: results, isFetching } = useDiscover(q)
  const connect = useConnect()
  const [requested, setRequested] = useState<Set<number>>(new Set())

  function onConnect(userId: number) {
    connect.mutate(userId, {
      onSuccess: () => setRequested((prev) => new Set(prev).add(userId)),
    })
  }

  const rows = results ?? []
  const hasQuery = q.trim().length >= 1

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 rounded-full" style={{ background: 'var(--color-surface-2)', padding: '10px 14px' }}>
        <Search size={16} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={de ? 'Handle suchen…' : 'Search by handle…'}
          className="flex-1 bg-transparent outline-none"
          style={{ fontSize: 14, color: 'var(--color-ink)' }}
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label={de ? 'Löschen' : 'Clear'} className="grid place-items-center shrink-0">
            <X size={15} style={{ color: 'var(--color-muted)' }} />
          </button>
        )}
      </div>

      {!hasQuery ? (
        <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Tippe einen Handle, um Fahrer zu finden.' : 'Type a handle to find riders.'}</p>
      ) : isFetching && rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Suche…' : 'Searching…'}</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Niemand gefunden.' : 'No one found.'}</p>
      ) : (
        rows.map((r) => (
          <PersonRow key={r.user_id} r={r} de={de} requested={requested.has(r.user_id)} onConnect={() => onConnect(r.user_id)} connecting={connect.isPending && connect.variables === r.user_id} />
        ))
      )}
    </div>
  )
}

function PersonRow({ r, de, requested, onConnect, connecting }: {
  r: DiscoverResult; de: boolean; requested: boolean; onConnect: () => void; connecting: boolean
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '8px 10px' }}>
      <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 34, height: 34, fontSize: 14, color: 'var(--color-ink)', background: avColor(r.handle) }}>{initial(r.handle)}</span>
      <span className="truncate flex-1 min-w-0" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{r.handle}</span>
      {r.in_crew ? (
        <span className="inline-flex items-center gap-1.5 rounded-full" style={{ background: 'transparent', padding: '7px 12px' }}>
          <Users size={14} style={{ color: 'var(--color-muted)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'in deiner Crew' : 'in your crew'}</span>
        </span>
      ) : requested ? (
        <span className="inline-flex items-center gap-1.5 rounded-full" style={{ background: 'var(--color-surface-3)', padding: '7px 12px' }}>
          <Check size={14} style={{ color: 'var(--color-recovery)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-recovery)' }}>{de ? 'Angefragt ✓' : 'Requested ✓'}</span>
        </span>
      ) : (
        <button type="button" onClick={onConnect} disabled={connecting} className="inline-flex items-center gap-1.5 rounded-full shrink-0" style={{ background: 'var(--color-accent)', padding: '7px 13px', opacity: connecting ? 0.6 : 1 }}>
          <UserPlus size={14} style={{ color: 'var(--color-ink)' }} />
          <span className="num-display" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{de ? 'Verbinden' : 'Connect'}</span>
        </button>
      )}
    </div>
  )
}

function ChallengeRow({ icon: Icon, color, name, sub, pct, progress, detail, de, onLeave }: { icon: typeof Trophy; color: string; name: string; sub: string; pct: number; progress: string; detail: string; de: boolean; onLeave: () => void }) {
  return (
    <div className="hover-card rounded-[14px] flex flex-col gap-2.5" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center rounded-[11px] shrink-0" style={{ width: 38, height: 38, background: 'var(--color-paper)' }}><Icon size={20} style={{ color }} /></span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="num-display truncate" style={{ fontSize: 14, color: 'var(--color-ink)' }}>{name}</span>
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{sub}</span>
        </div>
        <span className="num-display" style={{ fontSize: 13, color }}>{pct}%</span>
        <button type="button" onClick={onLeave} className="inline-flex items-center gap-1 rounded-full shrink-0" style={{ background: 'var(--color-paper)', padding: '5px 10px' }}>
          <X size={12} style={{ color: 'var(--color-muted)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Verlassen' : 'Leave'}</span>
        </button>
      </div>
      <div className="rounded-[4px]" style={{ height: 8, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{progress}</span>
      {/* Hover: progress detail */}
      <div className="hover-reveal">
        <span style={{ fontSize: 11, fontWeight: 600, color }}>{detail}</span>
      </div>
    </div>
  )
}

function ReAddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full" style={{ background: 'var(--color-paper)', border: '1px solid var(--color-rule)', padding: '6px 12px' }}>
      <Plus size={13} style={{ color: 'var(--color-accent)' }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{label}</span>
    </button>
  )
}

function NewChallengeForm({ de, pending, error, onSubmit }: {
  de: boolean; pending: boolean; error: boolean; onSubmit: (input: CreateChallengeInput) => void
}) {
  const [name, setName] = useState('')
  const [metric, setMetric] = useState<ChallengeMetric>('distance_km')
  const [target, setTarget] = useState('')
  const [period, setPeriod] = useState<ChallengePeriod>('week')
  const trimmed = name.trim()
  const targetNum = Number(target)
  const valid = trimmed.length > 0 && Number.isFinite(targetNum) && targetNum > 0

  function submit() {
    if (!valid || pending) return
    onSubmit({ name: trimmed, metric, target: targetNum, period })
  }

  const fieldStyle = { background: 'var(--color-paper)', border: '1px solid var(--color-rule)', fontSize: 13, color: 'var(--color-ink)' } as const

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder={de ? 'Challenge-Name…' : 'Challenge name…'}
        className="w-full rounded-full outline-none"
        style={{ ...fieldStyle, padding: '10px 14px' }}
      />
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'METRIK' : 'METRIC'}</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value as ChallengeMetric)} className="w-full rounded-full outline-none" style={{ ...fieldStyle, padding: '9px 12px' }}>
            {METRIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{de ? o.de : o.en}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1" style={{ width: 96 }}>
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'ZIEL' : 'TARGET'}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder="0"
            className="w-full rounded-full outline-none num-mono"
            style={{ ...fieldStyle, padding: '9px 12px' }}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'ZEITRAUM' : 'PERIOD'}</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value as ChallengePeriod)} className="w-full rounded-full outline-none" style={{ ...fieldStyle, padding: '9px 12px' }}>
          <option value="week">{de ? 'Diese Woche' : 'This week'}</option>
          <option value="month">{de ? 'Dieser Monat' : 'This month'}</option>
        </select>
      </label>
      <button type="button" onClick={submit} disabled={!valid || pending} className="inline-flex items-center justify-center gap-1.5 rounded-full w-full" style={{ background: 'var(--color-accent)', padding: 12, opacity: !valid || pending ? 0.5 : 1 }}>
        <Plus size={15} style={{ color: 'var(--color-ink)' }} />
        <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{de ? 'Challenge erstellen' : 'Create challenge'}</span>
      </button>
      {error && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Erstellen fehlgeschlagen — versuch es nochmal.' : 'Could not create — try again.'}</span>
      )}
    </div>
  )
}

function CrewChallengeCard({ c, myId, de, onDelete, deleting }: {
  c: CrewChallenge; myId: number | undefined; de: boolean; onDelete: () => void; deleting: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  const targetLabel = fmtChallengeValue(c.metric, c.target, de)
  return (
    <div className="hover-card rounded-[14px] flex flex-col gap-3" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
      {/* Head */}
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center rounded-[11px] shrink-0" style={{ width: 38, height: 38, background: 'var(--color-paper)' }}>
          <Target size={20} style={{ color: 'var(--color-accent)' }} />
        </span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="num-display truncate" style={{ fontSize: 14, color: 'var(--color-ink)' }}>{c.name}</span>
          <span className="truncate" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            {metricLabel(c.metric, de)} · {targetLabel} · {de ? 'von' : 'by'} {c.creator_handle}
          </span>
        </div>
        {confirm ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={onDelete} disabled={deleting} className="inline-flex items-center gap-1 rounded-full" style={{ background: 'var(--color-strain)', padding: '6px 11px', opacity: deleting ? 0.6 : 1 }}>
              <Trash2 size={12} style={{ color: 'var(--color-ink)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Löschen' : 'Delete'}</span>
            </button>
            <button type="button" onClick={() => setConfirm(false)} aria-label={de ? 'Abbrechen' : 'Cancel'} className="grid place-items-center rounded-full" style={{ background: 'var(--color-paper)', width: 28, height: 28 }}>
              <X size={13} style={{ color: 'var(--color-muted)' }} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} aria-label={de ? 'Löschen' : 'Delete'} className="grid place-items-center rounded-full shrink-0" style={{ background: 'var(--color-paper)', width: 30, height: 30 }}>
            <Trash2 size={14} style={{ color: 'var(--color-muted)' }} />
          </button>
        )}
      </div>

      {/* Leaderboard */}
      <div className="flex flex-col gap-2">
        {c.participants.length > 0 ? (
          c.participants.map((p) => {
            const mine = p.user_id === myId
            const pct = Math.max(0, Math.min(100, Math.round(p.pct)))
            return (
              <div key={p.user_id} className="flex flex-col gap-1 rounded-[10px]" style={{ background: mine ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent', padding: mine ? '7px 9px' : '2px 9px' }}>
                <div className="flex items-center gap-2">
                  <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 26, height: 26, fontSize: 12, color: 'var(--color-ink)', background: avColor(p.handle) }}>{initial(p.handle)}</span>
                  <span className="truncate flex-1 min-w-0" style={{ fontSize: 13, fontWeight: mine ? 700 : 600, color: 'var(--color-ink)' }}>
                    {p.handle}{mine && <span style={{ fontWeight: 500, color: 'var(--color-muted)' }}> · {de ? 'du' : 'you'}</span>}
                  </span>
                  <span className="num-mono shrink-0" style={{ fontSize: 12, fontWeight: 700, color: p.reached ? 'var(--color-recovery)' : 'var(--color-ink-2)' }}>
                    {fmtChallengeValue(c.metric, p.value, de)} / {targetLabel}
                  </span>
                  <span className="shrink-0" style={{ fontSize: 13, width: 16, textAlign: 'center' }}>
                    {p.reached ? (mine ? '🏆' : '✓') : ''}
                  </span>
                </div>
                <div className="rounded-[4px]" style={{ height: 6, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: p.reached ? 'var(--color-recovery)' : (mine ? 'var(--color-accent)' : 'var(--color-ink-2)'), borderRadius: 4 }} />
                </div>
              </div>
            )
          })
        ) : (
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Noch keine Teilnehmer.' : 'No participants yet.'}</span>
        )}
      </div>
    </div>
  )
}

function NudgeCard({ n, de, onDismiss, dismissing }: { n: IncomingNudge; de: boolean; onDismiss: () => void; dismissing: boolean }) {
  return (
    <div className="rounded-[24px] p-5 flex items-start gap-3" style={{ ...cardStyle, borderColor: 'var(--color-amber)' }}>
      <span className="grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, background: 'color-mix(in srgb, var(--color-amber) 20%, transparent)' }}>
        <Hand size={20} style={{ color: 'var(--color-amber)' }} />
      </span>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-amber)' }}>
          {de ? `ANSTUPSER VON ${n.from_handle.toUpperCase()}` : `NUDGE FROM ${n.from_handle.toUpperCase()}`}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.35 }}>“{n.text}”</span>
      </div>
      <button type="button" onClick={onDismiss} disabled={dismissing} aria-label={de ? 'Erledigt' : 'Dismiss'} className="grid place-items-center rounded-full shrink-0" style={{ width: 32, height: 32, background: 'var(--color-surface-2)', opacity: dismissing ? 0.6 : 1 }}>
        <Check size={16} style={{ color: 'var(--color-ink-2)' }} />
      </button>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="eyebrow" style={{ fontSize: 9, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{label}</span>
      <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>{value}</span>
    </div>
  )
}

function FeedStat({ v, u }: { v: string; u: string }) {
  return (
    <div className="flex flex-col gap-0">
      <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{v}</span>
      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{u}</span>
    </div>
  )
}

function EmptyCrew({ de, note, onFind }: { de: boolean; note?: string; onFind?: () => void }) {
  const createCrew = useCreateCrew()
  const [name, setName] = useState('')
  const trimmed = name.trim()

  function onCreate() {
    if (!trimmed || createCrew.isPending) return
    createCrew.mutate(trimmed, { onSuccess: () => setName('') })
  }

  return (
    <div className="rounded-[24px] p-6 flex flex-col items-center gap-3.5 text-center" style={cardStyle}>
      <span className="grid place-items-center rounded-full" style={{ width: 48, height: 48, ...innerStyle }}><Users size={24} style={{ color: 'var(--color-muted)' }} /></span>
      <p style={{ fontSize: 14, color: 'var(--color-ink-2)', maxWidth: '32ch' }}>{note ?? (de ? 'Noch keine Crew — erstelle eine und lade Fahrer ein, um Duelle und die Rangliste freizuschalten.' : 'No crew yet — create one and invite riders to unlock battles and the leaderboard.')}</p>

      {/* Create crew */}
      <div className="flex items-center gap-2 rounded-full w-full" style={{ background: 'var(--color-surface-2)', padding: '6px 6px 6px 14px', maxWidth: 340 }}>
        <Sparkles size={15} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onCreate() }}
          placeholder={de ? 'Crew-Name…' : 'Crew name…'}
          className="flex-1 min-w-0 bg-transparent outline-none"
          style={{ fontSize: 14, color: 'var(--color-ink)' }}
        />
        <button type="button" onClick={onCreate} disabled={!trimmed || createCrew.isPending} className="inline-flex items-center gap-1.5 rounded-full shrink-0" style={{ background: 'var(--color-accent)', padding: '8px 13px', opacity: !trimmed || createCrew.isPending ? 0.5 : 1 }}>
          <Plus size={14} style={{ color: 'var(--color-ink)' }} />
          <span className="num-display" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{de ? 'Erstellen' : 'Create'}</span>
        </button>
      </div>
      {createCrew.isError && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Erstellen fehlgeschlagen — versuch es nochmal.' : 'Could not create — try again.'}</span>
      )}

      {onFind && (
        <button type="button" onClick={onFind} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2" style={{ background: 'transparent', border: '1px solid var(--color-rule)' }}>
          <UserPlus size={15} style={{ color: 'var(--color-ink-2)' }} /> <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Fahrer finden' : 'Find riders'}</span>
        </button>
      )}
    </div>
  )
}
