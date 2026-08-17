import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import { DASH } from './w3tokens'
import W3CrewMemberView, { type W3CrewMemberStat, type W3CrewMemberVm } from './W3CrewMemberView'
import W3Loading from './W3Loading'
import { AVATAR_TINTS, bucketMeta, periodWord, thisPeriod, windowChip, windowDays, windowEdges, type W3Period } from './w3crew'

/**
 * W3 · 11 CREW MEMBER DETAIL, wired. Route /e/w3-crew-member/:id (the crew
 * board hands over `?period=` so the detail opens on the window you were
 * reading).
 *
 * There is no per-member endpoint: the rider's numbers ARE their `StandingRow`
 * in `GET /crews/me/standings?period=…`, which is already scoped to the
 * caller-local window — so the sub-tabs re-fetch the same board and this page
 * reads one row out of it. Everything shown is that row:
 *   TSS            weekly_tss (window total, despite the legacy field name)
 *   distance       distance_km — NULLABLE → "—", never 0
 *   crew points    weekly_score
 *   own-bar share  weekly_tss / weekly_target_tss (week window only — the
 *                  target is a WEEKLY bar, so it isn't a fair denominator for a
 *                  month or a season; those show TSS per day instead)
 *   rhythm         daily_pct buckets, normalised to that rider's own peak
 *   W/kg, VO2max   wkg / vo2max — profile + latest estimate, both nullable
 * Elevation and PRs have no source in this payload and are simply absent.
 */

const nf = new Intl.NumberFormat('de-DE')
const ORD = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const words = (n: number) => WORDS[n] ?? String(n)
const kmLabel = (v: number) => (v >= 10 ? nf.format(Math.round(v)) : v.toFixed(1))
const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${nf.format(Math.abs(n))} ${unit}`

const PERIODS: W3Period[] = ['week', 'month', 'year']

export default function W3CrewMemberPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [search] = useSearchParams()
  const memberId = id ? Number(id) : NaN
  const fromQuery = search.get('period') as W3Period | null
  const [period, setPeriod] = useState<W3Period>(fromQuery && PERIODS.includes(fromQuery) ? fromQuery : 'week')

  const { data: mine } = useMyCrew()
  const { data: standings, isError: standingsError } = useCrewStandings(period)

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
        tint: AVATAR_TINTS[0],
        period, windowChip: chip, rankLine: '',
        headlineKicker: '', headline: DASH, headlineSub: '',
        stats: [], bars: [], barsFilled: 0, barsTotal: 0, barsNote: '', barsEdges: null,
        vsYou: null, vsYouNote: null, footnote: '',
        missingCopy: 'This rider has no entry on your crew board for this window — try another period, or they may have left the crew.',
      }
    }

    const total = ranked.length
    const rank = idx + 1
    const me = rows.find((r) => r.is_you) ?? null
    const crewTss = rows.reduce((n, r) => n + (r.weekly_tss ?? 0), 0)

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
        key: 'km', icon: 'route', label: 'DISTANCE',
        value: row.distance_km != null ? `${kmLabel(row.distance_km)} km` : DASH,
        missing: row.distance_km == null,
      },
      {
        key: 'active', icon: 'calendar', label: `ACTIVE ${bm.many.toUpperCase()}`,
        value: cols > 0 ? `${filled} / ${cols}` : DASH,
        missing: cols === 0,
      },
      {
        key: 'points', icon: 'sparkles', label: 'CREW POINTS',
        value: nf.format(row.weekly_score ?? 0),
      },
    ]
    if (period === 'week') {
      // The target IS a weekly bar, so this comparison is only fair on a week.
      const target = row.weekly_target_tss ?? null
      stats.push({
        key: 'bar', icon: 'gauge', label: 'OWN WEEK BAR',
        value: target && target > 0 ? `${Math.round(((row.weekly_tss ?? 0) / target) * 100)}%` : DASH,
        missing: !target,
      })
    } else {
      stats.push({
        key: 'perday', icon: 'gauge', label: 'TSS / DAY',
        value: days && days > 0 ? nf.format(Math.round((row.weekly_tss ?? 0) / days)) : DASH,
        missing: !days,
      })
    }
    stats.push({
      key: 'wkg', icon: 'zap', label: 'W/KG AT FTP',
      value: row.wkg != null ? row.wkg.toFixed(2) : DASH,
      note: 'from their profile, not this window',
      missing: row.wkg == null,
    })
    stats.push({
      key: 'vo2', icon: 'heart', label: 'VO2MAX',
      value: row.vo2max != null ? row.vo2max.toFixed(1) : DASH,
      note: 'latest estimate on or before the window end',
      missing: row.vo2max == null,
    })

    // ── Against you — only from fields BOTH riders actually have ──
    let vsYou: W3CrewMemberVm['vsYou'] = null
    let vsYouNote: string | null = null
    if (me && !row.is_you) {
      const dTss = (row.weekly_tss ?? 0) - (me.weekly_tss ?? 0)
      const dPts = (row.weekly_score ?? 0) - (me.weekly_score ?? 0)
      vsYou = [
        { label: 'TSS', value: signed(dTss, 'TSS'), ahead: dTss > 0 },
        { label: 'Crew points', value: signed(dPts, 'pts'), ahead: dPts > 0 },
      ]
      if (row.distance_km != null && me.distance_km != null) {
        const dKm = Math.round(row.distance_km - me.distance_km)
        vsYou.push({ label: 'Kilometres', value: signed(dKm, 'km'), ahead: dKm > 0 })
      }
      vsYouNote = dTss === 0
        ? `Level with you on load ${thisPeriod(period)}.`
        : dTss > 0
          ? `${nf.format(dTss)} TSS ahead of you ${thisPeriod(period)}.`
          : `You are ${nf.format(Math.abs(dTss))} TSS ahead of them ${thisPeriod(period)}.`
    }

    return {
      found: true,
      handle: row.is_you ? 'You' : `@${row.handle}`,
      isYou: row.is_you,
      tint: AVATAR_TINTS[(rank - 1) % AVATAR_TINTS.length],
      period,
      windowChip: chip,
      rankLine: `${ORD(rank)} of ${words(total)} · ${thisPeriod(period)}`,
      headlineKicker: `TSS · ${thisPeriod(period).toUpperCase()}`,
      headline: nf.format(row.weekly_tss ?? 0),
      headlineSub: crewTss > 0
        ? `${Math.round(((row.weekly_tss ?? 0) / crewTss) * 100)}% of the crew's ${nf.format(crewTss)} TSS ${thisPeriod(period)}`
        : `Nobody in the crew has logged load ${thisPeriod(period)} yet`,
      stats,
      bars: peak > 0 ? buckets.map((v) => v / peak) : buckets.map(() => 0),
      barsFilled: filled,
      barsTotal: cols,
      barsNote: peak === 0
        ? `No points scored ${thisPeriod(period)} — nothing logged in this window.`
        : bm.unit === 'day'
          ? `Each bar is one day; the tallest is their biggest day of the ${periodWord(period)}.`
          : `Each bar is about ${Math.round(bm.daysPerBucket)} days; the tallest is their strongest stretch of the ${periodWord(period)}.`,
      barsEdges: windowEdges(startISO, endISO),
      vsYou,
      vsYouNote,
      footnote: 'Points are each rider’s share of their OWN weekly bar (their four-week average weekly TSS × 1.05), so the board weighs effort against plan rather than raw volume. TSS and kilometres are the untouched totals for this window; a dash means the app has no source for that number.',
      missingCopy: '',
    }
  }, [standings, mine, memberId, period])

  if (!standings && !standingsError) return <W3Loading label="Rider wird geladen…" />

  return (
    <W3CrewMemberView
      vm={vm}
      onPeriod={setPeriod}
      onBack={() => navigate('/e/w3-crew')}
    />
  )
}
