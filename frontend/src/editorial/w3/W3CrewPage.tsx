import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import { useToggleReaction } from '../../hooks/useCrewReactions'
import { useCrewChallenges, useCreateChallenge } from '../../hooks/useChallenges'
import type { StandingRow } from '../../api/crew'
import { DASH } from './w3tokens'
import W3CrewView, { type W3CrewVm, type W3CrewMember, type W3ShowedUpRow, type W3Highlight } from './W3CrewView'
import W3CrewGoalEditor from './W3CrewGoalEditor'
import W3Loading from './W3Loading'
import { bucketMeta, periodWord, thisPeriod, windowChip, windowDays, windowEdges, type W3Period } from './w3crew'

/**
 * W3 · 10 CREW, wired. Route /e/w3-crew.
 *
 * WEEK / MONTH / SEASON is one piece of state that becomes the standings
 * `period` param (season → `year`); the server returns the caller-local window
 * in `period_start`/`period_end` and every row total is for THAT window. The
 * `weekly_*` field names are back-compat only — nothing below calls a season
 * total "weekly".
 *
 * REAL from `useMyCrew` + `useCrewStandings(period)`:
 *  - crew TSS (Σ weekly_tss) and crew kilometres (Σ distance_km) for the window
 *  - per rider: window TSS, distance, score vs the crew leader, rank
 *  - the who-showed-up strip, one block per real `daily_pct` bucket
 *  - your share of the crew's TSS and distance, and the derived highlights
 *
 * HONEST AGGREGATION: `distance_km` is nullable per rider. The kilometre total
 * only sums the riders who HAVE the field and says so when that is a subset;
 * with nobody reporting distance it renders "—", never 0.
 *
 * FIXTURE (reward / flavor layer, no backend field — marked inline):
 *  - the props economy (Give props button + "three a week" hint)
 *  - the 500 km "Around the world" ring fallback when no crew challenge is set
 *  - the 8-seat crew cap → "seats open"
 */

const SEAT_CAP = 8 // fixture: crew size ceiling not modelled server-side
const nf = new Intl.NumberFormat('en-US')

const ORD = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const words = (n: number) => WORDS[n] ?? String(n)

const kmLabel = (v: number) => (v >= 10 ? nf.format(Math.round(v)) : v.toFixed(1))

const EMPTY: W3CrewVm = {
  inCrew: false,
  crewName: 'Your crew',
  blurb: 'A crew scores each rider against their own weekly plan — so a short week and a big week sit on the same board. Invite a few riders to start yours.',
  period: 'week', windowChip: '',
  rankOrdinal: DASH, rankSub: '', propsHint: '',
  crewTss: DASH, crewTssSub: '', crewKm: DASH, crewKmCoverage: null, avgTss: DASH, yourShare: DASH, outputNote: '',
  members: [], showedUp: [], showedUpFilled: 0, showedUpTotal: 0, showedUpNote: '', gridDow: false, gridEdges: null,
  showDistanceGoal: false,
  distanceKm: 0, distanceGoalKm: 0, distancePct: 0, distanceToGo: 0,
  yourDistanceNote: '', yourSharePct: 0,
  highlights: [], highlightsTitle: '', seatsOpen: SEAT_CAP, seatsCopy: '',
}

export default function W3CrewPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<W3Period>('week')
  const { data: mine, isError: mineError } = useMyCrew()
  const { data: standings, isError: standingsError } = useCrewStandings(period)
  const { data: crewChallenges } = useCrewChallenges()
  const toggleProps = useToggleReaction()
  const createChallenge = useCreateChallenge()
  const [editingGoal, setEditingGoal] = useState(false)
  const [propsGiven, setPropsGiven] = useState(false)

  // The crew's distance goal is a REAL crew challenge (metric distance_km) when
  // one exists — editable below. Falls back to an honest auto-ring otherwise.
  const distanceChallenge = (crewChallenges ?? []).find((c) => c.metric === 'distance_km') ?? null

  const vm = useMemo<W3CrewVm>(() => {
    const rows = standings?.standings ?? []
    if (rows.length === 0) {
      return { ...EMPTY, period, crewName: mine?.crew?.name ?? EMPTY.crewName }
    }

    const total = rows.length
    const ranked = [...rows].sort((a, b) => b.weekly_score - a.weekly_score)
    const topScore = Math.max(...rows.map((r) => r.weekly_score), 1)
    const me = rows.find((r) => r.is_you) ?? null
    const myRank = ranked.findIndex((r) => r.is_you) + 1
    const label = (r: StandingRow) => (r.is_you ? 'You' : `@${r.handle}`)

    // The window the server actually computed, in the caller's own timezone.
    const startISO = standings?.period_start ?? standings?.week_start
    const endISO = standings?.period_end ?? standings?.week_end

    // Buckets: how many, and what ONE of them covers (a day on a week, roughly
    // a week on a month, roughly a month on a season).
    const cols = ranked[0]?.daily_pct?.length ?? 0
    const bm = bucketMeta(windowDays(startISO, endISO), cols)

    // ── 1 · Crew output — summed from the real rows ──
    const crewTssNum = rows.reduce((n, r) => n + (r.weekly_tss ?? 0), 0)
    const kmRows = rows.filter((r) => r.distance_km != null)
    const crewKmNum = kmRows.reduce((n, r) => n + (r.distance_km as number), 0)
    const myTss = me?.weekly_tss ?? 0
    const myKm = me?.distance_km ?? null

    // Never sum a partial set as if it were the whole crew.
    const crewKmCoverage = kmRows.length === 0
      ? 'No rider in this crew has distance data for this window yet.'
      : kmRows.length < total
        ? `Kilometres cover ${words(kmRows.length)} of the ${words(total)} riders — the rest have no distance data.`
        : null

    // ── 2 · The crew ──
    const members: W3CrewMember[] = ranked.map((r, i) => ({
      id: r.user_id,
      name: label(r),
      rank: i + 1,
      tssLabel: nf.format(r.weekly_tss ?? 0),
      kmLabel: r.distance_km != null ? `${kmLabel(r.distance_km)} km` : null,
      pct: Math.round((r.weekly_score / topScore) * 100),
      isYou: r.is_you,
    }))

    // ── 3 · Who showed up — one block per REAL bucket, never padded to seven ──
    const showedUp: W3ShowedUpRow[] = ranked.map((r) => ({
      id: r.user_id, name: label(r), isYou: r.is_you,
      days: (r.daily_pct ?? []).map((v) => v > 0),
    }))
    const showedUpFilled = showedUp.reduce((n, row) => n + row.days.filter(Boolean).length, 0)
    const showedUpTotal = total * cols
    const gridDow = period === 'week' && cols === 7 && bm.unit === 'day'
    const showedUpNote = bm.unit === 'day'
      ? 'A filled block is a day a rider actually logged a session.'
      : `A filled block is a stretch of about ${Math.round(bm.daysPerBucket)} days with at least one logged session.`

    // ── 4 · Around the world — the crew goal is a WEEKLY challenge, so the ring
    // is only honest on the week window. ──
    const crewKmRounded = Math.round(crewKmNum)
    const yourKmRounded = myKm != null ? Math.round(myKm) : 0
    const distanceGoalKm = distanceChallenge
      ? Math.round(distanceChallenge.target)
      : Math.max(500, Math.ceil((crewKmRounded || 1) / 500) * 500)
    const distancePct = Math.round((crewKmRounded / distanceGoalKm) * 100)
    const distanceToGo = Math.max(0, distanceGoalKm - crewKmRounded)
    const yourSharePct = crewKmRounded > 0 ? Math.round((yourKmRounded / crewKmRounded) * 100) : 0
    const beaten = myKm != null
      ? rows.filter((r) => !r.is_you && r.distance_km != null && (r.distance_km as number) < myKm).length
      : 0
    const yourDistanceNote = yourKmRounded > 0
      ? (beaten > 0
        ? `You've put in ${nf.format(yourKmRounded)} km — more than ${words(beaten)} of the ${words(total)}`
        : `You've put in ${nf.format(yourKmRounded)} km ${thisPeriod(period)}`)
      : `You have no distance logged ${thisPeriod(period)} yet`

    // ── 5 · Highlights — every line derived from the standings numbers ──
    const highlights: W3Highlight[] = []
    const leader = ranked[0]
    highlights.push({
      id: `lead-${leader.user_id}`, name: label(leader), isYou: leader.is_you,
      text: leader.is_you ? `Top of the crew board ${thisPeriod(period)}` : `Leads the crew board ${thisPeriod(period)}`,
      badge: `${nf.format(Math.round(leader.weekly_score))} PTS`,
    })
    if (me && myRank > 1) {
      highlights.push({
        id: `you-${me.user_id}`, name: 'You', isYou: true,
        text: `${nf.format(myTss)} TSS${myKm != null && myKm > 0 ? ` · ${kmLabel(myKm)} km` : ''} ${thisPeriod(period)}`,
        badge: ORD(myRank).toUpperCase(),
      })
    }
    const topKm = [...kmRows].sort((a, b) => (b.distance_km as number) - (a.distance_km as number))[0]
    if (topKm && (topKm.distance_km as number) > 0 && !highlights.some((h) => h.id.endsWith(`-${topKm.user_id}`))) {
      highlights.push({
        id: `km-${topKm.user_id}`, name: label(topKm), isYou: topKm.is_you,
        text: 'Most kilometres logged in the crew',
        badge: `${kmLabel(topKm.distance_km as number)} KM`,
      })
    }
    // Most consistent — the rider with the most active buckets (real).
    const byActive = [...showedUp].sort((a, b) => b.days.filter(Boolean).length - a.days.filter(Boolean).length)[0]
    const activeCount = byActive ? byActive.days.filter(Boolean).length : 0
    if (byActive && activeCount > 0 && !highlights.some((h) => h.id.endsWith(`-${byActive.id}`))) {
      highlights.push({
        id: `act-${byActive.id}`, name: byActive.name, isYou: byActive.isYou,
        text: `Showed up in ${activeCount} of ${cols} ${activeCount === 1 ? bm.one : bm.many}`,
        badge: `${activeCount}/${cols}`,
      })
    }

    const seatsOpen = Math.max(0, SEAT_CAP - total)

    return {
      inCrew: true,
      period,
      crewName: mine?.crew?.name ?? 'Your crew',
      // honest description of how the board is scored (matches weekly_score semantics)
      blurb: 'Each rider is scored against their own weekly plan — so a short week and a big week sit on the same board.',
      windowChip: windowChip(startISO, endISO),
      rankOrdinal: myRank > 0 ? ORD(myRank) : DASH,
      rankSub: myRank > 0 ? `of ${words(total)} ${thisPeriod(period)}` : `${words(total)} riders ${thisPeriod(period)}`,
      propsHint: 'Three a week. Spend them on the effort, not the number.', // fixture: props economy copy
      crewTss: nf.format(crewTssNum),
      crewTssSub: `${words(total)} riders · ${thisPeriod(period)}`,
      crewKm: kmRows.length > 0 ? `${nf.format(crewKmRounded)} km` : DASH,
      crewKmCoverage,
      avgTss: nf.format(Math.round(crewTssNum / total)),
      yourShare: me && crewTssNum > 0 ? `${Math.round((myTss / crewTssNum) * 100)}%` : DASH,
      outputNote: 'Points are each rider’s share of their own weekly bar. TSS and kilometres are the raw totals for this window.',
      members,
      showedUp, showedUpFilled, showedUpTotal, showedUpNote,
      gridDow,
      gridEdges: gridDow ? null : windowEdges(startISO, endISO),
      showDistanceGoal: period === 'week' && kmRows.length > 0,
      distanceKm: crewKmRounded, distanceGoalKm, distancePct, distanceToGo,
      yourDistanceNote, yourSharePct,
      highlights,
      highlightsTitle: `This ${periodWord(period)} in the crew`,
      seatsOpen,
      // fixture: the "six to eight" crew-size guidance is a product rule, not a stored field
      seatsCopy: seatsOpen > 0
        ? 'Crews of six to eight hold each other best. Fewer, and a quiet week goes unnoticed.'
        : 'This crew is at full strength — every seat is taken.',
    }
  }, [standings, mine, distanceChallenge, period])

  // Honest invite: share an invite message (no props/discover picker built here yet).
  const invite = async () => {
    const name = mine?.crew?.name
    const text = name ? `Join my crew "${name}" and ride the week with us.` : 'Join my crew and ride the week with us.'
    try {
      if (navigator.share) await navigator.share({ text })
      else await navigator.clipboard.writeText(text)
    } catch { /* user dismissed the share sheet — no-op */ }
  }

  // Give props — a real crew_week cheer (toggles the caller's 👏 on the crew's
  // week). Optimistic on the button.
  const giveProps = () => {
    setPropsGiven((v) => !v)
    toggleProps.mutate({ targetType: 'crew_week', emoji: '👏' })
  }

  // Set/replace the crew's distance goal as a real weekly crew challenge.
  const saveGoal = async (target: number) => {
    await createChallenge.mutateAsync({ name: 'Around the world', metric: 'distance_km', target, period: 'week' })
    setEditingGoal(false)
  }

  // Wait for the selected window's OWN numbers rather than showing another
  // period's under the newly tapped tab. "Not in a crew" (404) falls through to
  // the honest empty state instead of spinning forever.
  const inCrewOrUnknown = mine === undefined || mine?.crew != null
  if (!standings && !standingsError && !mineError && inCrewOrUnknown) return <W3Loading label="Crew wird geladen…" />

  return (
    <>
      <W3CrewView
        vm={{ ...vm, propsGiven }}
        onBack={() => navigate('/e/w3-wins')}
        onPeriod={setPeriod}
        onOpenMember={(id) => navigate(`/e/w3-crew-member/${id}?period=${period}`)}
        onProps={giveProps}
        onInvite={invite}
        onEditGoal={vm.inCrew && vm.showDistanceGoal ? () => setEditingGoal(true) : undefined}
      />
      {editingGoal && (
        <W3CrewGoalEditor
          currentKm={vm.distanceGoalKm}
          onSave={saveGoal}
          onClose={() => setEditingGoal(false)}
          saving={createChallenge.isPending}
        />
      )}
    </>
  )
}
