import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import { useCrewRides } from '../../hooks/useCrewRides'
import { DASH } from './w3tokens'
import W3CrewMemberView, { type W3CrewMemberStat, type W3CrewMemberVm, type W3DuelRow, type W3MemberRide } from './W3CrewMemberView'
import W3Loading from './W3Loading'
import { bucketMeta, thisPeriod, windowChip, windowDays, windowEdges, type W3Period, THEM_TINT } from './w3crew'

/**
 * W3 · 11 CREW MEMBER DETAIL, wired. Route /e/w3-crew-member/:id (the crew
 * board hands over `?period=` so the detail opens on the window you were
 * reading).
 *
 * TWO real sources, no third:
 *
 * 1 · `GET /crews/me/standings?period=…` — there is no per-member endpoint, the
 *     rider's numbers ARE their `StandingRow`, already scoped to the
 *     caller-local window:
 *       TSS            weekly_tss (window total, despite the legacy field name)
 *       distance       distance_km — NULLABLE → "—", never 0
 *       crew points    weekly_score — the share of that rider's OWN weekly bar
 *       own-bar share  weekly_tss / weekly_target_tss (week window only — the
 *                      target is a WEEKLY bar, so it isn't a fair denominator
 *                      for a month or a season; those show TSS per day instead)
 *       rhythm         daily_pct buckets, normalised to that rider's own peak
 *       W/kg, VO2max   wkg / vo2max — profile + latest estimate, both nullable
 *
 * 2 · `GET /crews/me/rides` — the crew ride feed (already the app's sharing
 *     contract in the social tab): the newest N cycling activities across the
 *     WHOLE crew. Filtering it by user_id + the standings window gives this
 *     rider's real ride history. It is a capped feed, not a per-rider archive,
 *     so the card says which part of the window it can actually vouch for
 *     instead of implying completeness.
 *
 * The DUEL (you vs them) leads, and points lead inside it: points are each
 * rider's share of their OWN target (`points_basis: 'own_weekly_target'`), so
 * the fair axis is on top and raw volume sits beneath it. W/kg and VO2max stay
 * out of the duel on purpose — comparing them would be exactly the
 * "stronger rider automatically wins" reading the scoring avoids.
 *
 * Elevation per RIDE is real (feed field); crew-level elevation, PRs and
 * rank-vs-last-period have no source in either payload and are simply absent.
 */

const nf = new Intl.NumberFormat('de-DE')
const dec = (v: number, digits: number) =>
  v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const WORDS = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf']
const words = (n: number) => WORDS[n] ?? String(n)
const kmLabel = (v: number) => (v >= 10 ? nf.format(Math.round(v)) : dec(v, 1))
/** Nominative plural of a `daily_pct` bucket, for a label ("AKTIVE TAGE"). */
const BUCKET_PLURAL = { day: 'TAGE', week: 'WOCHEN', month: 'MONATE' } as const
/** The same plural in prose case ("… und aktive Tage"). */
const BUCKET_PLURAL_CASED = { day: 'Tage', week: 'Wochen', month: 'Monate' } as const

const PERIODS: W3Period[] = ['week', 'month', 'year']

/** How many rides of the feed we pull — the endpoint caps at 100. */
const RIDE_FEED_LIMIT = 100
/** How many of this rider's rides we list before we stop and say how many are left. */
const RIDES_SHOWN = 8

const dayISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Inclusive days left in the window from today, or null when it has closed. */
function daysLeftIn(endISO?: string | null): number | null {
  if (!endISO) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(endISO)
  if (!m) return null
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((end.getTime() - today.getTime()) / 86400000)
  return diff < 0 ? null : diff
}

const dateLabel = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return DASH
  const dow = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')
  return `${dow} · ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`
}

const shortDate = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })

const duration = (seconds: number | null | undefined) => {
  if (!seconds || seconds <= 0) return null
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} h`
}

export default function W3CrewMemberPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [search] = useSearchParams()
  const memberId = id ? Number(id) : NaN
  const fromQuery = search.get('period') as W3Period | null
  const [period, setPeriod] = useState<W3Period>(fromQuery && PERIODS.includes(fromQuery) ? fromQuery : 'week')

  const { data: mine } = useMyCrew()
  const { data: standings, isError: standingsError } = useCrewStandings(period)
  const { data: feed } = useCrewRides(RIDE_FEED_LIMIT)

  const vm = useMemo<W3CrewMemberVm>(() => {
    const rows = standings?.standings ?? []
    const ranked = [...rows].sort((a, b) => b.weekly_score - a.weekly_score)
    const idx = ranked.findIndex((r) => r.user_id === memberId)
    const row = idx >= 0 ? ranked[idx] : null
    // The handle still comes from a real source when the board has no row.
    const known = (mine?.members ?? []).find((m) => m.user_id === memberId)?.handle ?? null

    const startISO = standings?.period_start ?? standings?.week_start
    const endISO = standings?.period_end ?? standings?.week_end
    const chip = windowChip(startISO, endISO)

    if (!row) {
      return {
        found: false,
        handle: known ? `@${known}` : DASH,
        isYou: false,
        tint: THEM_TINT,
        avatar: null,
        period, windowChip: chip, rankLine: '',
        headlineKicker: '', headline: DASH, headlineSub: '',
        stats: [], bars: [], barsFilled: 0, barsTotal: 0, barsNote: '', barsEdges: null,
        duel: null, rides: null, footnote: '',
        missingCopy: 'Dieser Fahrer hat in diesem Fenster keinen Eintrag auf eurem Crew-Board — probier einen anderen Zeitraum, oder er hat die Crew verlassen.',
      }
    }

    const total = ranked.length
    const rank = idx + 1
    const me = rows.find((r) => r.is_you) ?? null
    const crewTss = rows.reduce((n, r) => n + (r.weekly_tss ?? 0), 0)
    const name = row.is_you ? 'Du' : `@${row.handle}`

    const buckets = row.daily_pct ?? []
    const cols = buckets.length
    const bm = bucketMeta(windowDays(startISO, endISO), cols)
    const peak = Math.max(0, ...buckets)
    const filled = buckets.filter((v) => v > 0).length
    const days = windowDays(startISO, endISO)

    // ── The tiles: their load, their volume, their standing, then the two body
    // numbers — each real or an explicit dash. ──
    const stats: W3CrewMemberStat[] = [
      {
        key: 'km', icon: 'route', label: 'DISTANZ',
        value: row.distance_km != null ? `${kmLabel(row.distance_km)} km` : DASH,
        missing: row.distance_km == null,
      },
      {
        key: 'active', icon: 'calendar', label: `AKTIVE ${BUCKET_PLURAL[bm.unit]}`,
        value: cols > 0 ? `${filled} / ${cols}` : DASH,
        missing: cols === 0,
      },
      {
        key: 'points', icon: 'sparkles', label: 'CREW-PUNKTE',
        value: nf.format(row.weekly_score ?? 0),
      },
    ]
    if (period === 'week') {
      // The target IS a weekly bar, so this comparison is only fair on a week.
      const target = row.weekly_target_tss ?? null
      stats.push({
        key: 'bar', icon: 'gauge', label: 'EIGENES WOCHENZIEL',
        value: target && target > 0 ? `${Math.round(((row.weekly_tss ?? 0) / target) * 100)} %` : DASH,
        missing: !target,
      })
    } else {
      stats.push({
        key: 'perday', icon: 'gauge', label: 'TSS PRO TAG',
        value: days && days > 0 ? nf.format(Math.round((row.weekly_tss ?? 0) / days)) : DASH,
        missing: !days,
      })
    }
    stats.push({
      key: 'wkg', icon: 'zap', label: 'W/KG AN FTP',
      value: row.wkg != null ? dec(row.wkg, 2) : DASH,
      note: 'aus dem Profil, nicht aus diesem Fenster',
      missing: row.wkg == null,
    })
    stats.push({
      key: 'vo2', icon: 'heart', label: 'VO2MAX',
      value: row.vo2max != null ? dec(row.vo2max, 1) : DASH,
      note: 'letzter Schätzwert bis Fensterende',
      missing: row.vo2max == null,
    })

    // ── The duel — the centrepiece. Only axes BOTH riders actually have, and
    // the fair one (points = share of each rider's OWN target) on top. ──
    let duel: W3CrewMemberVm['duel'] = null
    if (me && !row.is_you) {
      const share = (a: number, b: number) => {
        const sum = a + b
        return sum > 0 ? [a / sum, b / sum] : [0, 0]
      }
      const myPts = me.weekly_score ?? 0
      const theirPts = row.weekly_score ?? 0
      const dPts = myPts - theirPts            // > 0 → you are ahead
      const [mp, tp] = share(myPts, theirPts)

      const duelRows: W3DuelRow[] = [{
        key: 'points',
        label: 'CREW-PUNKTE',
        chip: 'FAIRSTER VERGLEICH',
        mine: nf.format(myPts),
        theirs: nf.format(theirPts),
        minePct: mp, theirsPct: tp,
        gap: dPts === 0 ? 'gleichauf' : `${nf.format(Math.abs(dPts))} Punkte ${dPts > 0 ? 'vor' : 'zurück'}`,
        youAhead: dPts === 0 ? null : dPts > 0,
      }]

      const myTss = me.weekly_tss ?? 0
      const theirTss = row.weekly_tss ?? 0
      const dTss = myTss - theirTss
      const [mt, tt] = share(myTss, theirTss)
      duelRows.push({
        key: 'tss',
        label: 'TSS',
        mine: nf.format(myTss),
        theirs: nf.format(theirTss),
        minePct: mt, theirsPct: tt,
        gap: dTss === 0 ? 'gleichauf' : `${nf.format(Math.abs(dTss))} ${dTss > 0 ? 'vor' : 'zurück'}`,
        youAhead: dTss === 0 ? null : dTss > 0,
      })

      if (row.distance_km != null && me.distance_km != null) {
        const dKm = me.distance_km - row.distance_km
        const [mk, tk] = share(me.distance_km, row.distance_km)
        duelRows.push({
          key: 'km',
          label: 'DISTANZ',
          mine: `${kmLabel(me.distance_km)} km`,
          theirs: `${kmLabel(row.distance_km)} km`,
          minePct: mk, theirsPct: tk,
          gap: Math.round(dKm) === 0 ? 'gleichauf' : `${kmLabel(Math.abs(dKm))} km ${dKm > 0 ? 'vor' : 'zurück'}`,
          youAhead: Math.round(dKm) === 0 ? null : dKm > 0,
        })
      }

      // Active buckets — only when both riders were bucketed the same way.
      const myBuckets = me.daily_pct ?? []
      if (cols > 0 && myBuckets.length === cols) {
        const myFilled = myBuckets.filter((v) => v > 0).length
        const dAct = myFilled - filled
        const [ma, ta] = share(myFilled, filled)
        duelRows.push({
          key: 'active',
          label: `AKTIVE ${BUCKET_PLURAL[bm.unit]}`,
          mine: `${myFilled} / ${cols}`,
          theirs: `${filled} / ${cols}`,
          minePct: ma, theirsPct: ta,
          gap: dAct === 0 ? 'gleichauf' : `${Math.abs(dAct)} ${dAct > 0 ? 'mehr' : 'weniger'}`,
          youAhead: dAct === 0 ? null : dAct > 0,
        })
      }

      const left = daysLeftIn(endISO)
      duel = {
        theirName: name,
        headline: dPts === 0 ? '±0' : nf.format(Math.abs(dPts)),
        headlineKicker: dPts === 0 ? 'GLEICHAUF BEI DEN PUNKTEN' : dPts > 0 ? 'PUNKTE VORSPRUNG' : 'PUNKTE RÜCKSTAND',
        status: dPts === 0
          ? 'Gleichauf am eigenen Ziel. Die nächste Einheit entscheidet.'
          : dPts > 0
            ? `Du holst gerade mehr von deinem eigenen Ziel als ${name}. Halte den Rhythmus, dann bleibt das so.`
            : `Punkte zählen nur, wie viel du von deinem EIGENEN Ziel holst. Der Rückstand ist also kein Watt-Problem — du schließt ihn mit deinen eigenen Einheiten.`,
        daysLeft: left === null
          ? null
          : left === 0
            ? 'Letzter Tag in diesem Fenster.'
            : left === 1
              ? 'Noch ein Tag in diesem Fenster.'
              : `Noch ${left} Tage in diesem Fenster.`,
        rows: duelRows,
        note: `Punkte sind der Anteil am eigenen Ziel jedes Fahrers. Stärkere Beine gewinnen hier also nicht automatisch — TSS, Distanz und aktive ${BUCKET_PLURAL_CASED[bm.unit]} stehen als rohe Summen daneben.`,
      }
    }

    // ── Their rides — real feed rows for this rider inside this window ──
    let rides: W3CrewMemberVm['rides'] = null
    if (feed && startISO && endISO) {
      // The feed is the newest N rides across the WHOLE crew, so it can stop
      // inside the window. Name the floor rather than imply completeness.
      const truncated = feed.length >= RIDE_FEED_LIMIT
      const oldest = truncated && feed.length > 0 ? new Date(feed[feed.length - 1].started_at) : null
      const floor = oldest && !Number.isNaN(oldest.getTime()) ? oldest : null
      const covers = !floor || dayISO(floor) <= startISO

      const theirs = feed
        .filter((r) => r.user_id === memberId)
        .filter((r) => {
          const d = new Date(r.started_at)
          if (Number.isNaN(d.getTime())) return false
          const iso = dayISO(d)
          return iso >= startISO && iso <= endISO
        })
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

      const maxKm = Math.max(0, ...theirs.map((r) => (r.distance_m ?? 0) / 1000))
      const shown: W3MemberRide[] = theirs.slice(0, RIDES_SHOWN).map((r) => {
        const km = r.distance_m != null && r.distance_m > 0 ? r.distance_m / 1000 : null
        const parts: string[] = []
        const dur = duration(r.duration_seconds)
        if (dur) parts.push(dur)
        if (r.elevation_gain_m != null && r.elevation_gain_m > 0) parts.push(`${nf.format(Math.round(r.elevation_gain_m))} hm`)
        return {
          id: r.id,
          date: dateLabel(r.started_at),
          title: (r.title ?? '').trim() || 'Fahrt',
          distance: km != null ? `${kmLabel(km)} km` : DASH,
          meta: parts.length > 0 ? parts.join(' · ') : DASH,
          distancePct: km != null && maxKm > 0 ? km / maxKm : 0,
        }
      })
      const rest = theirs.length - shown.length

      const who = row.is_you ? 'Du hast' : `${name} hat`
      rides = {
        countChip: covers
          ? `${theirs.length} ${theirs.length === 1 ? 'FAHRT' : 'FAHRTEN'}`
          : `LETZTE ${theirs.length}`,
        rides: shown,
        note: covers
          ? `Jede Fahrt aus diesem Fenster, wie sie im Crew-Feed steht.${rest > 0 ? ` ${rest} weitere sind hier nicht gelistet.` : ''}`
          : `Der Crew-Feed reicht bis ${shortDate(floor!)} zurück — ältere Fahrten aus diesem Fenster fehlen hier.${rest > 0 ? ` ${rest} weitere sind nicht gelistet.` : ''}`,
        empty: theirs.length > 0
          ? null
          : covers
            ? `${who} in diesem Fenster keine Fahrt geloggt.`
            : `Im aktuellen Crew-Feed liegt keine Fahrt aus diesem Fenster — er reicht nur bis ${shortDate(floor!)} zurück.`,
      }
    }

    return {
      found: true,
      handle: name,
      isYou: row.is_you,
      // One tone for "the other rider", always. The board tint it used to take
      // starts at the acid, so the top-ranked crewmate was painted in the
      // colour that means YOU everywhere else on this screen.
      tint: THEM_TINT,
      avatar: row?.avatar ?? null,
      period,
      windowChip: chip,
      rankLine: `${rank}. von ${words(total)} · ${thisPeriod(period)}`,
      headlineKicker: `TSS · ${thisPeriod(period).toUpperCase()}`,
      headline: nf.format(row.weekly_tss ?? 0),
      headlineSub: crewTss > 0
        ? `${Math.round(((row.weekly_tss ?? 0) / crewTss) * 100)} % der ${nf.format(crewTss)} TSS der Crew ${thisPeriod(period)}`
        : `Noch niemand in der Crew hat ${thisPeriod(period)} Belastung geloggt`,
      stats,
      bars: peak > 0 ? buckets.map((v) => v / peak) : buckets.map(() => 0),
      barsFilled: filled,
      barsTotal: cols,
      barsNote: peak === 0
        ? `Keine Punkte ${thisPeriod(period)} — in diesem Fenster ist nichts geloggt.`
        : bm.unit === 'day'
          ? 'Ein Balken ist ein Tag. Der höchste ist der stärkste Tag in diesem Fenster.'
          : `Ein Balken sind rund ${Math.round(bm.daysPerBucket)} Tage. Der höchste ist der stärkste Abschnitt in diesem Fenster.`,
      barsEdges: windowEdges(startISO, endISO),
      duel,
      rides,
      footnote: 'Punkte sind der Anteil am EIGENEN Wochenziel jedes Fahrers (Ø Wochen-TSS der letzten vier Wochen × 1,05). Das Board bewertet also Einsatz gegenüber Plan statt roher Menge. TSS und Kilometer sind die unveränderten Summen für dieses Fenster; ein Strich heißt, die App hat keine Quelle für diesen Wert.',
      missingCopy: '',
    }
  }, [standings, mine, memberId, period, feed])

  if (!standings && !standingsError) return <W3Loading label="Rider wird geladen…" />

  return (
    <W3CrewMemberView
      vm={vm}
      onPeriod={setPeriod}
      onBack={() => navigate('/e/w3-crew')}
    />
  )
}
