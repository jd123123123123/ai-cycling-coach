/**
 * SocialTab — rebuilt 1:1 against the Pencil "Community" design, re-ordered per
 * audit P1-10: the tab GREETS YOU WITH YOUR CREW, not a scoreboard you're
 * losing. Two views — Crew (default: merged crew card, find people, normalized
 * leaderboard, challenges, feed, segments) and Duelle (secondary: weekly
 * battles, or an inviting empty state with a quiet start button — the self-duel
 * against last week is opt-in, never auto-shown). Every number comes from real
 * duel/standings data. Cards whose data the backend does not yet expose (GPS
 * segment leaderboards, rich activity feed with kudos) render the real
 * structure with honest "—"/empty notes — never fabricated.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Swords, Trophy, Flame, Check, Users, UserPlus, Bell, Clock,
  Hand, Scale, Info, BarChart3, Bike, MessageCircle, Share2, ChevronRight,
  Mountain, Search, X, Send, LogOut, Plus, Sparkles, Inbox, Target, Trash2,
  Calendar, MapPin, Upload, Download, Route as RouteIcon, Sunrise, Zap, Flag, Lock,
} from 'lucide-react'
import {
  useCrewEvents, useCreateCrewEvent, useRsvpCrewEvent, useUploadCrewEventTour,
} from '../../../hooks/useCrewEvents'
import type { CrewEvent, EventKind, RsvpStatus, CreateEventInput } from '../../../api/crewEvents'
import RouteMini from '../RouteMini'
import {
  useDuel, useCrewStandings, useMyCrew, useCreateCrew, useLeaveCrew,
} from '../../../hooks/useCrew'
import type { DuelStats, CrewPeriod, StandingRow } from '../../../api/crew'
import {
  useDiscover, useIncomingInvites, useDeclineInvite,
} from '../../../hooks/useConnections'
import { apiClient } from '../../../api/client'
import {
  buildAcceptPayload, buildConnectPayload, duelColumnHeaders, isEarlyWeek,
  pickPersonalTargets, readPaceTss, readRowTargetTss, resolveCrewInfo,
} from '../socialLogic'
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
import { useLocale } from '../../../contexts/LocaleContext'
import { useAuth } from '../../../contexts/AuthContext'
import { useCrewChat, useSendChatMessage } from '../../../hooks/useCrewChat'
import { useCrewRides } from '../../../hooks/useCrewRides'
import ReactionBar from '../ReactionBar'
import { celebrate } from '../../../lib/confetti'
import { useAdaptiveGate, type GateMode } from '../../../hooks/useAdaptiveGate'
import CoachSafetyBanner from '../CoachSafetyBanner'

// Pen card treatment (V3 · Social): #14181D surface, hairline white border,
// soft drop shadow, 24-radius. Matches every card frame in the pen 1:1.
const cardStyle = {
  background: 'var(--color-paper-2)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
} as const

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

// The self-duel (vs your own last week) is OPT-IN and per-week: it only shows
// after the athlete presses "Start a duel", and resets every Monday so no one
// is ever greeted by an auto-created losing scoreboard.
const SELF_DUEL_KEY = 'social:selfDuelWeek'
function readSelfDuelWeek(): string | null {
  try {
    return localStorage.getItem(SELF_DUEL_KEY)
  } catch {
    return null
  }
}
function writeSelfDuelWeek(week: string) {
  try {
    localStorage.setItem(SELF_DUEL_KEY, week)
  } catch {
    /* ignore quota / private-mode errors */
  }
}

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
  const declineInvite = useDeclineInvite()
  // Accept carries the OPT-IN join_challenges flag (default false) — the
  // landed backend contract: joining a crew never silently enters the new
  // member into pre-existing challenges.
  const qc = useQueryClient()
  const acceptInvite = useMutation({
    mutationFn: async (vars: { inviteId: number; join: boolean }) => {
      const res = await apiClient.post(
        `/crews/invites/${vars.inviteId}/accept-mine`,
        buildAcceptPayload(vars.join),
      )
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crew'] })
      qc.invalidateQueries({ queryKey: ['connections', 'invites', 'incoming'] })
      qc.invalidateQueries({ queryKey: ['connections', 'discover'] })
    },
  })

  // ── Coach-safety interlock: the adaptive engine outranks the competition.
  // rest → banner reframes rest as the win + competitive CTAs pause;
  // ease → softened banner; go → nothing changes. ──
  const gate = useAdaptiveGate()

  // ── Nudges: incoming trash-talk feed + send ──
  const { data: incomingNudges } = useIncomingNudges()
  const nudges = incomingNudges ?? []
  const markNudge = useMarkNudgeRead()
  const sendNudge = useSendNudge()

  // ── Crew membership mutations ──
  const leaveCrew = useLeaveCrew()
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const navigate = useNavigate()

  // ── Crew events (group rides / chaingangs / races the crew plans together) ──
  const { data: crewEventsData } = useCrewEvents()
  const crewEvents = crewEventsData ?? []
  const createEvent = useCreateCrewEvent()
  const rsvpEvent = useRsvpCrewEvent()
  const uploadTour = useUploadCrewEventTour()
  const [eventFormOpen, setEventFormOpen] = useState(false)
  const eventsRef = useRef<HTMLDivElement>(null)

  // ── Crew chat (real thread, polls ~15s) + composer ──
  const { data: chatData } = useCrewChat()
  const chatMessages = chatData ?? []
  const sendChat = useSendChatMessage()
  const [chatDraft, setChatDraft] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── All-crew rides (every member's recent activities, newest first) ──
  const { data: crewRidesData } = useCrewRides()
  const crewRides = crewRidesData ?? []

  // ── Inbox (bell) + battle details toggles ──
  const [inboxOpen, setInboxOpen] = useState(false)
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
  const crewSize = hasCrew ? duel!.crew.length + 1 : 0
  // One unambiguous crew state (merges /crews/me with the duel roster).
  const crewInfo = resolveCrewInfo(myCrew, duel?.crew?.length ?? 0)
  // A crew of one. Several sections below are structurally empty in this state
  // — the chat, the all-crew ride list and the weekly feed all describe OTHER
  // people — and each rendered its own "once your crew rides…" box, so a solo
  // rider met a stack of four or five near-identical grey rectangles telling
  // them nothing is here. Collapsed into one invitation, which is the single
  // action that resolves all of them at once.
  const crewIsSolo = crewInfo.exists && crewInfo.memberCount <= 1

  // ── Views: the tab LANDS ON CREW; Duelle is a secondary, opt-in tab. ──
  const [view, setView] = useState<'crew' | 'duels'>('crew')

  // Concurrent weekly battles — you vs EACH crew member (real opponents only).
  const crewBattles: DuelStats[] = hasCrew ? duel!.crew : []
  // Self-duel vs last week: opt-in, per-week. Never auto-shown.
  const [selfDuelWeek, setSelfDuelWeek] = useState<string | null>(() => readSelfDuelWeek())
  const selfDuelActive = !!duel?.week_start && selfDuelWeek === duel.week_start
  function startSelfDuel() {
    if (!duel?.week_start) return
    writeSelfDuelWeek(duel.week_start)
    setSelfDuelWeek(duel.week_start)
  }

  // Pace field for the early-week self-duel line (tolerant of shape).
  const paceTss = readPaceTss(duel)

  function onBellClick() {
    setInboxOpen((v) => !v)
    requestAnimationFrame(() => inboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // The finder lives in the Crew view — switch there first, then scroll.
  function onOpenFinder() {
    setView('crew')
    setTimeout(() => finderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  // Open the create-challenge form and bring it into view — reached from the
  // finder ("Challenge your crew") so adding people flows straight into a duel.
  function onOpenChallenge() {
    setView('crew')
    setChallengeFormOpen(true)
    setTimeout(() => challengeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

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

  // ── Crew-card summary ──
  const combinedKm = useMemo(() => {
    if (!hasCrew) return 0
    const crewSum = duel!.crew.reduce((s, c) => s + Number(c.distance_km ?? 0), 0)
    return Math.round(crewSum + Number(you?.distance_km ?? 0))
  }, [hasCrew, duel, you])

  // ── Challenges (real, athlete-scaled — never a hardcoded 800/7) ──
  const targets = pickPersonalTargets(duel)
  const loadPct = you && targets.loadTargetTss
    ? Math.min(100, Math.round((you.tss / targets.loadTargetTss) * 100))
    : 0
  const daysPct = you
    ? Math.min(100, Math.round((you.active_days / targets.activeDaysTarget) * 100))
    : 0

  // ── View tabs + in-view smooth-scroll anchors ──
  const challengeRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const inboxRef = useRef<HTMLDivElement>(null)
  const finderRef = useRef<HTMLDivElement>(null)
  const CHIPS: Array<{ id: string; label: string; active: boolean; onClick: () => void }> = [
    { id: 'crew', label: 'Crew', active: view === 'crew', onClick: () => setView('crew') },
    { id: 'duels', label: de ? 'Duelle' : 'Duels', active: view === 'duels', onClick: () => setView('duels') },
    {
      id: 'challenges', label: 'Challenges', active: false,
      onClick: () => { setView('crew'); setTimeout(() => challengeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) },
    },
    {
      id: 'feed', label: 'Feed', active: false,
      onClick: () => { setView('crew'); setTimeout(() => feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) },
    },
  ]

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--color-accent)' }}>
            {hasCrew ? (de ? `DEINE CREW · ${crewSize} FREUNDE` : `YOUR CREW · ${crewSize} FRIENDS`) : (de ? 'DEINE CREW' : 'YOUR CREW')}
          </span>
          <h1 className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)' }}>Community</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onOpenFinder} aria-label={de ? 'Fahrer einladen' : 'Invite riders'} className="grid place-items-center rounded-full" style={{ width: 44, height: 44, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
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

      {/* ── COACH-SAFETY INTERLOCK — when the coach prescribes recovery, the
          whole page's competitive tone yields. Renders nothing on 'go'. ── */}
      <CoachSafetyBanner />

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
                onAccept={(join) => acceptInvite.mutate({ inviteId: inv.invite_id, join })}
                onDecline={() => declineInvite.mutate(inv.invite_id)}
                accepting={acceptInvite.isPending && acceptInvite.variables?.inviteId === inv.invite_id}
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

      {/* ── VIEW TABS: Crew (default) · Duelle · jump chips ── */}
      <div className="flex gap-2">
        {CHIPS.map(({ id, label, active, onClick }) => (
          <button key={id} type="button" onClick={onClick} aria-pressed={active}
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

      {/* ── DUELS VIEW (secondary, opt-in) — crew battles when you have a crew;
          otherwise an inviting empty state. The self-duel against last week
          only appears after a deliberate "start" — never as an auto-shown
          losing scoreboard. ── */}
      {view === 'duels' && (
        <div className="flex flex-col gap-4">
          {you && crewBattles.length > 0 ? (
            <>
              {crewBattles.length > 1 && (
                <div className="flex items-center gap-[7px]">
                  <Swords size={18} style={{ color: 'var(--color-accent)' }} />
                  <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Wochenduelle' : 'Weekly Battles'}</span>
                  <span className="num-mono grid place-items-center rounded-full" style={{ minWidth: 20, height: 20, padding: '0 6px', fontSize: 11, fontWeight: 700, color: 'var(--color-ink)', background: 'var(--color-surface-2)' }}>{crewBattles.length}</span>
                </div>
              )}
              {crewBattles.map((opponent) => (
                <BattleCard
                  key={opponent.user_id ?? opponent.handle}
                  you={you}
                  opponent={opponent}
                  isPast={false}
                  weekStart={duel?.week_start}
                  weekEnd={duel?.week_end}
                  paceTss={paceTss}
                  de={de}
                  sendNudge={sendNudge}
                  gateMode={gate.mode}
                />
              ))}
            </>
          ) : you && selfDuelActive && duel?.you_last_week ? (
            <BattleCard
              key="past-you"
              you={you}
              opponent={duel.you_last_week}
              isPast
              weekStart={duel.week_start}
              weekEnd={duel.week_end}
              paceTss={paceTss}
              de={de}
              sendNudge={sendNudge}
              gateMode={gate.mode}
            />
          ) : (
            <DuelEmptyState de={de} canStart={!!(you && duel?.you_last_week)} onStart={startSelfDuel} />
          )}
        </div>
      )}

      {view === 'crew' && (<>

      {/* ── YOUR CREW — the one crew card. Name + member count + a single
          invite CTA when a crew exists; a single create-crew card when not. ── */}
      {crewInfo.exists ? (
        <div
          className="rounded-[24px] flex flex-col gap-3.5"
          style={{
            // Pen CrewCard mesh-gradient hero (UW6SW B6LAHE): a 3×3 mesh of
            // purple/blue/plum vertices fading to near-black. CSS radial layers
            // reproduce the mesh vertex colors row-by-row.
            background:
              'radial-gradient(120% 80% at 8% -8%, #3E2A6B 0%, rgba(62,42,107,0) 60%),' +
              'radial-gradient(120% 80% at 50% -12%, #2E3A7A 0%, rgba(46,58,122,0) 58%),' +
              'radial-gradient(120% 80% at 92% -8%, #4A2E3A 0%, rgba(74,46,58,0) 60%),' +
              'radial-gradient(130% 90% at 12% 48%, #2A2050 0%, rgba(42,32,80,0) 62%),' +
              'radial-gradient(130% 90% at 88% 48%, #3A2A46 0%, rgba(58,42,70,0) 62%),' +
              'linear-gradient(180deg, #1E2848 0%, #120E24 52%, #0E1220 78%, #0A0C0F 100%)',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 8px 24px rgba(46,58,122,0.40)',
            padding: '16px 18px',
          }}
        >
          {/* CTop — overline + crew name, private pill */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--color-accent)' }}>{de ? 'DEINE CREW' : 'YOUR CREW'}</span>
              <span className="num-display truncate" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{crewInfo.name ?? (de ? 'Deine Crew' : 'Your crew')}</span>
            </div>
            <span className="inline-flex items-center gap-[5px] rounded-full shrink-0" style={{ background: 'var(--color-surface-2)', padding: '5px 10px' }}>
              <Lock size={13} style={{ color: 'var(--color-ink-2)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Privat' : 'Private'}</span>
            </span>
          </div>

          {/* MemRow — overlapping member avatars + summary line */}
          {(() => {
            const faces = [you?.handle, ...(duel?.crew?.map((c) => c.handle) ?? [])].filter((h): h is string => !!h).slice(0, 5)
            const rings = ['var(--color-accent)', 'var(--color-move)', 'var(--color-strain)', 'var(--color-recovery)', 'var(--color-gold)']
            return (
              <div className="flex items-center gap-3">
                {faces.length > 0 && (
                  <div className="flex items-center">
                    {faces.map((h, i) => (
                      <span key={h + i} className="num-display grid place-items-center rounded-full" style={{ width: 30, height: 30, fontSize: 12, color: 'var(--color-ink)', background: avColor(h), border: `2px solid ${rings[i % rings.length]}`, marginLeft: i === 0 ? 0 : -11, zIndex: faces.length - i }}>{initial(h)}</span>
                    ))}
                  </div>
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.80)' }}>
                  {de
                    ? `${crewInfo.memberCount} ${crewInfo.memberCount === 1 ? 'Fahrer' : 'Fahrer'}${combinedKm > 0 ? ` · ${combinedKm.toLocaleString('de')} km diese Woche` : ''}`
                    : `${crewInfo.memberCount} ${crewInfo.memberCount === 1 ? 'rider' : 'riders'}${combinedKm > 0 ? ` · ${combinedKm.toLocaleString('en')} km this week` : ''}`}
                </span>
              </div>
            )
          })()}

          {/* Momentum chip — real combined distance (green), when present */}
          {combinedKm > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-[5px] rounded-full" style={{ background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)', padding: '4px 10px' }}>
                <Zap size={13} style={{ color: 'var(--color-recovery)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-recovery)' }}>{de ? `${combinedKm.toLocaleString('de')} km zusammen` : `${combinedKm.toLocaleString('en')} km together`}</span>
              </span>
            </div>
          )}

          {/* HLink — highlights deep-link (glassy blurred pill) */}
          <button type="button" onClick={() => navigate('/dashboard?tab=crew')} className="inline-flex items-center gap-2 rounded-[12px] w-full" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', backdropFilter: 'blur(14px)', padding: '10px 12px' }}>
            <Sparkles size={16} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
            <span className="flex-1 text-left" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
              {combinedKm > 0
                ? (de ? `${combinedKm.toLocaleString('de')} km zusammen — Highlights` : `${combinedKm.toLocaleString('en')} km together — see highlights`)
                : (de ? 'Crew-Highlights ansehen' : 'See crew highlights')}
            </span>
            <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
          </button>

          {/* Cheer the crew's week (target_type=crew_week, no target_id) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{de ? 'Woche feiern' : 'Cheer the week'}</span>
            <ReactionBar targetType="crew_week" de={de} />
          </div>

          {/* CrewManage — Invite / Leave (glassy blurred pills, pen treatment) */}
          {leaveConfirm ? (
            <div className="flex items-center gap-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.10)', padding: '8px 8px 8px 14px' }}>
              <span className="flex-1 min-w-0" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Crew wirklich verlassen?' : 'Leave this crew?'}</span>
              <button type="button" onClick={() => leaveCrew.mutate(undefined, { onSuccess: () => setLeaveConfirm(false) })} disabled={leaveCrew.isPending} className="inline-flex items-center gap-1.5 rounded-full shrink-0" style={{ background: 'color-mix(in srgb, var(--color-move) 24%, transparent)', border: '1px solid color-mix(in srgb, var(--color-move) 40%, transparent)', padding: '7px 13px', opacity: leaveCrew.isPending ? 0.6 : 1 }}>
                <LogOut size={14} style={{ color: '#FF9BB0' }} />
                <span className="num-display" style={{ fontSize: 12, color: '#FF9BB0' }}>{de ? 'Verlassen' : 'Leave'}</span>
              </button>
              <button type="button" onClick={() => setLeaveConfirm(false)} className="inline-flex items-center rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.10)', padding: '7px 13px' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Abbrechen' : 'Cancel'}</span>
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={onOpenFinder} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', backdropFilter: 'blur(12px)', padding: '9px 0' }}>
                <UserPlus size={15} style={{ color: 'var(--color-ink)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Einladen' : 'Invite'}</span>
              </button>
              <button type="button" onClick={() => setLeaveConfirm(true)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--color-move) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-move) 30%, transparent)', padding: '9px 0' }}>
                <LogOut size={15} style={{ color: '#FF9BB0' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#FF9BB0' }}>{de ? 'Verlassen' : 'Leave'}</span>
              </button>
            </div>
          )}
          {leaveCrew.isError && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Verlassen fehlgeschlagen — versuch es nochmal.' : 'Could not leave — try again.'}</span>
          )}
        </div>
      ) : (
        <EmptyCrew de={de} />
      )}

      {/* ── FIND PEOPLE (prominent, persistent) — search anyone on the app and
          add them to your crew. Kept high on the page so building a crew is the
          first obvious action. ── */}
      <div ref={finderRef} className="rounded-[24px] p-5 flex flex-col gap-3.5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-accent)' }}>
        <div className="flex items-center gap-3">
          <span className="grid place-items-center rounded-[14px] shrink-0" style={{ width: 46, height: 46, background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)' }}>
            <UserPlus size={24} style={{ color: 'var(--color-accent)' }} />
          </span>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="num-display truncate" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Menschen finden' : 'Find people'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Fahrer suchen und in deine Crew holen' : 'Search anyone and add them to your crew'}</span>
          </div>
        </div>
        <FindPeople de={de} hasCrew={hasCrew} onChallenge={onOpenChallenge} />
      </div>

      {/* ── LEADERBOARD ── */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
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
              // Per-rider weekly target (backend-scaled) — shown when present.
              const rowTarget = readRowTargetTss(s)
              // A zero early in the week is not a failure — render it muted,
              // never in an alarm color.
              const valueColor = metricRaw == null || metricRaw === 0
                ? 'var(--color-muted)'
                : s.is_you ? 'var(--color-accent)' : 'var(--color-ink)'
              // Medal-coloured rank badge (gold/silver/bronze, then slate).
              const medal = i === 0 ? '#FFD166' : i === 1 ? '#C7CDD6' : i === 2 ? '#E0A46B' : 'var(--color-surface-3)'
              const medalInk = i < 3 ? '#0A0C0F' : 'var(--color-ink-2)'
              const ring = ['var(--color-accent)', 'var(--color-move)', 'var(--color-strain)', 'var(--color-recovery)', 'var(--color-gold)'][i % 5]
              // Mini value bar — this row's value as a share of the leader's.
              const barPct = leadRaw != null && leadRaw > 0 && metricRaw != null ? Math.max(6, Math.min(100, (metricRaw / leadRaw) * 100)) : 0
              return (
              <div key={s.user_id} className="hover-card flex flex-col gap-2 rounded-[12px]" style={{
                background: s.is_you ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-surface-2)',
                border: `1px solid ${s.is_you ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: s.is_you ? '0 0 16px rgba(255,90,60,0.27)' : 'none',
                padding: '7px 8px',
              }}>
                <div className="flex items-center gap-2.5">
                  <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 24, height: 24, fontSize: 12, color: medalInk, background: medal }}>{i + 1}</span>
                  <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 32, height: 32, fontSize: 13, color: 'var(--color-ink)', background: avColor(s.handle), border: `2px solid ${ring}` }}>{initial(s.handle)}</span>
                  <span className="truncate flex-1 min-w-0" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{s.handle}{s.is_you && <span style={{ fontWeight: 500, color: 'var(--color-muted)' }}> · {de ? 'du' : 'you'}</span>}</span>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-end gap-[3px]">
                      <span className="num-display" style={{ fontSize: 18, color: valueColor }}>{metricShown}</span>
                      {metricRaw != null && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', paddingBottom: 2 }}>{metricUnit}</span>}
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ width: 72, height: 5, background: 'var(--color-surface-3)' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: s.is_you ? 'var(--color-accent)' : 'var(--color-ink-2)', transition: 'width 400ms var(--ease-apple-default)' }} />
                    </div>
                  </div>
                  <span className="hover-arrow shrink-0"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
                </div>
                {/* Hover: extra weekly stats + rank context */}
                <div className="hover-reveal">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-[10px]" style={{ background: 'var(--color-surface-2)', padding: '9px 11px' }}>
                    <MiniStat label={de ? 'RANG' : 'RANK'} value={`${i + 1} / ${board.length}`} />
                    <MiniStat label={de ? 'LAST' : 'LOAD'} value={`${Math.round(s.weekly_tss)} TSS`} />
                    <MiniStat label={de ? 'PUNKTE' : 'SCORE'} value={`${Math.round(s.weekly_score)}`} />
                    <MiniStat label={de ? 'AKTIV' : 'ACTIVE'} value={de ? `${activeDays}/${bucketCount} aktiv` : `${activeDays}/${bucketCount} active`} />
                    {rowTarget != null && <MiniStat label={de ? 'ZIEL' : 'TARGET'} value={`${Math.round(rowTarget)} TSS`} />}
                    {i > 0 && <MiniStat label={de ? 'RÜCKSTAND' : 'TO LEAD'} value={gapToLead} />}
                  </div>
                </div>
              </div>
            )})}
            {boardMetric === 'load' && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Punkte = Anteil am eigenen Wochenziel' : 'Points = share of your own weekly target'}</p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? 'Die Rangliste erscheint, sobald deine Crew fährt.' : 'The leaderboard fills once your crew rides.'}</p>
        )}
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
          <div className="flex items-center gap-1.5 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '8px 11px' }}>
            <Users size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.35 }}>
              {de ? 'Alle in deiner Crew treten gegen dieses Ziel an.' : 'Everyone in your crew competes against this target.'}
            </span>
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
            {/* Targets are athlete-scaled (backend-provided, ~own 4-week
                average ×1.05); the load challenge only exists once there is an
                honest basis for a target — never a fixed 800 TSS. */}
            {targets.loadTargetTss != null && !hiddenChallenges.includes('load') && (
              <ChallengeRow icon={Trophy} color="var(--color-amber)" name={de ? 'Wochen-Last' : 'Weekly Load'} sub={de ? 'persönlich · auf dich skaliert' : 'personal · scaled to you'} pct={loadPct} progress={`${Math.round(you.tss)} / ${targets.loadTargetTss} TSS`} detail={de ? `Noch ${Math.max(0, targets.loadTargetTss - Math.round(you.tss))} TSS · ${timeLeft(duel?.week_end, de)}` : `${Math.max(0, targets.loadTargetTss - Math.round(you.tss))} TSS to go · ${timeLeft(duel?.week_end, de)}`} de={de} onLeave={() => hideChallenge('load')} />
            )}
            {!hiddenChallenges.includes('days') && (
              <ChallengeRow icon={Flame} color="var(--color-accent)" name={de ? 'Aktive Tage' : 'Active Days'} sub={de ? 'persönlich · auf dich skaliert' : 'personal · scaled to you'} pct={daysPct} progress={de ? `${you.active_days} / ${targets.activeDaysTarget} Tage` : `${you.active_days} / ${targets.activeDaysTarget} days`} detail={de ? `Noch ${Math.max(0, targets.activeDaysTarget - you.active_days)} Tage offen · ${timeLeft(duel?.week_end, de)}` : `${Math.max(0, targets.activeDaysTarget - you.active_days)} days open · ${timeLeft(duel?.week_end, de)}`} de={de} onLeave={() => hideChallenge('days')} />
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

      {/* ── CREW EVENTS — group rides / chaingangs / races the crew plans
          together. Real backend (/crews/me/events): list, create, RSVP, and an
          uploaded GPX tour rendered as a route on the card. ── */}
      <div ref={eventsRef} className="rounded-[24px] p-5 flex flex-col gap-3" style={cardStyle}>
        <div className="flex items-center justify-between">
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Crew-Events' : 'Crew events'}</span>
          <button type="button" onClick={() => setEventFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full shrink-0" style={{ background: eventFormOpen ? 'var(--color-surface-2)' : 'color-mix(in srgb, var(--color-accent) 15%, transparent)', border: `1px solid ${eventFormOpen ? 'var(--color-rule)' : 'var(--color-accent)'}`, padding: '5px 11px' }}>
            {eventFormOpen ? <X size={14} style={{ color: 'var(--color-ink-2)' }} /> : <Plus size={14} style={{ color: 'var(--color-accent)' }} />}
            <span style={{ fontSize: 12, fontWeight: 700, color: eventFormOpen ? 'var(--color-ink-2)' : 'var(--color-accent)' }}>{eventFormOpen ? (de ? 'Abbrechen' : 'Cancel') : (de ? 'Neu' : 'New')}</span>
          </button>
        </div>

        {eventFormOpen && (
          <NewEventForm
            de={de}
            pending={createEvent.isPending}
            error={createEvent.isError}
            onSubmit={(input) => createEvent.mutate(input, { onSuccess: () => setEventFormOpen(false) })}
          />
        )}

        {crewInfo.exists ? (
          crewEvents.length > 0 ? (
            crewEvents.map((ev) => (
              <EventCard
                key={ev.id}
                ev={ev}
                de={de}
                canUploadTour={myId != null && ev.creator_user_id === myId}
                onRsvp={(status) => rsvpEvent.mutate({ eventId: ev.id, status })}
                rsvpPending={rsvpEvent.isPending && rsvpEvent.variables?.eventId === ev.id}
                onUploadTour={(file) => uploadTour.mutate({ eventId: ev.id, file })}
                uploading={uploadTour.isPending && uploadTour.variables?.eventId === ev.id}
                uploadError={uploadTour.isError && uploadTour.variables?.eventId === ev.id}
              />
            ))
          ) : (
            <div className="flex items-center gap-2.5 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
              <span className="grid place-items-center rounded-full shrink-0" style={{ width: 38, height: 38, background: 'var(--color-surface-3)' }}><Calendar size={19} style={{ color: 'var(--color-muted)' }} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.35 }}>
                {de ? 'Noch keine Events geplant — leg das erste Crew-Ride an.' : 'No events planned yet — create the first crew ride.'}
              </span>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2.5 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
            <span className="grid place-items-center rounded-full shrink-0" style={{ width: 38, height: 38, background: 'var(--color-surface-3)' }}><Calendar size={19} style={{ color: 'var(--color-muted)' }} /></span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.35 }}>
              {de ? 'Tritt einer Crew bei, um gemeinsame Rides zu planen.' : 'Join a crew to plan rides together.'}
            </span>
          </div>
        )}
      </div>

      {/* ── CREW CHAT — real shared thread (/crews/me/chat), polls ~15s.
          Avatars derive from the handle; each message carries tap-to-toggle
          emoji reactions. Hidden for a crew of one: "schreib der Crew als
          Erste:r" invites the athlete to talk to nobody. ── */}
      {crewInfo.exists && !crewIsSolo && (
        <div className="rounded-[24px] p-5 flex flex-col gap-3" style={cardStyle}>
          <div className="flex items-center gap-2">
            <MessageCircle size={17} style={{ color: 'var(--color-accent)' }} />
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Crew-Chat' : 'Crew chat'}</span>
          </div>

          <div className="flex flex-col gap-3" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {chatMessages.length > 0 ? (
              chatMessages.map((m) => {
                const mine = myId != null && m.user_id === myId
                const name = m.display_name || m.handle
                const time = (() => {
                  try {
                    return new Date(m.created_at).toLocaleTimeString(de ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
                  } catch { return '' }
                })()
                return (
                  <div key={m.id} className="flex gap-2.5">
                    <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 34, height: 34, fontSize: 14, color: 'var(--color-ink)', background: avColor(m.handle) }}>{initial(m.handle)}</span>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: mine ? 'var(--color-accent)' : 'var(--color-ink)' }}>{name}{mine && <span style={{ fontWeight: 500, color: 'var(--color-muted)' }}> · {de ? 'du' : 'you'}</span>}</span>
                        {time && <span className="num-mono shrink-0" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{time}</span>}
                      </div>
                      <div className="rounded-[14px] rounded-tl-[4px]" style={{ background: 'var(--color-surface-2)', padding: '8px 12px' }}>
                        <span style={{ fontSize: 13.5, color: 'var(--color-ink)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</span>
                      </div>
                      <ReactionBar targetType="message" targetId={m.id} seed={m.reactions} de={de} />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex items-center gap-2.5 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
                <span className="grid place-items-center rounded-full shrink-0" style={{ width: 38, height: 38, background: 'var(--color-surface-3)' }}><MessageCircle size={19} style={{ color: 'var(--color-muted)' }} /></span>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.35 }}>
                  {de ? 'Noch keine Nachrichten — schreib der Crew als Erste:r.' : 'No messages yet — be the first to write to your crew.'}
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && chatDraft.trim() && !sendChat.isPending) {
                  sendChat.mutate(chatDraft.trim(), { onSuccess: () => setChatDraft('') })
                }
              }}
              placeholder={de ? 'Nachricht an die Crew…' : 'Message your crew…'}
              maxLength={500}
              className="flex-1 rounded-full"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', padding: '10px 14px', fontSize: 13.5, color: 'var(--color-ink)' }}
            />
            <button
              type="button"
              onClick={() => { if (chatDraft.trim() && !sendChat.isPending) sendChat.mutate(chatDraft.trim(), { onSuccess: () => setChatDraft('') }) }}
              disabled={!chatDraft.trim() || sendChat.isPending}
              aria-label={de ? 'Senden' : 'Send'}
              className="grid place-items-center rounded-full shrink-0"
              style={{ width: 42, height: 42, background: 'var(--color-accent)', opacity: !chatDraft.trim() || sendChat.isPending ? 0.5 : 1 }}
            >
              <Send size={18} style={{ color: 'var(--color-ink)' }} />
            </button>
          </div>
          {sendChat.isError && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Konnte nicht gesendet werden — nochmal versuchen.' : 'Could not send — try again.'}</span>
          )}
        </div>
      )}

      {/* ── ALL-CREW RIDES — every member's recent activities (/crews/me/rides),
          newest first. Each row links to the ride-detail page + carries
          tap-to-toggle reactions (target_type=ride). Hidden for a crew of one,
          where it can only ever show the athlete their own rides back — the
          History tab's job — or its empty box. ── */}
      {crewInfo.exists && !crewIsSolo && (
        <div className="rounded-[24px] p-5 flex flex-col gap-3" style={cardStyle}>
          <div className="flex items-center gap-2">
            <Bike size={17} style={{ color: 'var(--color-accent)' }} />
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Crew-Fahrten' : 'Crew rides'}</span>
          </div>
          {crewRides.length > 0 ? (
            crewRides.map((r) => {
              const km = (r.distance_m / 1000).toFixed(1)
              const elev = Math.round(r.elevation_gain_m)
              const h = Math.floor(r.duration_seconds / 3600)
              const min = Math.floor((r.duration_seconds % 3600) / 60)
              const dur = h > 0 ? `${h}:${String(min).padStart(2, '0')} h` : `${min} min`
              const when = (() => {
                try { return new Date(r.started_at).toLocaleDateString(de ? 'de-DE' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return '' }
              })()
              const name = r.display_name || r.handle
              return (
                <div key={r.id} className="flex flex-col gap-2.5 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: 12 }}>
                  <button type="button" onClick={() => navigate(`/crew-ride/${r.id}`)} className="flex items-center gap-2.5 text-left">
                    <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 38, height: 38, fontSize: 15, color: 'var(--color-ink)', background: avColor(r.handle) }}>{initial(r.handle)}</span>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{r.title}</span>
                      <span className="truncate" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{name} · {when}</span>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                  </button>
                  <div className="flex items-center gap-5" style={{ paddingLeft: 2 }}>
                    <FeedStat v={km} u="km" />
                    <FeedStat v={`${elev}`} u="m" />
                    <FeedStat v={dur} u={de ? 'Zeit' : 'time'} />
                  </div>
                  <ReactionBar targetType="ride" targetId={r.id} seed={r.reactions} de={de} />
                </div>
              )
            })
          ) : (
            <div className="flex items-center gap-2.5 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
              <span className="grid place-items-center rounded-full shrink-0" style={{ width: 38, height: 38, background: 'var(--color-surface-3)' }}><Bike size={19} style={{ color: 'var(--color-muted)' }} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.35 }}>
                {de ? 'Sobald deine Crew fährt, erscheinen ihre Fahrten hier.' : "Once your crew rides, their activities show up here."}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── FEED ── The one place the solo state speaks, and it speaks once:
          instead of a fourth "nothing here" box it names why the section is
          empty and offers the single action that fills every section above and
          below it. ── */}
      {crewIsSolo && feed.length === 0 ? (
        <div ref={feedRef} className="rounded-[24px] p-6 flex flex-col items-center text-center gap-3" style={cardStyle}>
          <span className="grid place-items-center rounded-full" style={{ width: 52, height: 52, background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' }}>
            <Users size={24} strokeWidth={1.9} style={{ color: 'var(--color-accent)' }} />
          </span>
          <h2 className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>
            {de ? 'Du fährst hier noch allein' : "You're riding solo in here"}
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--color-ink-2)', lineHeight: 1.45, maxWidth: '34ch' }}>
            {de
              ? 'Chat, Crew-Fahrten und die Wochenübersicht wachen auf, sobald eine zweite Person dabei ist. Eine reicht.'
              : 'Chat, crew rides and the weekly feed all wake up the moment a second rider joins. One is enough.'}
          </p>
          <button
            type="button"
            onClick={onOpenFinder}
            className="inline-flex items-center gap-2 rounded-full"
            style={{ padding: '10px 18px', background: 'var(--color-accent)', color: 'var(--color-paper)' }}
          >
            <UserPlus size={16} strokeWidth={2.2} />
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>{de ? 'Fahrer einladen' : 'Invite a rider'}</span>
          </button>
        </div>
      ) : (
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
          <div className="rounded-[24px] p-5" style={cardStyle}>
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>{de ? 'Sobald deine Crew fährt, siehst du hier ihre Woche.' : "Once your crew rides, you'll see their week here."}</p>
          </div>
        )}
      </div>
      )}

      {/* ── SEGMENTS — removed (Jul 2026) ──
          This was a full-size card whose entire content was a promise: "Segment
          racing isn't connected yet — your PRs and KOM duels appear once GPS
          segments go live." It shipped no data, took a card slot on every
          visit, and sat at the bottom of a screen that already stacked several
          "nothing here yet" boxes. A roadmap item advertised in the product is
          a permanent reminder of what the app cannot do; it belongs in the
          backlog, not on the athlete's screen. Restore this block when segments
          actually land and it has real PRs to show. */}

      </>)}

    </div>
  )
}

// One live weekly battle: you vs a single opponent (a real crew member, or
// "Past You" when you have no crew). Computes its own 6-metric scoreline, owns
// its own Battle-details toggle + Nudge (targeting THIS opponent's user_id).
function BattleCard({ you, opponent, isPast, weekStart, weekEnd, paceTss, de, sendNudge, gateMode }: {
  you: DuelStats
  opponent: DuelStats
  isPast: boolean
  weekStart: string | undefined
  weekEnd: string | undefined
  paceTss: number | null
  de: boolean
  sendNudge: ReturnType<typeof useSendNudge>
  gateMode: GateMode
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [nudgeSent, setNudgeSent] = useState<{ text: string; intercepted: boolean } | null>(null)
  // Only a real crew rival can be nudged (never "Past You"), and only while the
  // coach isn't prescribing recovery — competition never outranks physiology.
  const resting = gateMode === 'rest'
  const opponentId = !isPast && opponent.user_id && !resting ? opponent.user_id : undefined
  const nudging = sendNudge.isPending && sendNudge.variables === opponentId
  const opponentName = isPast ? (de ? 'Letzte Woche' : 'Last week') : opponent.handle
  // Self-duel: unambiguous week columns (never DU / DU) …
  const cols = duelColumnHeaders(isPast, de, opponent.handle)
  // … and no-guilt colors: trailing your own last week is neutral slate, never
  // an alarm red (that color stays reserved for real head-to-head rivals).
  const loseColor = isPast ? 'var(--color-muted)' : 'var(--color-strain)'
  // Early week the raw score would be a guaranteed 0:60 loss — show the
  // pace-based comparison instead of a scoreboard + countdown.
  const earlyWeek = isPast && isEarlyWeek(weekStart, Date.now(), Number(you.tss ?? 0), Number(opponent.tss ?? 0))

  const metrics = useMemo(() => {
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
      const rv = Number(opponent[d.key] ?? 0)
      return { ...d, yv, rv, youWin: yv >= rv }
    })
  }, [you, opponent, de])
  const youScore = metrics.filter((m) => m.youWin).length * 10
  const oppScore = metrics.filter((m) => !m.youWin).length * 10

  function onNudge() {
    if (!opponentId) return
    sendNudge.mutate(opponentId, {
      onSuccess: (res) => setNudgeSent({ text: res.text, intercepted: !!res.coach_intercepted }),
    })
  }

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4 hover-card" style={{ ...cardStyle, borderColor: 'var(--color-accent)' }}>
      {/* Head */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[7px] min-w-0">
          <Swords size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Wochenduell' : 'Weekly Battle'}</span>
          <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-muted)' }}>· {opponentName}</span>
          <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-accent)' }} /></span>
        </div>
        {!earlyWeek && (
          <div className="inline-flex items-center gap-[5px] rounded-full shrink-0" style={{ background: 'var(--color-surface-2)', padding: '5px 10px' }}>
            <Clock size={13} style={{ color: 'var(--color-amber)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)' }}>{timeLeft(weekEnd, de)}</span>
          </div>
        )}
      </div>

      {earlyWeek ? (
        /* Early-week self-duel: pace vs last week instead of a 0:60 scoreboard */
        <div className="rounded-[14px] flex flex-col gap-1.5" style={{ background: 'var(--color-surface-2)', padding: '14px 16px' }}>
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'WOCHENVERGLEICH' : 'WEEK VS WEEK'}</span>
          <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{de ? 'Auf Kurs deiner letzten Woche' : 'On pace with last week'}</span>
          {paceTss != null && (
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {de
                ? `${Math.round(you.tss)} TSS bisher · letzte Woche zu diesem Zeitpunkt: ${Math.round(paceTss)} TSS`
                : `${Math.round(you.tss)} TSS so far · last week at this point: ${Math.round(paceTss)} TSS`}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            {de ? 'Die Punktwertung startet, sobald die Woche Fahrt aufnimmt.' : 'Scoring kicks in once the week gets going.'}
          </span>
        </div>
      ) : (
        /* Face-off */
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-[7px] flex-1">
            <span className="num-display grid place-items-center rounded-full" style={{ width: 56, height: 56, fontSize: 20, color: 'var(--color-ink)', background: 'var(--color-accent)', border: '3px solid var(--color-accent)' }}>{initial(you.handle || 'You')}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{isPast ? (de ? 'Diese Wo.' : 'This wk') : (de ? 'Du' : 'You')}</span>
            <span className="num-display" style={{ fontSize: 30, color: youScore >= oppScore ? 'var(--color-accent)' : 'var(--color-muted)' }}>{youScore}</span>
          </div>
          <div className="flex flex-col items-center gap-[3px]">
            <span className="eyebrow" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'PUNKTE' : 'BATTLE PTS'}</span>
            <span className="num-display grid place-items-center rounded-full" style={{ width: 38, height: 38, fontSize: 13, color: 'var(--color-muted)', background: 'var(--color-surface-2)' }}>VS</span>
          </div>
          <div className="flex flex-col items-center gap-[7px] flex-1">
            <span className="num-display grid place-items-center rounded-full" style={{ width: 56, height: 56, fontSize: 20, color: 'var(--color-ink)', background: isPast ? 'var(--color-surface-3)' : 'var(--color-strain)' }}>{initial(isPast ? (de ? 'Letzte' : 'Last') : opponent.handle)}</span>
            <span className="truncate" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)', maxWidth: 90 }}>{isPast ? (de ? 'Letzte Wo.' : 'Last wk') : opponentName}</span>
            <span className="num-display" style={{ fontSize: 30, color: oppScore > youScore ? loseColor : 'var(--color-muted)' }}>{oppScore}</span>
          </div>
        </div>
      )}

      <div style={{ height: 1, background: 'var(--color-rule)' }} />

      {/* Table head — self-duel columns are THIS WK / LAST WK, never DU / DU */}
      <div className="flex items-center gap-2.5">
        <span className="eyebrow flex-1" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'WERTUNG JE METRIK' : 'SCORE BY METRIC'}</span>
        <span className="eyebrow text-right" style={{ fontSize: 10, color: 'var(--color-accent)', width: 64 }}>{cols.you}</span>
        <span className="eyebrow text-right truncate" style={{ fontSize: 10, color: loseColor, width: 64 }}>{cols.opp}</span>
      </div>

      {/* Metric rows */}
      {metrics.map((m) => (
        <div key={m.key} className="flex items-center gap-2.5" style={{ padding: '3px 0' }}>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span style={{ width: 6, height: 6, borderRadius: 999, background: m.youWin ? 'var(--color-accent)' : loseColor, flexShrink: 0 }} />
            <span className="truncate" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{m.label}</span>
          </div>
          <span className="num-mono text-right inline-flex items-center justify-end gap-1" style={{ fontSize: 14, fontWeight: 700, color: m.youWin ? 'var(--color-accent)' : 'var(--color-muted)', width: 64 }}>
            {m.fmt(m.yv)}{m.youWin && <Check size={11} strokeWidth={3} />}
          </span>
          <span className="num-mono text-right" style={{ fontSize: 14, fontWeight: 700, color: !m.youWin ? loseColor : 'var(--color-muted)', width: 64 }}>{m.fmt(m.rv)}</span>
        </div>
      ))}

      {/* Hover: per-metric head-to-head margin */}
      <div className="hover-reveal">
        <div className="rounded-[12px] flex flex-col gap-2" style={{ background: 'var(--color-surface-2)', padding: '11px 12px' }}>
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'VORSPRUNG JE METRIK' : 'HEAD-TO-HEAD MARGIN'}</span>
          {metrics.map((m) => (
            <div key={m.key} className="flex items-center gap-2.5">
              <span className="truncate flex-1" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{m.label}</span>
              <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: m.youWin ? 'var(--color-accent)' : loseColor }}>
                {m.fmt(Math.abs(m.yv - m.rv))} {m.youWin ? (de ? 'vorn' : 'ahead') : (de ? 'zurück' : 'behind')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11, fontWeight: 500, color: resting ? 'var(--color-forest-2)' : 'var(--color-muted)', lineHeight: 1.4 }}>
        {resting
          ? (de ? 'Coach-Ansage: Diese Woche gewinnt Erholung. Das Duell wartet auf dich.' : 'Coach’s call: recovery wins this week. The duel will wait for you.')
          : (de ? '6 Metriken · je 10 Punkte · Wochensieger gewinnt.' : '6 metrics · each metric worth 10 pts · winner takes the week.')}
      </p>

      {/* Tap-to-expand head-to-head margin (mirrors the hover panel for touch) */}
      {detailsOpen && (
        <div className="rounded-[12px] flex flex-col gap-2" style={{ background: 'var(--color-surface-2)', padding: '11px 12px' }}>
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'VORSPRUNG JE METRIK' : 'HEAD-TO-HEAD MARGIN'}</span>
          {metrics.map((m) => (
            <div key={m.key} className="flex items-center gap-2.5">
              <span className="truncate flex-1" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{m.label}</span>
              <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: m.youWin ? 'var(--color-accent)' : loseColor }}>
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
        <button type="button" onClick={onNudge} disabled={!opponentId || nudging} title={resting ? (de ? 'Coach zuerst — Anstupsen pausiert, bis du erholt bist' : 'Coach first — nudging resumes once you’ve recovered') : !opponentId ? (de ? 'Anstupsen sobald du einen Crew-Rivalen hast' : 'Nudge works once you have a crew rival') : undefined} className="inline-flex items-center justify-center gap-1.5 rounded-full" style={{ background: 'var(--color-accent)', padding: '13px 18px', opacity: !opponentId || nudging ? 0.5 : 1 }}>
          <Hand size={17} style={{ color: 'var(--color-ink)' }} />
          <span className="num-display" style={{ fontSize: 14, color: 'var(--color-ink)' }}>{de ? 'Anstupsen' : 'Nudge'}</span>
        </button>
      </div>

      {/* Nudge confirmation — shows the line the server sent. If the coach
          intercepted (recipient is recovering), say so honestly. */}
      {nudgeSent && (
        <div className="rounded-[12px] flex items-start gap-2" style={{ background: `color-mix(in srgb, ${nudgeSent.intercepted ? 'var(--color-forest-2)' : 'var(--color-accent)'} 14%, transparent)`, padding: '10px 12px' }}>
          <Send size={14} style={{ color: nudgeSent.intercepted ? 'var(--color-forest-2)' : 'var(--color-accent)', flexShrink: 0, marginTop: 2 }} />
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: nudgeSent.intercepted ? 'var(--color-forest-2)' : 'var(--color-accent)' }}>
              {nudgeSent.intercepted
                ? (de ? `COACH HAT ERMUTIGUNG GELIEFERT · ${opponentName.toUpperCase()} ERHOLT SICH` : `COACH DELIVERED ENCOURAGEMENT · ${opponentName.toUpperCase()} IS RECOVERING`)
                : (de ? `GESENDET AN ${opponentName.toUpperCase()}` : `SENT TO ${opponentName.toUpperCase()}`)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.35 }}>“{nudgeSent.text}”</span>
          </div>
          <button type="button" onClick={() => setNudgeSent(null)} aria-label={de ? 'Schließen' : 'Dismiss'} className="grid place-items-center shrink-0">
            <X size={15} style={{ color: 'var(--color-muted)' }} />
          </button>
        </div>
      )}
      {sendNudge.isError && sendNudge.variables === opponentId && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Anstupsen fehlgeschlagen — versuch es nochmal.' : 'Nudge failed — try again.'}</span>
      )}
    </div>
  )
}

function InviteCard({ inv, de, onAccept, onDecline, accepting, declining }: {
  inv: IncomingInvite; de: boolean; onAccept: (joinChallenges: boolean) => void; onDecline: () => void; accepting: boolean; declining: boolean
}) {
  const busy = accepting || declining
  // Pre-existing crew challenges are OPT-IN (unchecked by default) — accepting
  // an invite never silently enters you into a scoreboard.
  const [joinChallenges, setJoinChallenges] = useState(false)
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
      <label className="flex items-center gap-2.5 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '9px 12px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={joinChallenges}
          onChange={(e) => setJoinChallenges(e.target.checked)}
          style={{ accentColor: 'var(--color-accent)', width: 15, height: 15, flexShrink: 0 }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>
          {de ? 'Auch bei Crew-Challenges mitmachen' : 'Also join the crew challenges'}
        </span>
      </label>
      <div className="flex gap-2.5">
        <button type="button" onClick={() => onAccept(joinChallenges)} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full" style={{ background: 'var(--color-accent)', padding: 12, opacity: busy ? 0.6 : 1 }}>
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

function FindPeople({ de, hasCrew, onChallenge }: { de: boolean; hasCrew: boolean; onChallenge?: () => void }) {
  const [q, setQ] = useState('')
  // Debounce keystrokes so we don't fire a request per character. An empty
  // debounced query returns everyone (browsable suggestions).
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  // Suggestions render whatever the backend sends — it filters test/internal
  // accounts server-side; nothing is seeded or hardcoded here.
  const { data: results, isFetching } = useDiscover(debounced)
  const [requested, setRequested] = useState<Set<number>>(new Set())
  // The last handle we successfully invited — drives the confirmation banner.
  const [lastInvited, setLastInvited] = useState<string | null>(null)
  // Crew-challenge entry is OPT-IN: unchecked by default, sent explicitly with
  // every connect so adding a friend never auto-enters anyone into a challenge.
  const [inviteToChallenge, setInviteToChallenge] = useState(false)

  const qc = useQueryClient()
  const connect = useMutation({
    mutationFn: async (vars: { userId: number; handle: string; invite: boolean }) => {
      const res = await apiClient.post('/crews/connect', buildConnectPayload(vars.userId, vars.invite))
      return res.data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['crew'] })
      qc.invalidateQueries({ queryKey: ['connections', 'discover'] })
      qc.invalidateQueries({ queryKey: ['connections', 'invites', 'incoming'] })
      setRequested((prev) => new Set(prev).add(vars.userId))
      setLastInvited(vars.handle)
    },
  })

  function onConnect(userId: number, handle: string) {
    connect.mutate({ userId, handle, invite: inviteToChallenge })
  }

  const rows = results ?? []
  const hasQuery = debounced.length >= 1
  const invitedCount = requested.size

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 rounded-full" style={{ background: 'var(--color-surface-2)', padding: '10px 14px' }}>
        <Search size={16} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={de ? 'Nach Handle oder E-Mail suchen…' : 'Search by handle or email…'}
          className="flex-1 bg-transparent outline-none"
          style={{ fontSize: 14, color: 'var(--color-ink)' }}
          aria-label={de ? 'Fahrer suchen' : 'Search riders'}
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label={de ? 'Löschen' : 'Clear'} className="grid place-items-center shrink-0">
            <X size={15} style={{ color: 'var(--color-muted)' }} />
          </button>
        )}
      </div>

      {/* Crew-challenge entry is opt-in — unchecked by default */}
      <label className="flex items-center gap-2.5 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '9px 12px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={inviteToChallenge}
          onChange={(e) => setInviteToChallenge(e.target.checked)}
          style={{ accentColor: 'var(--color-accent)', width: 15, height: 15, flexShrink: 0 }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>
          {de ? 'Auch zur Crew-Challenge einladen' : 'Also invite to the crew challenge'}
        </span>
      </label>

      {/* Confirmation — invite sent, closes the loop with the accept step */}
      {lastInvited && (
        <div className="rounded-[12px] flex items-start gap-2" style={{ background: 'color-mix(in srgb, var(--color-recovery) 16%, transparent)', padding: '10px 12px' }}>
          <Check size={15} strokeWidth={2.6} style={{ color: 'var(--color-recovery)', flexShrink: 0, marginTop: 1 }} />
          <span className="flex-1 min-w-0" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.4 }}>
            {de
              ? `Einladung an ${lastInvited} gesendet — sie erscheinen in deiner Crew, sobald sie annehmen.`
              : `Invite sent to ${lastInvited} — they'll appear in your crew once they accept.`}
          </span>
          <button type="button" onClick={() => setLastInvited(null)} aria-label={de ? 'Schließen' : 'Dismiss'} className="grid place-items-center shrink-0">
            <X size={14} style={{ color: 'var(--color-muted)' }} />
          </button>
        </div>
      )}

      {/* Section label — clarifies suggestions vs. search results */}
      {rows.length > 0 && (
        <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
          {hasQuery ? (de ? 'ERGEBNISSE' : 'RESULTS') : (de ? 'VORSCHLÄGE' : 'SUGGESTIONS')}
        </span>
      )}

      {/* Results / suggestions — scroll-capped so the list never dominates */}
      <div className="flex flex-col gap-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {isFetching && rows.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Suche…' : 'Searching…'}</p>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {hasQuery ? (de ? 'Niemand gefunden.' : 'No one found.') : (de ? 'Noch keine anderen Fahrer auf der App.' : 'No other riders on the app yet.')}
          </p>
        ) : (
          rows.map((r) => (
            <PersonRow key={r.user_id} r={r} de={de} requested={requested.has(r.user_id)} onConnect={() => onConnect(r.user_id, r.handle)} connecting={connect.isPending && connect.variables?.userId === r.user_id} />
          ))
        )}
      </div>

      {connect.isError && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Einladen fehlgeschlagen — versuch es nochmal.' : 'Invite failed — try again.'}</span>
      )}

      {/* Close the loop: once you've added riders, challenge the whole crew */}
      {onChallenge && (
        <button type="button" onClick={onChallenge} className="inline-flex items-center justify-center gap-1.5 rounded-full w-full" style={{ background: invitedCount > 0 || hasCrew ? 'var(--color-accent)' : 'var(--color-surface-2)', padding: 12, marginTop: 2 }}>
          <Target size={16} style={{ color: invitedCount > 0 || hasCrew ? 'var(--color-ink)' : 'var(--color-ink-2)' }} />
          <span className="num-display" style={{ fontSize: 13, color: invitedCount > 0 || hasCrew ? 'var(--color-ink)' : 'var(--color-ink-2)' }}>
            {de ? 'Crew herausfordern' : 'Challenge your crew'}
          </span>
        </button>
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
          <Clock size={13} style={{ color: 'var(--color-amber)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)' }}>{de ? 'Eingeladen · offen' : 'Invited · pending'}</span>
        </span>
      ) : (
        <button type="button" onClick={onConnect} disabled={connecting} className="inline-flex items-center gap-1.5 rounded-full shrink-0" style={{ background: 'var(--color-accent)', padding: '7px 13px', opacity: connecting ? 0.6 : 1 }}>
          <UserPlus size={14} style={{ color: 'var(--color-ink)' }} />
          <span className="num-display" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{de ? 'Hinzufügen' : 'Add'}</span>
        </button>
      )}
    </div>
  )
}

function ChallengeRow({ icon: Icon, color, name, sub, pct, progress, detail, de, onLeave }: { icon: typeof Trophy; color: string; name: string; sub: string; pct: number; progress: string; detail: string; de: boolean; onLeave: () => void }) {
  // No-guilt: a 0% early in the week is a neutral fact, not a failure — the
  // challenge color only appears once there is actual progress to color.
  const pctColor = pct > 0 ? color : 'var(--color-muted)'
  return (
    <div className="hover-card rounded-[14px] flex flex-col gap-2.5" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center rounded-[11px] shrink-0" style={{ width: 38, height: 38, background: 'var(--color-paper)' }}><Icon size={20} style={{ color: pctColor }} /></span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="num-display truncate" style={{ fontSize: 14, color: 'var(--color-ink)' }}>{name}</span>
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{sub}</span>
        </div>
        <span className="num-display" style={{ fontSize: 13, color: pctColor }}>{pct}%</span>
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
        <span style={{ fontSize: 11, fontWeight: 600, color: pctColor }}>{detail}</span>
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
  // Combined crew progress toward the shared target (pen ProgRow + segmented
  // Stack + Contrib): each participant is one coloured segment of one bar.
  const SEG_COLORS = ['var(--color-accent)', '#8B5CF6', 'var(--color-strain)', 'var(--color-recovery)', 'var(--color-gold)', 'var(--color-move)']
  const combined = c.participants.reduce((s, p) => s + Math.max(0, p.value), 0)
  const combinedPct = c.target > 0 ? Math.min(100, Math.round((combined / c.target) * 100)) : 0
  const leader = [...c.participants].sort((a, b) => b.value - a.value)[0]
  const segs = [...c.participants]
    .sort((a, b) => b.value - a.value)
    .map((p, i) => ({ p, color: SEG_COLORS[i % SEG_COLORS.length], w: c.target > 0 ? Math.min(100, (p.value / c.target) * 100) : 0 }))
  return (
    <div className="hover-card rounded-[14px] flex flex-col gap-3" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
      {/* Head — gold gradient icon + Sora title (pen TitleBlock) */}
      <div className="flex items-center gap-3">
        <span className="grid place-items-center rounded-[14px] shrink-0" style={{ width: 44, height: 44, background: 'linear-gradient(45deg, #FFD166, #FFB020)', boxShadow: '0 0 12px rgba(255,209,102,0.5)' }}>
          <Mountain size={22} style={{ color: '#0A0C0F' }} />
        </span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="num-display truncate" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{c.name}</span>
          <span className="truncate" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
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

      {/* ProgRow — combined value + percent (pen aQkSE) */}
      <div className="flex items-end justify-between">
        <div className="flex items-end gap-1">
          <span className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{fmtChallengeValue(c.metric, combined, de)}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', paddingBottom: 4 }}>/ {targetLabel}</span>
        </div>
        <span className="num-display" style={{ fontSize: 22, color: 'var(--color-gold)' }}>{combinedPct}%</span>
      </div>

      {/* Segmented stack — one coloured segment per contributor (pen YVULv) */}
      {segs.length > 0 && (
        <div className="flex rounded-full overflow-hidden" style={{ height: 14, background: 'var(--color-surface-3)' }}>
          {segs.map(({ p, color, w }) => (
            <span key={p.user_id} style={{ width: `${w}%`, height: '100%', background: color }} />
          ))}
        </div>
      )}

      {/* Contrib — top contributor line (pen K1zLwf) */}
      {leader && (
        <div className="flex items-center gap-1.5">
          <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: 'var(--color-accent)' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
            {de
              ? `${leader.handle}${leader.user_id === myId ? ' (du)' : ''} führt mit ${fmtChallengeValue(c.metric, leader.value, de)} ${metricLabel(c.metric, de)}.`
              : `${leader.handle}${leader.user_id === myId ? ' (you)' : ''} leads with ${fmtChallengeValue(c.metric, leader.value, de)} ${metricLabel(c.metric, de)}.`}
          </span>
        </div>
      )}

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

// ── Crew events ───────────────────────────────────────────────────────

// kind → accent colour, icon, and localized label for the date chip + tag.
const EVENT_KINDS: Array<{ value: EventKind; icon: typeof Bike; color: string; en: string; de: string }> = [
  { value: 'group_ride', icon: Bike, color: 'var(--color-accent)', en: 'Group ride', de: 'Gruppenausfahrt' },
  { value: 'sunrise_ride', icon: Sunrise, color: 'var(--color-gold)', en: 'Sunrise ride', de: 'Sunrise-Ride' },
  { value: 'chaingang', icon: Zap, color: 'var(--color-strain)', en: 'Chaingang', de: 'Chaingang' },
  { value: 'race', icon: Flag, color: 'var(--color-recovery)', en: 'Race', de: 'Rennen' },
]
function eventKindDef(kind: string) {
  return EVENT_KINDS.find((k) => k.value === kind) ?? EVENT_KINDS[0]
}

function EventCard({ ev, de, canUploadTour, onRsvp, rsvpPending, onUploadTour, uploading, uploadError }: {
  ev: CrewEvent
  de: boolean
  canUploadTour: boolean
  onRsvp: (status: RsvpStatus) => void
  rsvpPending: boolean
  onUploadTour: (file: File) => void
  uploading: boolean
  uploadError: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState(false)
  const kind = eventKindDef(ev.kind)
  const start = new Date(ev.starts_at)
  const loc = de ? 'de-DE' : 'en-GB'
  const weekday = start.toLocaleDateString(loc, { weekday: 'short' }).toUpperCase()
  const time = start.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
  const dateLong = start.toLocaleDateString(loc, { day: 'numeric', month: 'short' })

  const km = ev.tour_distance_m != null ? Math.round(ev.tour_distance_m / 1000) : null
  const elev = ev.tour_elevation_m != null ? Math.round(ev.tour_elevation_m) : null
  const goingLabel = de ? `${ev.going_count} dabei` : `${ev.going_count} going`
  const meta = [
    km != null ? `${km} km` : null,
    elev != null ? `${elev} m` : null,
    goingLabel,
  ].filter(Boolean).join(' · ')

  const going = ev.my_status === 'going'
  const maybe = ev.my_status === 'maybe'

  async function onDownload() {
    setDownloading(true)
    try {
      const { downloadCrewEventTour } = await import('../../../api/crewEvents')
      await downloadCrewEventTour(ev.id, ev.tour_filename)
    } catch {
      /* ignore — network/permission surfaced by the browser */
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: 10 }}>
      {/* Head: date chip · name/meta · RSVP */}
      <div className="flex items-center gap-3">
        <div className="grid place-items-center rounded-[12px] shrink-0" style={{ width: 48, height: 48, background: `color-mix(in srgb, ${kind.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${kind.color} 40%, transparent)` }}>
          <span className="num-display" style={{ fontSize: 13, color: kind.color, lineHeight: 1 }}>{weekday}</span>
          <span className="num-mono" style={{ fontSize: 10, fontWeight: 600, color: kind.color, marginTop: 2 }}>{time}</span>
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{ev.name}</span>
          <span className="truncate" style={{ fontSize: 12, color: 'var(--color-muted)' }}>{meta}</span>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button type="button" onClick={() => onRsvp(going ? 'out' : 'going')} disabled={rsvpPending} aria-pressed={going}
            className="inline-flex items-center justify-center gap-1 rounded-full"
            style={{ background: going ? 'color-mix(in srgb, var(--color-recovery) 16%, transparent)' : 'var(--color-accent)', border: going ? '1px solid var(--color-recovery)' : '1px solid var(--color-accent)', padding: '6px 12px', opacity: rsvpPending ? 0.6 : 1 }}>
            {going && <Check size={13} strokeWidth={3} style={{ color: 'var(--color-recovery)' }} />}
            <span style={{ fontSize: 12, fontWeight: 800, color: going ? 'var(--color-recovery)' : 'var(--color-ink)' }}>{going ? (de ? 'Dabei' : 'Going') : (de ? 'Mitfahren' : 'Join')}</span>
          </button>
          <button type="button" onClick={() => onRsvp(maybe ? 'out' : 'maybe')} disabled={rsvpPending} aria-pressed={maybe}
            className="inline-flex items-center justify-center rounded-full"
            style={{ background: maybe ? 'color-mix(in srgb, var(--color-amber) 18%, transparent)' : 'transparent', border: `1px solid ${maybe ? 'var(--color-amber)' : 'var(--color-rule)'}`, padding: '4px 12px', opacity: rsvpPending ? 0.6 : 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: maybe ? 'var(--color-amber)' : 'var(--color-muted)' }}>{de ? 'Vielleicht' : 'Maybe'}</span>
          </button>
        </div>
      </div>

      {/* Meeting point */}
      {ev.meeting_point && (
        <div className="flex items-center gap-1.5">
          <MapPin size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
          <span className="truncate" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{ev.meeting_point}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{dateLong}</span>
        </div>
      )}

      {/* Tour route visualization */}
      {ev.has_tour && ev.tour_polyline && ev.tour_polyline.length > 1 && (
        <div className="rounded-[12px] overflow-hidden" style={{ background: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}>
          <RouteMini polyline={ev.tour_polyline} ariaLabel={de ? `Route für ${ev.name}` : `Route for ${ev.name}`} />
          <div className="flex items-center gap-3 flex-wrap" style={{ padding: '8px 12px', borderTop: '1px solid var(--color-rule)' }}>
            <div className="flex items-center gap-1.5">
              <RouteIcon size={13} style={{ color: 'var(--color-accent)' }} />
              <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>{km ?? '—'} km</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mountain size={13} style={{ color: 'var(--color-gold)' }} />
              <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>{elev ?? '—'} m</span>
            </div>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onDownload} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-full" style={{ background: 'var(--color-surface-2)', padding: '6px 12px', opacity: downloading ? 0.6 : 1 }}>
              <Download size={13} style={{ color: 'var(--color-ink-2)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)' }}>{de ? 'GPX' : 'GPX'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tour upload (creator only, when no tour yet) */}
      {canUploadTour && !ev.has_tour && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUploadTour(f)
              e.target.value = ''
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center justify-center gap-1.5 rounded-full w-full" style={{ background: 'var(--color-surface-3)', border: '1px dashed var(--color-rule)', padding: 10, opacity: uploading ? 0.6 : 1 }}>
            <Upload size={14} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink-2)' }}>{uploading ? (de ? 'Lädt hoch…' : 'Uploading…') : (de ? 'Tour hochladen (GPX)' : 'Upload tour (GPX)')}</span>
          </button>
        </>
      )}
      {uploadError && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Upload fehlgeschlagen — nur GPX bis 10 MB.' : 'Upload failed — GPX only, up to 10 MB.'}</span>
      )}

      {/* Crew reactions on this event (target_type=event) */}
      <div style={{ height: 1, background: 'var(--color-rule)' }} />
      <ReactionBar targetType="event" targetId={ev.id} de={de} />
    </div>
  )
}

function NewEventForm({ de, pending, error, onSubmit }: {
  de: boolean; pending: boolean; error: boolean; onSubmit: (input: CreateEventInput) => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<EventKind>('group_ride')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('07:00')
  const [meeting, setMeeting] = useState('')
  const trimmed = name.trim()
  const valid = trimmed.length > 0 && date.length > 0 && time.length > 0

  function submit() {
    if (!valid || pending) return
    // Combine the local date + time into an ISO instant.
    const startsAt = new Date(`${date}T${time}`).toISOString()
    onSubmit({
      name: trimmed,
      kind,
      starts_at: startsAt,
      meeting_point: meeting.trim() || null,
    })
  }

  const fieldStyle = { background: 'var(--color-paper)', border: '1px solid var(--color-rule)', fontSize: 13, color: 'var(--color-ink)' } as const

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder={de ? 'Event-Name…' : 'Event name…'}
        className="w-full rounded-full outline-none"
        style={{ ...fieldStyle, padding: '10px 14px' }}
      />
      {/* Kind chips */}
      <div className="flex gap-1.5 flex-wrap">
        {EVENT_KINDS.map((k) => {
          const active = k.value === kind
          const KIcon = k.icon
          return (
            <button key={k.value} type="button" onClick={() => setKind(k.value)} aria-pressed={active}
              className="inline-flex items-center gap-1.5 rounded-full"
              style={{ background: active ? `color-mix(in srgb, ${k.color} 18%, transparent)` : 'var(--color-paper)', border: `1px solid ${active ? k.color : 'var(--color-rule)'}`, padding: '6px 11px' }}>
              <KIcon size={13} style={{ color: active ? k.color : 'var(--color-muted)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: active ? k.color : 'var(--color-ink-2)' }}>{de ? k.de : k.en}</span>
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'DATUM' : 'DATE'}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-full outline-none num-mono" style={{ ...fieldStyle, padding: '9px 12px' }} />
        </label>
        <label className="flex flex-col gap-1" style={{ width: 110 }}>
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'ZEIT' : 'TIME'}</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-full outline-none num-mono" style={{ ...fieldStyle, padding: '9px 12px' }} />
        </label>
      </div>
      <input
        type="text"
        value={meeting}
        onChange={(e) => setMeeting(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder={de ? 'Treffpunkt (optional)…' : 'Meeting point (optional)…'}
        className="w-full rounded-full outline-none"
        style={{ ...fieldStyle, padding: '10px 14px' }}
      />
      <button type="button" onClick={submit} disabled={!valid || pending} className="inline-flex items-center justify-center gap-1.5 rounded-full w-full" style={{ background: 'var(--color-accent)', padding: 12, opacity: !valid || pending ? 0.5 : 1 }}>
        <Calendar size={15} style={{ color: 'var(--color-ink)' }} />
        <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{de ? 'Event erstellen' : 'Create event'}</span>
      </button>
      {error && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Erstellen fehlgeschlagen — versuch es nochmal.' : 'Could not create — try again.'}</span>
      )}
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

// The ONE empty-crew card — create a crew here; finding riders happens in the
// Find-People card directly below (no duplicate stacked CTAs).
function EmptyCrew({ de }: { de: boolean }) {
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
      <p style={{ fontSize: 14, color: 'var(--color-ink-2)', maxWidth: '32ch' }}>{de ? 'Noch keine Crew — erstelle eine und lade Fahrer ein, um Duelle und die Rangliste freizuschalten.' : 'No crew yet — create one and invite riders to unlock battles and the leaderboard.'}</p>

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
    </div>
  )
}

// Inviting duel empty state — no auto-created losing scoreboard. The self-duel
// starts only when the athlete feels like racing themself.
function DuelEmptyState({ de, canStart, onStart }: { de: boolean; canStart: boolean; onStart: () => void }) {
  return (
    <div className="rounded-[24px] p-6 flex flex-col items-center gap-3.5 text-center" style={cardStyle}>
      <span className="grid place-items-center rounded-full" style={{ width: 48, height: 48, ...innerStyle }}>
        <Swords size={22} style={{ color: 'var(--color-muted)' }} />
      </span>
      <p style={{ fontSize: 14, color: 'var(--color-ink-2)', maxWidth: '34ch' }}>
        {de ? 'Starte ein Duell, wenn dir nach einem Wettkampf mit dir selbst ist.' : 'Start a duel when you feel like racing yourself.'}
      </p>
      {canStart && (
        <button type="button" onClick={onStart} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2" style={{ background: 'transparent', border: '1px solid var(--color-rule)' }}>
          <Swords size={15} style={{ color: 'var(--color-ink-2)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Duell starten' : 'Start a duel'}</span>
        </button>
      )}
    </div>
  )
}
