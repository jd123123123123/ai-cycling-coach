import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import type { StandingRow } from '../../api/crew'
import W3CrewView, { type W3CrewVm, type W3CrewMember, type W3ShowedUpRow, type W3Highlight } from './W3CrewView'

/**
 * W3 · 10 CREW, wired. Route /e/w3-crew.
 *
 * REAL from `useMyCrew` + `useCrewStandings('week')`:
 *  - crew name, member roster + your rank on the board
 *  - each rider's active days (sessions) and score vs the crew leader (the %)
 *  - the who-showed-up week grid (from each rider's daily_pct)
 *  - summed crew distance, your share, and who you out-rode
 *  - the "this week" highlights, all derived from the standings numbers
 *
 * FIXTURE (reward / flavor layer, no backend field — marked inline):
 *  - the props economy (Give props button + "three a week" hint)
 *  - the 500 km "Around the world" goal ceiling
 *  - the 8-seat crew cap → "seats open"
 *  - the "up one" rank delta (no prior-week rank stored) — omitted live, honest
 */

const SEAT_CAP = 8 // fixture: crew size ceiling not modelled server-side
const nf = new Intl.NumberFormat('en-US')

const ORD = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const words = (n: number) => WORDS[n] ?? String(n)

// Each rider's ≤14 daily buckets → the 7 most recent days as filled/empty.
function weekGrid(daily: number[] | undefined): boolean[] {
  const a = (daily ?? []).slice(-7).map((v) => v > 0)
  while (a.length < 7) a.unshift(false)
  return a
}
const activeDays = (daily: number[] | undefined) => (daily ?? []).filter((v) => v > 0).length
const dist = (r: StandingRow) => Math.max(0, r.distance_km ?? 0)

const EMPTY: W3CrewVm = {
  inCrew: false,
  crewName: 'Your crew',
  blurb: 'A crew scores each rider against their own weekly plan — so a short week and a big week sit on the same board. Invite a few riders to start yours.',
  rankOrdinal: '—', rankSub: '', propsHint: '', periodChip: 'MON–SUN',
  members: [], showedUp: [], showedUpFilled: 0, showedUpTotal: 0, showedUpNote: '',
  distanceKm: 0, distanceGoalKm: 0, distancePct: 0, distanceToGo: 0,
  yourDistanceKm: 0, yourDistanceNote: '', yourSharePct: 0,
  highlights: [], seatsOpen: SEAT_CAP, seatsCopy: '',
}

export default function W3CrewPage() {
  const navigate = useNavigate()
  const { data: mine } = useMyCrew()
  const { data: standings } = useCrewStandings('week')

  const vm = useMemo<W3CrewVm>(() => {
    const rows = standings?.standings ?? []
    if (rows.length === 0) {
      return { ...EMPTY, crewName: mine?.crew?.name ?? EMPTY.crewName }
    }

    const total = rows.length
    const ranked = [...rows].sort((a, b) => b.weekly_score - a.weekly_score)
    const topScore = Math.max(...rows.map((r) => r.weekly_score), 1)
    const me = rows.find((r) => r.is_you) ?? null
    const myRank = ranked.findIndex((r) => r.is_you) + 1

    const label = (r: StandingRow) => (r.is_you ? 'You' : `@${r.handle}`)

    // ── The crew: rank, active days, score vs leader (real) ──
    const members: W3CrewMember[] = ranked.map((r, i) => ({
      id: r.user_id,
      name: label(r),
      rank: i + 1,
      sessions: activeDays(r.daily_pct),
      pct: Math.round((r.weekly_score / topScore) * 100),
      isYou: r.is_you,
    }))

    // ── Who showed up: week grid from each rider's daily_pct (real) ──
    const showedUp: W3ShowedUpRow[] = ranked.map((r) => ({
      id: r.user_id, name: label(r), isYou: r.is_you, days: weekGrid(r.daily_pct),
    }))
    const showedUpFilled = showedUp.reduce((n, row) => n + row.days.filter(Boolean).length, 0)
    const showedUpTotal = total * 7

    // ── Around the world: summed crew distance (real); goal ceiling (fixture) ──
    const crewKm = Math.round(rows.reduce((n, r) => n + dist(r), 0))
    const yourKm = me ? Math.round(dist(me)) : 0
    // fixture: no crew distance target exists server-side — round up to a 500 km ring.
    const distanceGoalKm = Math.max(500, Math.ceil((crewKm || 1) / 500) * 500)
    const distancePct = Math.round((crewKm / distanceGoalKm) * 100)
    const distanceToGo = Math.max(0, distanceGoalKm - crewKm)
    const yourSharePct = crewKm > 0 ? Math.round((yourKm / crewKm) * 100) : 0
    const beaten = me ? rows.filter((r) => !r.is_you && dist(r) < dist(me)).length : 0
    const yourDistanceNote = yourKm > 0
      ? (beaten > 0 ? `You've put in ${nf.format(yourKm)} km — more than ${words(beaten)} of the ${words(total)}` : `You've put in ${nf.format(yourKm)} km this week`)
      : 'You have no distance logged this week yet'

    // ── This week in the crew: derived from the standings numbers (real) ──
    const highlights: W3Highlight[] = []
    const leader = ranked[0]
    highlights.push({
      id: `lead-${leader.user_id}`, name: label(leader), isYou: leader.is_you,
      text: leader.is_you ? 'Top of the crew board this week' : 'Leads the crew board this week',
      badge: `${nf.format(Math.round(leader.weekly_score))} PTS`,
    })
    if (me && myRank > 1) {
      // "me" exists and isn't already the leader → add a personal line
      highlights.push({
        id: `you-${me.user_id}`, name: 'You', isYou: true,
        text: `${activeDays(me.daily_pct)} session${activeDays(me.daily_pct) === 1 ? '' : 's'} in${yourKm > 0 ? ` · ${nf.format(yourKm)} km` : ''}`,
        badge: `${ORD(myRank).toUpperCase()}`,
      })
    }
    const topKm = [...rows].sort((a, b) => dist(b) - dist(a))[0]
    if (topKm && dist(topKm) > 0 && !highlights.some((h) => h.id.endsWith(`-${topKm.user_id}`))) {
      highlights.push({
        id: `km-${topKm.user_id}`, name: label(topKm), isYou: topKm.is_you,
        text: 'Most kilometres logged in the crew',
        badge: `${nf.format(Math.round(dist(topKm)))} KM`,
      })
    }

    const seatsOpen = Math.max(0, SEAT_CAP - total)

    return {
      inCrew: true,
      crewName: mine?.crew?.name ?? 'Your crew',
      // honest description of how the board is scored (matches weekly_score semantics)
      blurb: 'Each rider is scored against their own weekly plan — so a short week and a big week sit on the same board.',
      rankOrdinal: myRank > 0 ? ORD(myRank) : '—',
      rankSub: myRank > 0 ? `of ${words(total)} this week` : `${words(total)} riders this week`,
      propsHint: 'Three a week. Spend them on the effort, not the number.', // fixture: props economy copy
      periodChip: 'MON–SUN',
      members,
      showedUp, showedUpFilled, showedUpTotal,
      showedUpNote: 'A filled block is a session a rider actually logged this week.',
      distanceKm: crewKm, distanceGoalKm, distancePct, distanceToGo,
      yourDistanceKm: yourKm, yourDistanceNote, yourSharePct,
      highlights,
      seatsOpen,
      // fixture: the "six to eight" crew-size guidance is a product rule, not a stored field
      seatsCopy: seatsOpen > 0
        ? 'Crews of six to eight hold each other best. Fewer, and a quiet week goes unnoticed.'
        : 'This crew is at full strength — every seat is taken.',
    }
  }, [standings, mine])

  // Honest invite: share an invite message (no props/discover picker built here yet).
  const invite = async () => {
    const name = mine?.crew?.name
    const text = name ? `Join my crew "${name}" and ride the week with us.` : 'Join my crew and ride the week with us.'
    try {
      if (navigator.share) await navigator.share({ text })
      else await navigator.clipboard.writeText(text)
    } catch { /* user dismissed the share sheet — no-op */ }
  }

  return (
    <W3CrewView
      vm={vm}
      onBack={() => navigate('/e/w3-wins')}
      onProps={() => { /* fixture: props economy not wired to a backend yet */ }}
      onInvite={invite}
    />
  )
}
