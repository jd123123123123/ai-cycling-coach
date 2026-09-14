import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, Flag, Gauge, Medal, Mountain, Route, Sunrise, Timer, Trophy, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePowerProfileView } from '../../hooks/usePowerProfileView'
import { useRewardChallenges } from '../../hooks/useRewardChallenges'
import { useAchievements } from '../../hooks/useAchievements'
import W3LoadError from './W3LoadError'
import { useFtpHistory } from '../../hooks/useFtpHistory'
import { DASH } from './w3tokens'
import { useHeroPanel } from './W3HeroShell'
import { W3WinsContent, type W3WinsVm, type W3Beam, type W3Medal, type W3Milestone } from './W3WinsView'
import W3SceneCollection from './W3SceneCollection'
import W3WinsDockPanel from './W3WinsDockPanel'

/**
 * W3 · ERFOLGE, wired. Route /e/w3-wins, inside the hero room.
 *
 * EVERY NUMBER AND EVERY SENTENCE ON THIS SCREEN IS THE RIDER'S OWN.
 *
 *  · the threshold series → `/athletes/me/ftp/history`;
 *  · the lifetime totals, the 52-week grid, the biggest day and the whole
 *    cabinet → `/achievements/mine`, all detected server-side from the
 *    athlete's own activities;
 *  · the peak watts and the PR flags → their mean-max curve
 *    (`/analytics/power-profile-view`).
 *
 * THE COPY IS COMPOSED, NOT WRITTEN. The pen's statements carry drawn-in
 * specifics, one of which ("Vier davon hat vor dir niemand in deiner Crew
 * geholt") this app cannot check at all. Each line here is built from what
 * actually resolved, in a plain descriptive register: the sentence states what
 * the number is and stops. A chapter whose data is missing returns null and
 * does not render — house rule 9, a section that cannot be true is deleted
 * rather than polished.
 */

const nf = new Intl.NumberFormat('de-DE')
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/**
 * THE DURATIONS COME FROM THE SERVER NOW, NOT FROM THIS FILE.
 *
 * This list used to be hard-coded as 5 s / 1 min / 12 min / 20 min, and three
 * separate things were wrong with it. The server's `HERO_DURATIONS` are 5, 15,
 * 60, 300, 1200 and 3600 — so 15 s, 5 min and 60 min were never asked for and
 * never drawn, and **720 s does not exist in the payload at all**, which meant
 * the "12 Min" row silently vanished through a `flatMap` and a rider with a
 * full power profile saw exactly three bars.
 *
 * The preview fixture invented a 12-minute row, so the screen looked complete
 * in every harness and was missing half its content against the real account —
 * this repository's documented failure shape, and the second time this exact
 * pattern has bitten this page.
 *
 * The labels are the server's too (`label_de`), so a duration added on the
 * backend appears here without a frontend change.
 */

/** The server's icon vocabulary → lucide. An unknown key becomes a medal
 *  rather than throwing: a milestone shipped on the backend must never blank a
 *  tile on the frontend. */
const ICON_MAP: Record<string, LucideIcon> = {
  medal: Medal, mountain: Mountain, sunrise: Sunrise, flame: Zap,
  bike: Bike, route: Route, zap: Zap, gauge: Gauge, trophy: Trophy,
  'trending-up': Gauge, timer: Timer, flag: Flag,
}
const emblem = (icon: string): LucideIcon => ICON_MAP[icon] ?? Medal

/** "2026-08-14" → "08.26" for a beam's date chip. Absent → null, never a guess. */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** "2026-08-14" → "AUG 26" for a medal's note. */
function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }).toUpperCase()
}

/** 18760 → "5:12:40". Seconds matter here: it is a record, not a duration. */
function hms(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function W3WinsPage() {
  const [section, setSection] = useState<'collection' | 'performance'>('collection')
  const nav = useNavigate()
  const { data: challengeFeed } = useRewardChallenges()
  const { data: curveData, isLoading: curveLoading } = usePowerProfileView()
  const { data: ach, isLoading: achLoading, isError: achError, refetch: refetchAch, isFetching: achFetching } = useAchievements('de')
  const { data: ftp, isLoading: ftpLoading } = useFtpHistory()
  // "You have never ridden" is a CLAIM, and it needs all three reads to have
  // actually landed. While they are in flight every chapter is null, so the
  // page used to flash that sentence at every rider — and on a 500 it stayed
  // there, telling somebody with hundreds of rides they had none.
  const stillLoading = curveLoading || achLoading || ftpLoading

  const vm = useMemo<W3WinsVm>(() => {
    const a = ach?.all_time
    const counts = ach?.counts ?? null

    // ── the panel over the floor ──────────────────────────────────────────
    // ONE number, and the meter that IS that number — the idiom Today,
    // Fahrten and Plan all share. The lifetime figures stay, but as the
    // working underneath rather than as two-thirds of a flat table.
    const closestLocked = (ach?.in_progress ?? [])
      .filter((p) => p.pct != null)
      .sort((x, y) => (y.pct ?? 0) - (x.pct ?? 0))[0] ?? null
    const ledger = [
      { key: 'km', value: a?.km != null ? nf.format(Math.round(a.km)) : DASH, unit: 'km', label: 'GESAMT' },
      { key: 'rides', value: a ? nf.format(a.rides) : DASH, label: 'FAHRTEN' },
      { key: 'hours', value: a?.hours != null ? nf.format(Math.round(a.hours)) : DASH, unit: 'h', label: 'IM SATTEL' },
    ]

    // ── 01 · the threshold ────────────────────────────────────────────────
    // Needs at least TWO measurements: one point is a value, not a change, and
    // the chapter's whole sentence is about the difference between them.
    const series = ftp?.history ?? []
    const current = ftp?.current_ftp ?? null
    let ftpChapter: W3WinsVm['ftp'] = null
    if (series.length >= 2 && current != null) {
      const first = series[0].ftp_watts
      const peak = Math.max(...series.map((e) => e.ftp_watts), current)
      const delta = current - first
      // The SPAN OF THE SERIES, not "since the first reading" — `Date.now()`
      // is impure inside a memo, and the honest number here is the distance
      // between the first measurement and the last one anyway. A rider who
      // stopped testing a year ago has 17 months of measurements, not 29.
      const from = new Date(series[0].measured_at).getTime()
      const to = new Date(series[series.length - 1].measured_at).getTime()
      const months = Number.isNaN(from) || Number.isNaN(to)
        ? null
        : Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24 * 30.44)))
      ftpChapter = {
        eyebrow: 'SCHWELLENLEISTUNG',
        statement: delta === 0
          ? `Deine Schwelle liegt unverändert bei ${nf.format(current)} W.`
          : `Deine Schwelle liegt ${nf.format(Math.abs(delta))} W ${delta > 0 ? 'über' : 'unter'} deiner ersten Messung.`,
        firstLabel: 'ERSTE MESSUNG',
        firstValue: nf.format(first),
        nowLabel: 'HEUTE',
        nowValue: nf.format(current),
        unit: 'W',
        points: series.map((e, i) => ({
          pct: peak > 0 ? e.ftp_watts / peak : 0,
          current: i === series.length - 1,
        })),
        caption: months != null
          ? `${series.length} Messungen in ${months} Monaten. Der letzte Wert stammt vom ${shortDate(series[series.length - 1].measured_at) ?? DASH}.`
          : `${series.length} Messungen.`,
      }
    }

    // ── 02 · the milestones ───────────────────────────────────────────────
    // The four locked milestones nearest to falling, with their real remaining
    // progress. Nothing invented: a milestone with no numeric progress is not
    // a row, because a row here IS a bar.
    const nearest = [...(ach?.in_progress ?? [])]
      .filter((p) => p.pct != null && p.progress != null)
      .sort((x, y) => (y.pct ?? 0) - (x.pct ?? 0))
      .slice(0, 4)
    const milestoneRows: W3Milestone[] = nearest.map((p) => ({
      key: p.key,
      icon: emblem(p.icon),
      title: p.title,
      value: p.progress?.label ?? DASH,
      pct: p.pct,
      // `detail` has been in this payload since the endpoint was written and
      // the screen threw it away. It is what the badge actually asks for.
      detail: p.detail || null,
      remaining: p.progress
        ? `Noch ${nf.format(Math.max(0, Math.round(p.progress.target - p.progress.current)))}`
        : null,
    }))
    const closest = nearest[0]
    const remaining = closest?.progress
      ? Math.max(0, closest.progress.target - closest.progress.current)
      : null
    const milestones = milestoneRows.length
      ? {
          eyebrow: 'MEILENSTEINE',
          statement: remaining != null
            ? `${closest.title} ist noch ${nf.format(Math.round(remaining))} entfernt.`
            : `${milestoneRows.length} Meilensteine laufen gerade.`,
          rows: milestoneRows,
        }
      : null

    // ── 01 · the rhythm ───────────────────────────────────────────────────
    // Season, month and week off ONE payload block, all three computed from
    // the same ride scan as the lifetime totals in the dock — so the year on
    // this card and the km under the bike cannot disagree.
    //
    // The chapter needs the 52 weeks to exist; the month and season grains
    // come with them or not at all. `season` is null for a rider with no
    // prior year, and the switch then simply does not offer that tab.
    const con = ach?.consistency ?? null
    const rh = ach?.rhythm ?? null
    const rhythm = con && con.weeks.length
      ? {
          eyebrow: 'DEIN RHYTHMUS',
          // The statement has to describe THIS card. It used to say "in 46 of
          // 52 weeks you rode", which is the consistency grid's sentence — and
          // once that grid moved to its own chapter the line was captioning an
          // instrument that had left the building.
          statement: (() => {
            const y12 = (rh?.months ?? []).reduce((n, m) => n + m.km, 0)
            const d14 = (rh?.days ?? []).reduce((n, d) => n + d.km, 0)
            if (y12 > 0) return `${nf.format(Math.round(y12))} Kilometer in den letzten zwölf Monaten.`
            if (d14 > 0) return `${nf.format(Math.round(d14))} Kilometer in den letzten vierzehn Tagen.`
            return 'Deine Fahrten der letzten zwölf Monate.'
          })(),
          rhythm: {
            season: rh?.season
              ? {
                  year: rh.season.year,
                  prevYear: rh.season.prev_year,
                  current: rh.season.current,
                  previous: rh.season.previous,
                }
              : null,
            months: rh?.months ?? [],
            days: rh?.days ?? [],
            weeks: con.weeks,
            ridden: con.ridden,
            of: con.of,
            longestStreak: con.longest_streak,
          },
        }
      : null

    // ── the consistency grid, as its own chapter ──────────────────────────
    const consistency = con && con.weeks.length
      ? {
          eyebrow: 'KONSTANZ · LETZTE 52 WOCHEN',
          statement: `In ${con.ridden} von ${con.of} Wochen bist du gefahren.`,
          streakLabel: 'LÄNGSTE SERIE',
          streak: con.longest_streak === 1 ? '1 WOCHE' : `${con.longest_streak} WOCHEN`,
          weeks: con.weeks,
        }
      : null


    // ── the power curve ───────────────────────────────────────────────────
    // Every duration the server sends, drawn against the rider's ALL-TIME
    // best at that duration — which is what the envelope is, since it has no
    // date filter. `recent_watts` is their best in the trailing 90 days, so
    // each bar reads as "how close am I now to my own record here".
    const curve = curveData?.available ? curveData.curve ?? [] : []
    const beamRows: W3Beam[] = curve.flatMap((p) => {
      if (p.watts == null) return []
      const recent = p.recent_watts
      return [{
        key: String(p.seconds),
        label: p.label_de,
        value: nf.format(Math.round(p.watts)),
        unit: 'W',
        // The track is the record; the fill is where the rider is now. When
        // there is no recent effort at this duration the bar is empty rather
        // than full — an untested duration is not a maintained one.
        frac: recent != null && p.watts > 0 ? Math.max(0, Math.min(1, recent / p.watts)) : 0,
        recent: recent != null ? nf.format(Math.round(recent)) : null,
        pct: recent != null && p.watts > 0 ? Math.round((recent / p.watts) * 100) : null,
        date: shortDate((p as { achieved_on?: string }).achieved_on),
        fresh: !!p.is_pr,
        // At the record: recent IS the all-time best, to the watt.
        atBest: recent != null && p.watts != null && Math.round(recent) >= Math.round(p.watts),
      }]
    })
    const atBestCount = beamRows.filter((b) => b.atBest).length
    const freshCount = beamRows.filter((b) => b.fresh).length
    const beams = beamRows.length
      ? {
          eyebrow: 'BESTWERTE · LEISTUNGSKURVE',
          statement: freshCount > 0
            ? `${freshCount === 1 ? 'Ein Bestwert ist' : `${freshCount} Bestwerte sind`} zuletzt neu gesetzt worden.`
            : atBestCount > 0
              ? `Bei ${atBestCount === 1 ? 'einer Dauer' : `${atBestCount} Dauern`} bist du aktuell auf deinem Bestwert.`
              : `Deine Spitzenleistung über ${beamRows[0].label} liegt bei ${beamRows[0].value} W.`,
          colLeft: 'DAUER',
          colRight: 'BESTWERT · LETZTE 90 TAGE',
          beams: beamRows,
        }
      : null

    // ── 05 · the cabinet ──────────────────────────────────────────────────
    // Earned first, then the locked ones nearest to falling. Six fills two
    // shelves of three, which is the pen's shape and as many as a rider reads
    // without it becoming a list.
    const earned: W3Medal[] = (ach?.unlocked ?? []).map((u) => ({
      key: u.key,
      icon: emblem(u.icon),
      title: u.title.toUpperCase(),
      note: monthYear(u.unlocked_at) ?? DASH,
      earned: true,
      detail: u.detail || null,
      // The full date and the value that earned it — both already sent.
      sub: [shortDate(u.unlocked_at), u.value_label].filter(Boolean).join(' · ') || null,
      pct: null,
    }))
    const locked: W3Medal[] = [...(ach?.in_progress ?? [])]
      .sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1))
      .map((p) => ({
        key: p.key,
        icon: emblem(p.icon),
        title: p.title.toUpperCase(),
        // `pct` arrives 0–1. A locked badge shows how close it is, or nothing.
        note: p.pct != null ? `${Math.round(p.pct * 100)} %` : DASH,
        earned: false,
        detail: p.detail || null,
        sub: p.progress?.label ?? null,
        pct: p.pct,
      }))
    // The FULL cabinet. The old `.slice(0, 6)` earned-first meant a rider with
    // six badges never saw a single locked one — the near-misses vanished
    // exactly when they motivate most. The shelf shows six; the view holds the
    // rest behind its own "alle anzeigen".
    const shelf = [...earned, ...locked]
    const medals = shelf.length && counts
      ? {
          eyebrow: 'AUSZEICHNUNGEN',
          counter: `${counts.unlocked} VON ${counts.total}`,
          statement: counts.unlocked === 0
            ? `Noch keine der ${counts.total} Auszeichnungen ist freigeschaltet.`
            : `${counts.unlocked} von ${counts.total} Auszeichnungen sind freigeschaltet.`,
          medals: shelf,
        }
      : null

    // ── 06 · the biggest day ──────────────────────────────────────────────
    const big = ach?.biggest_day ?? null
    const biggestDay = big
      ? {
          eyebrow: 'DEIN GRÖSSTER TAG',
          statement: `${nf1.format(big.km)} Kilometer an einem Tag — deine längste Fahrt.`,
          title: [big.title?.toUpperCase(), shortDate(big.date)].filter(Boolean).join(' · ') || 'LÄNGSTE FAHRT',
          km: nf1.format(big.km),
          kmUnit: 'km',
          time: big.duration_s > 0 ? hms(big.duration_s) : DASH,
          ascent: big.ascent_m != null ? nf.format(big.ascent_m) : DASH,
          ascentUnit: 'hm',
          badges: [
            { label: 'LÄNGSTE FAHRT', icon: Trophy },
            ...(big.also_highest ? [{ label: 'HÖCHSTER TAG', icon: Mountain }] : []),
          ],
          cta: 'Als Karte teilen',
          // The route is `/e/w3-share/:id` — a query param left the page with no
          // id at all, so it fell back to the newest ride with a GPS track.
          onShare: () => nav(`/e/w3-share/${big.activity_id}`),
        }
      : null

    const nothing = !ftpChapter && !milestones && !rhythm && !consistency && !beams && !medals && !biggestDay

    return {
      micro: 'ERFOLGE',
      ledger,
      dock: {
        unlocked: counts?.unlocked ?? null,
        total: counts?.total ?? null,
        nextTitle: closestLocked?.title ?? null,
        nextPct: closestLocked?.pct ?? null,
        stats: ledger,
        // The dock is a labelled button promising "Auszeichnungen im Detail" —
        // it now keeps that promise by scrolling to the cabinet.
        onOpen: () => document.getElementById('w3-wins-medals')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      },
      ftp: ftpChapter,
      milestones,
      rhythm,
      consistency,
      beams,
      medals,
      biggestDay,
      // The door to /e/w3-challenges, with live counts — the tab that claims
      // challenges finally holds them. Null until the feed resolves; never a
      // made-up count.
      challenges: challengeFeed
        ? {
            line: challengeFeed.active.length > 0
              ? `${challengeFeed.active.length} Challenge${challengeFeed.active.length === 1 ? '' : 's'} am Laufen`
              : 'Challenges',
            sub: challengeFeed.available.length > 0
              ? `${challengeFeed.available.length} zum Mitmachen · Monatsziele mit RideCoin`
              : 'Monatsziele mit RideCoin',
            onOpen: () => nav('/e/w3-challenges'),
          }
        : null,
      // Nothing resolved AND nothing still coming. While a read is in flight
      // the body draws a skeleton instead — it used to draw literally nothing,
      // which is a black page under a working dock.
      loading: nothing && stillLoading,
      empty: nothing && !stillLoading
        ? 'Deine erste gewertete Fahrt füllt diese Seite. Bis dahin gibt es hier nichts zu zeigen.'
        : null,
    }
  }, [curveData, ach, ftp, nav, stillLoading, challengeFeed])

  const { portal } = useHeroPanel(<W3WinsDockPanel vm={vm.dock} />)

  // A failed achievements read must say so and offer a retry, never fall
  // through to the "you have never ridden" sentence.
  if (section === 'performance' && achError && !ach) {
    return (
      <>
        {portal}
        <W3LoadError
          title="Deine Erfolge laden nicht"
          detail="Wir konnten deine Abzeichen gerade nicht abrufen. Nichts davon geht verloren — das ist nur die Verbindung."
          onRetry={() => void refetchAch()}
          retrying={achFetching}
        />
      </>
    )
  }

  return (
    <>
      {portal}
      <nav className="w3-wins-tabs" aria-label="Erfolge-Bereich"><button aria-pressed={section === 'collection'} onClick={() => setSection('collection')}>Sammlung</button><button aria-pressed={section === 'performance'} onClick={() => setSection('performance')}>Leistung & Abzeichen</button></nav>
      {section === 'collection' ? <W3SceneCollection /> : <W3WinsContent vm={vm} />}
    </>
  )
}
