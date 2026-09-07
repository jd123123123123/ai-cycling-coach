import { useMemo, useState } from 'react'
import { Search, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import { useToggleReaction } from '../../hooks/useCrewReactions'
import { useCrewRides } from '../../hooks/useCrewRides'
import { useCrewChallenges, useCreateChallenge } from '../../hooks/useChallenges'
import type { StandingRow } from '../../api/crew'
import { DASH } from './w3tokens'
import W3CrewView, { type W3CrewVm, type W3CrewMember, type W3ShowedUpRow, type W3Highlight } from './W3CrewView'
import W3CrewGoalEditor from './W3CrewGoalEditor'
import { W3CrewFeedView } from './W3CrewFeed'
import W3StoryRail from './W3StoryRail'
import { W3FeedFilters, W3CollectiveGoal, W3FeedFoot, W3FeedHead, W3HeadAction, W3FeedSearch } from './W3FeedShell'
import W3FeedNotifications, { useFeedNotifications } from './W3FeedNotifications'
import W3FeedChallenges from './W3FeedChallenges'
import W3RecordCard from './W3RecordCard'
import W3RideDetailsSheet from './W3RideDetailsSheet'
import { tabRides, feedHeadEyebrow, headlineRecord, recordMonth, storiesFromRides, type W3FeedTab } from './w3feedCuts'
import W3Loading from './W3Loading'
import { bucketMeta, thisPeriod, windowChip, windowDays, windowEdges, type W3Period } from './w3crew'

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

// The ceiling is the SERVER'S now (CrewRead.seat_cap, enforced on accept) —
// this is only the fallback for a payload that predates the field.
const SEAT_CAP_FALLBACK = 8
const nf = new Intl.NumberFormat('de-DE')

const ORD = (n: number) => `${n}.`
const WORDS = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf']
const words = (n: number) => WORDS[n] ?? String(n)

const kmLabel = (v: number) => (v >= 10 ? nf.format(Math.round(v)) : v.toFixed(1))

const EMPTY: W3CrewVm = {
  inCrew: false,
  crewName: 'Deine Crew',
  blurb: 'Eine Crew misst jeden Fahrer an seinem eigenen Wochenplan — so stehen eine kurze und eine große Woche auf demselben Board. Lade ein paar Fahrer ein und starte deine.',
  period: 'week', windowChip: '',
  rankOrdinal: DASH, rankSub: '', propsHint: '',
  crewTotals: [], crewTss: DASH, crewTssSub: '', crewKm: DASH, crewKmCoverage: null, avgTss: DASH, yourShare: DASH, outputNote: '',
  members: [], showedUp: [], showedUpFilled: 0, showedUpTotal: 0, showedUpNote: '', gridDow: false, gridEdges: null,
  showDistanceGoal: false,
  distanceKm: 0, distanceGoalKm: 0, distancePct: 0, distanceToGo: 0,
  yourDistanceNote: '', yourSharePct: 0,
  highlights: [], highlightsTitle: '', seatsOpen: SEAT_CAP_FALLBACK, seatsCopy: '',
}

export default function W3CrewPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<W3Period>('week')
  const { data: mine, isError: mineError } = useMyCrew()
  const { data: standings, isError: standingsError } = useCrewStandings(period)
  const { data: crewChallenges } = useCrewChallenges()
  const { data: rides, refetch: refetchRides } = useCrewRides()
  // user_id → portrait, off the standings this page already has. The feed's
  // own contract asks for exactly this rather than fetching a second time.
  const avatars = useMemo(() => {
    const out: Record<number, string | null> = {}
    for (const r of standings?.standings ?? []) {
      out[r.user_id] = r.avatar ?? null
    }
    return out
  }, [standings])
  // THE PEN SELECTS "CREW" FIRST, and that is the right default for a screen
  // about other people: opening on ALLE puts your own ride at the top of a
  // feed you came to read about everyone else.
  const [tab, setTab] = useState<W3FeedTab>('crew')
  // The board is a push off the feed now, not a chip — see `W3CrewView`.
  const [board, setBoard] = useState(false)
  // `null` is closed. An empty string is open-and-empty, which is a different
  // state: it must show every ride, not none.
  const [query, setQuery] = useState<string | null>(null)
  const [bellOpen, setBellOpen] = useState(false)
  // Real, both halves of it: unread nudges and pending invites. The hook is
  // built to return 0 rather than throw when there is no crew, so the bell
  // simply has no dot instead of taking the screen down with it.
  const notifications = useFeedNotifications()
  const [dressing, setDressing] = useState<number | null>(null)
  // Hoisted so the headline card and the feed agree on WHICH ride it is —
  // computing it twice is how the two would drift into showing a card for one
  // ride and suppressing the chip on another.
  //
  // IT IS DERIVED FROM WHAT IS ON SCREEN, NOT FROM EVERYTHING FETCHED. Reading
  // it off the full list meant searching "kanal" left a NEUE BESTLEISTUNG card
  // for Mara's ride standing over a feed the ride had just been filtered out
  // of — a headline about something the screen was no longer showing.
  // My newest ride with no picture on it — what the rail's leading tile is for.
  const myUnfilled = useMemo(
    () => (rides ?? []).find((r) => r.is_mine && r.photo_urls.length === 0),
    [rides],
  )
  // The cut first, then the search inside it — searching within CREW must not
  // silently widen back to everyone.
  const shown = useMemo(() => {
    const cut = tabRides(rides ?? [], tab)
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return cut
    return cut.filter((r) =>
      [r.handle, r.display_name, r.title].some((f) => (f ?? '').toLowerCase().includes(q)))
  }, [rides, tab, query])
  const topRecord = useMemo(() => headlineRecord(shown), [shown])
  // The rail is people, and the card it opens is the ride's own post — the
  // same component the feed below draws, so a story and a post can never
  // disagree about the same ride.
  const stories = useMemo(() => storiesFromRides(rides ?? [], new Date(), (r) => ({
    id: r.id,
    name: r.is_mine ? 'Du' : `@${r.handle}`,
    avatarUrl: avatars[r.user_id] ?? null,
    initial: (r.handle || '?').trim().charAt(0).toUpperCase() || '?',
    mine: r.is_mine,
    card: (
      <W3CrewFeedView rides={[r]} avatars={avatars} variant="page" />
    ),
  })), [rides, avatars])
  const toggleProps = useToggleReaction()
  const createChallenge = useCreateChallenge()
  const [editingGoal, setEditingGoal] = useState(false)
  const [propsGiven, setPropsGiven] = useState(false)

  // The crew's distance goal is a REAL crew challenge (metric distance_km) when
  // one exists — editable below. Falls back to an honest auto-ring otherwise.
  const distanceChallenge = (crewChallenges ?? []).find((c) => c.metric === 'distance_km') ?? null
  // HOW LONG THE CREW STILL HAS. `W3CollectiveGoal` has always drawn this line
  // and the page passed `null`, so the card showed a target with no deadline —
  // the pen's "2 Tage übrig" simply never rendered. The challenge carries
  // `ends_on`; parsing it at LOCAL midnight matters, because `new Date('…')` on
  // a bare date string is UTC and would shift the count by a day west of
  // Greenwich. Counted inclusive of today, and null once it is over.
  const goalDaysLeft = useMemo(() => {
    const iso = distanceChallenge?.ends_on
    if (!iso) return null
    const end = new Date(`${iso}T00:00:00`)
    if (Number.isNaN(end.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Math.round((end.getTime() - today.getTime()) / 86_400_000) + 1
    return days > 0 ? days : null
  }, [distanceChallenge])

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
    const label = (r: StandingRow) => (r.is_you ? 'Du' : `@${r.handle}`)

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
      ? 'Noch kein Fahrer in dieser Crew hat Distanzdaten für dieses Fenster.'
      : kmRows.length < total
        ? `Die Kilometer decken ${words(kmRows.length)} von ${words(total)} Fahrern ab — der Rest hat keine Distanzdaten.`
        : null

    // ── 2 · The crew ──
    const members: W3CrewMember[] = ranked.map((r, i) => ({
      id: r.user_id,
      name: label(r),
      // It was in `StandingRow` the whole time and nothing read it.
      avatar: r.avatar ?? null,
      rank: i + 1,
      tssLabel: nf.format(r.weekly_tss ?? 0),
      kmLabel: r.distance_km != null ? `${kmLabel(r.distance_km)} km` : null,
      // One decimal below ten hours, none above: "3,2 h" is a week, "12 h" is a
      // week, and "12,4 h" is a spreadsheet.
      hoursLabel: r.hours != null && r.hours > 0
        ? `${r.hours >= 10 ? Math.round(r.hours) : r.hours.toFixed(1).replace('.', ',')} h`
        : null,
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
      ? 'Ein gefüllter Block ist ein Tag, an dem ein Fahrer wirklich eine Einheit erfasst hat.'
      : `Ein gefüllter Block ist ein Abschnitt von rund ${Math.round(bm.daysPerBucket)} Tagen mit mindestens einer erfassten Einheit.`

    // ── 4 · Around the world — the crew goal is a WEEKLY challenge, so the ring
    // is only honest on the week window. ──
    const crewHours = ranked.reduce((sum, r) => sum + (r.hours ?? 0), 0)
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
        ? `Du hast ${nf.format(yourKmRounded)} km eingefahren — mehr als ${words(beaten)} von ${words(total)}`
        : `Du hast ${thisPeriod(period)} ${nf.format(yourKmRounded)} km eingefahren`)
      : `Du hast ${thisPeriod(period)} noch keine Distanz erfasst`

    // ── 5 · Highlights — every line derived from the standings numbers ──
    const highlights: W3Highlight[] = []
    const leader = ranked[0]
    highlights.push({
      id: `lead-${leader.user_id}`, name: label(leader), avatar: leader.avatar ?? null, isYou: leader.is_you,
      text: leader.is_you ? `Spitze des Crew-Boards ${thisPeriod(period)}` : `Führt das Crew-Board ${thisPeriod(period)}`,
      badge: `${nf.format(Math.round(leader.weekly_score))} PKT`,
    })
    if (me && myRank > 1) {
      highlights.push({
        id: `you-${me.user_id}`, name: 'Du', avatar: me.avatar ?? null, isYou: true,
        text: `${nf.format(myTss)} TSS${myKm != null && myKm > 0 ? ` · ${kmLabel(myKm)} km` : ''} ${thisPeriod(period)}`,
        badge: ORD(myRank).toUpperCase(),
      })
    }
    const topKm = [...kmRows].sort((a, b) => (b.distance_km as number) - (a.distance_km as number))[0]
    if (topKm && (topKm.distance_km as number) > 0 && !highlights.some((h) => h.id.endsWith(`-${topKm.user_id}`))) {
      highlights.push({
        id: `km-${topKm.user_id}`, name: label(topKm), avatar: topKm.avatar ?? null, isYou: topKm.is_you,
        text: 'Die meisten Kilometer in der Crew',
        badge: `${kmLabel(topKm.distance_km as number)} KM`,
      })
    }
    // Most consistent — the rider with the most active buckets (real).
    const byActive = [...showedUp].sort((a, b) => b.days.filter(Boolean).length - a.days.filter(Boolean).length)[0]
    const activeCount = byActive ? byActive.days.filter(Boolean).length : 0
    if (byActive && activeCount > 0 && !highlights.some((h) => h.id.endsWith(`-${byActive.id}`))) {
      highlights.push({
        id: `act-${byActive.id}`, name: byActive.name, isYou: byActive.isYou,
        text: `An ${activeCount} von ${cols} ${activeCount === 1 ? bm.one : bm.many} dabei`,
        badge: `${activeCount}/${cols}`,
      })
    }

    const seatsOpen = Math.max(0, (mine?.crew?.seat_cap ?? SEAT_CAP_FALLBACK) - total)

    return {
      inCrew: true,
      period,
      crewName: mine?.crew?.name ?? 'Deine Crew',
      // honest description of how the board is scored (matches weekly_score semantics)
      blurb: 'Jeder Fahrer wird an seinem eigenen Wochenplan gemessen — so stehen eine kurze und eine große Woche auf demselben Board.',
      windowChip: windowChip(startISO, endISO),
      rankOrdinal: myRank > 0 ? ORD(myRank) : DASH,
      rankSub: myRank > 0 ? `von ${words(total)} · ${thisPeriod(period)}` : `${words(total)} Fahrer · ${thisPeriod(period)}`,
      propsHint: 'Drei pro Woche. Gib sie für den Einsatz, nicht für die Zahl.', // fixture: props economy copy
      crewTss: nf.format(crewTssNum),
      crewTssSub: `${words(total)} Fahrer · ${thisPeriod(period)}`,
      crewKm: kmRows.length > 0 ? `${nf.format(crewKmRounded)} km` : DASH,
      // THE CREW'S WEEK, summed from the same rows the board is ranked on.
      // Kilometres first, hours second, load last — the order a crew actually
      // says these out loud, and the reverse of the order the retired
      // "Crew-Leistung" card used. A total nobody has data for is dropped
      // rather than printed as a zero: an absent number and a crew that rode
      // nothing are different sentences.
      crewTotals: [
        kmRows.length > 0
          ? { key: 'km', value: nf.format(crewKmRounded), unit: 'km', label: 'ZUSAMMEN GEFAHREN' }
          : null,
        crewHours > 0
          ? { key: 'h', value: nf.format(Math.round(crewHours)), unit: 'h', label: 'IM SATTEL' }
          : null,
        { key: 'tss', value: nf.format(crewTssNum), label: 'CREW TSS' },
      ].filter(Boolean) as { key: string; value: string; unit?: string; label: string }[],
      crewKmCoverage,
      avgTss: nf.format(Math.round(crewTssNum / total)),
      yourShare: me && crewTssNum > 0 ? `${Math.round((myTss / crewTssNum) * 100)}%` : DASH,
      outputNote: 'Punkte sind der Anteil jedes Fahrers an seiner eigenen Wochenvorgabe. TSS und Kilometer sind die rohen Summen für dieses Fenster.',
      members,
      showedUp, showedUpFilled, showedUpTotal, showedUpNote,
      gridDow,
      gridEdges: gridDow ? null : windowEdges(startISO, endISO),
      showDistanceGoal: period === 'week' && kmRows.length > 0,
      distanceKm: crewKmRounded, distanceGoalKm, distancePct, distanceToGo,
      yourDistanceNote, yourSharePct,
      highlights,
      highlightsTitle: `In der Crew ${thisPeriod(period)}`,
      seatsOpen,
      // fixture: the "six to eight" crew-size guidance is a product rule, not a stored field
      seatsCopy: seatsOpen > 0
        ? 'Crews von sechs bis acht halten sich am besten. Weniger, und eine stille Woche fällt niemandem auf.'
        : 'Diese Crew ist komplett — jeder Platz ist besetzt.',
    }
  }, [standings, mine, distanceChallenge, period])

  // Honest invite: share an invite message (no props/discover picker built here yet).
  const invite = async () => {
    const name = mine?.crew?.name
    const text = name ? `Komm in meine Crew „${name}“ und fahr die Woche mit uns.` : 'Komm in meine Crew und fahr die Woche mit uns.'
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
    await createChallenge.mutateAsync({ name: 'Einmal um die Welt', metric: 'distance_km', target, period: 'week' })
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
        onPeriod={setPeriod}
        onOpenMember={(id) => navigate(`/e/w3-crew-member/${id}?period=${period}`)}
        onProps={giveProps}
        onInvite={invite}
        onEditGoal={vm.inCrew && vm.showDistanceGoal ? () => setEditingGoal(true) : undefined}
        board={board}
        onBoard={() => setBoard(true)}
        // BIKER owns crew in the tab bar — backing out of the crew must land
        // where the lit tab says you are, not on Erfolge.
        onBack={board ? () => setBoard(false) : () => navigate('/e/w3-biker')}
        head={
          query != null ? (
            <W3FeedSearch value={query} onChange={setQuery} onClose={() => setQuery(null)} />
          ) : (
            <W3FeedHead
              eyebrow={feedHeadEyebrow()}
              title={board ? vm.crewName : 'Feed'}
              actions={board ? undefined : (
                <>
                  <W3HeadAction icon={<Search size={17} />} label="Fahrten durchsuchen"
                    onClick={() => setQuery('')} />
                  <W3HeadAction icon={<Bell size={17} />} label="Mitteilungen"
                    dot={notifications.count > 0} onClick={() => setBellOpen(true)} />
                </>
              )}
            />
          )
        }
        chips={
          <W3FeedFilters
            value={tab}
            onChange={setTab}
            layoutId="w3-crew-tab"
            options={[
              { key: 'crew', label: 'Crew', count: (rides ?? []).filter((r) => !r.is_mine).length },
              { key: 'all', label: 'Alle', count: (rides ?? []).length },
              { key: 'challenges', label: 'Challenges' },
              { key: 'records', label: 'Rekorde', count: (rides ?? []).filter((r) => r.record != null).length },
            ]}
          />
        }
        feed={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
            {/* ── pen `dly9G`, in its own order ──────────────────────────────
                The head and the chip row are above, owned by the screen. Here:
                the people who were out today, the crew's shared goal, then the
                rides. Everything above the posts is context for them; nothing
                above the posts is a post. */}
            <W3StoryRail
              stories={stories}
              // Only when the rider actually has a ride to dress up.
              onStart={myUnfilled ? () => setDressing(myUnfilled.id) : undefined}
            />

            {/* CHALLENGES IS NOT A CUT OF RIDES. The chip swaps the list for
                the crew's live challenges; `tabRides` returns none for it, so
                rendering both would draw an empty feed underneath. */}
            {tab === 'challenges' ? (
              <div style={{ padding: '0 20px' }}>
                <W3FeedChallenges onCreate={vm.inCrew ? () => setEditingGoal(true) : undefined} />
              </div>
            ) : (
              <>
                {/* REKORDE IS A LIST OF RECORDS, NOT OF RIDES. Filtering the
                    feed to the rides that set one and then drawing them as
                    ordinary posts hid the very thing the cut is named after:
                    the ride showed its photo and its watts, and the record was
                    a chip somewhere below the fold. The pen has a post shape
                    for this — `qH0dz` — and it is this card. */}
                {tab === 'records' ? (
                  <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {shown.map((r) => r.record ? (
                      <W3RecordCard key={r.id} vm={{
                        handle: r.is_mine ? 'Du' : `@${r.handle}`,
                        label: r.record.label,
                        valueW: r.record.value_w,
                        priorW: r.record.prior_best_w,
                        priorWhen: recordMonth(r.record.prior_best_at),
                      }} />
                    ) : null)}
                  </div>
                ) : (
                  <>
                    {/* THE ONE RECORD RAISED TO A HEADLINE. Every ride that set
                        one already wears a chip on its own post; this is the
                        biggest of them, and there is exactly one or none. */}
                    {topRecord?.record ? (
                      <div style={{ padding: '0 20px' }}>
                        <W3RecordCard vm={{
                          handle: topRecord.is_mine ? 'Du' : `@${topRecord.handle}`,
                          label: topRecord.record.label,
                          valueW: topRecord.record.value_w,
                          priorW: topRecord.record.prior_best_w,
                          priorWhen: recordMonth(topRecord.record.prior_best_at),
                        }} />
                      </div>
                    ) : null}

                    {/* THE COLLECTIVE CARD SITS INSIDE THE STREAM, NOT ON TOP
                        OF IT. `dly9G` runs post, post, Kollektiv, post, post —
                        the card is a beat between rides, and hoisting it above
                        them made the feed open on a progress bar instead of on
                        somebody's ride. `W3CrewFeedView` returns null for an
                        empty list, so the split is safe with one ride or none. */}
                    <div style={{ padding: '0 20px' }}>
                      <W3CrewFeedView
                        rides={shown.slice(0, 2)}
                        avatars={avatars}
                        variant="page"
                        onRefresh={() => void refetchRides()}
                        headlinedId={topRecord?.id ?? null}
                      />
                    </div>

                    {/* THE GOAL CARD IS ITSELF A CHALLENGE — the page finds it as
                        the crew's `distance_km` challenge a few lines up, which is
                        why it does not appear under the Challenges cut: the same
                        object would print twice, once as a card and once as a row
                        in the list. Being inside this branch already excludes that
                        cut and the records one. */}
                    {vm.showDistanceGoal && vm.distanceGoalKm > 0 && (
                      <div style={{ padding: '0 20px' }}>
                        <W3CollectiveGoal
                          km={vm.distanceKm}
                          goalKm={vm.distanceGoalKm}
                          pct={vm.distancePct / 100}
                          riders={vm.members.length}
                          daysLeft={goalDaysLeft}
                          onContribute={vm.inCrew && vm.showDistanceGoal ? () => setEditingGoal(true) : undefined}
                        />
                      </div>
                    )}


                    <div style={{ padding: '0 20px' }}>
                      <W3CrewFeedView
                        rides={shown.slice(2)}
                        avatars={avatars}
                        variant="page"
                        onRefresh={() => void refetchRides()}
                        headlinedId={topRecord?.id ?? null}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* The foot names the list it closes. "Das war die Crew von heute"
                under a page of personal bests is a sentence about the wrong
                thing. */}
            {tab !== 'challenges' && shown.length > 0 && (
              <W3FeedFoot text={tab === 'records' ? 'Das waren die Rekorde' : 'Das war die Crew von heute'} />
            )}
          </div>
        }
      />
      <W3FeedNotifications open={bellOpen} onClose={() => setBellOpen(false)} />
      {dressing != null && (
        <W3RideDetailsSheet
          activityId={dressing}
          open
          onClose={() => setDressing(null)}
          onSaved={() => void refetchRides()}
        />
      )}
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
