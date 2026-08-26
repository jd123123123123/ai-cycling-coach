import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, Flag, Gauge, Medal, Mountain, Route, Sunrise, Timer, Trophy, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePowerProfileView } from '../../hooks/usePowerProfileView'
import { useAchievements } from '../../hooks/useAchievements'
import { useFtpHistory } from '../../hooks/useFtpHistory'
import { DASH } from './w3tokens'
import { useHeroPanel } from './W3HeroShell'
import { W3WinsContent, W3WinsDock, type W3WinsVm, type W3Beam, type W3Medal, type W3Milestone } from './W3WinsView'

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

/** The four durations a rider actually talks about, in curve order. */
const RECORD_SECONDS: { key: string; seconds: number; label: string }[] = [
  { key: '5s', seconds: 5, label: '5 Sek' },
  { key: '1m', seconds: 60, label: '1 Min' },
  { key: '12m', seconds: 720, label: '12 Min' },
  { key: '20m', seconds: 1200, label: '20 Min' },
]

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
  const nav = useNavigate()
  const { data: curveData } = usePowerProfileView()
  const { data: ach } = useAchievements('de')
  const { data: ftp } = useFtpHistory()

  const vm = useMemo<W3WinsVm>(() => {
    const a = ach?.all_time
    const counts = ach?.counts ?? null

    // ── the panel over the floor ──────────────────────────────────────────
    const ledger = [
      { key: 'badges', value: counts ? String(counts.unlocked) : DASH, unit: counts ? `von ${counts.total}` : null, label: 'ABZEICHEN' },
      { key: 'km', value: a?.km != null ? nf.format(Math.round(a.km)) : DASH, unit: 'km', label: 'GESAMT' },
      { key: 'rides', value: a ? nf.format(a.rides) : DASH, label: 'FAHRTEN' },
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

    // ── 03 · the consistency grid ─────────────────────────────────────────
    // A week's tile brightens in three steps by how much was ridden, but it is
    // LIT by having been ridden at all — that is the chapter's claim.
    const con = ach?.consistency ?? null
    const consistency = con && con.weeks.length
      ? {
          eyebrow: 'KONSTANZ · LETZTE 52 WOCHEN',
          statement: `In ${con.ridden} von ${con.of} Wochen bist du gefahren.`,
          riddenLabel: 'IM SATTEL',
          ridden: String(con.ridden),
          ofLabel: `von ${con.of} Wochen`,
          streakLabel: 'LÄNGSTE SERIE',
          streak: con.longest_streak === 1 ? '1 Woche' : `${con.longest_streak} Wochen`,
          weeks: con.weeks.map((w) => (w.rides <= 0 ? 0 : w.rides === 1 ? 1 : w.rides === 2 ? 2 : 3)),
        }
      : null

    // ── 04 · the power curve ──────────────────────────────────────────────
    // Each duration as a share of the rider's OWN peak — the shape of their
    // curve, which is a real fact about them, and not a comparison against a
    // month that does not exist here.
    const curve = curveData?.available ? curveData.curve ?? [] : []
    const at = (seconds: number) => curve.find((c) => c.seconds === seconds) ?? null
    const peakW = RECORD_SECONDS.reduce((m, s) => Math.max(m, at(s.seconds)?.watts ?? 0), 0)
    const beamRows: W3Beam[] = RECORD_SECONDS.flatMap((s) => {
      const p = at(s.seconds)
      if (!p || p.watts == null) return []
      return [{
        key: s.key,
        label: s.label,
        value: nf.format(Math.round(p.watts)),
        unit: 'W',
        frac: peakW > 0 ? p.watts / peakW : 0,
        date: shortDate((p as { achieved_on?: string }).achieved_on),
        fresh: !!p.is_pr,
      }]
    })
    const freshCount = beamRows.filter((b) => b.fresh).length
    const beams = beamRows.length
      ? {
          eyebrow: 'BESTWERTE · LEISTUNGSKURVE',
          statement: freshCount > 0
            ? `${freshCount === 1 ? 'Ein Bestwert ist' : `${freshCount} Bestwerte sind`} zuletzt neu gesetzt worden.`
            : `Deine Spitzenleistung über ${beamRows[0].label} liegt bei ${beamRows[0].value} W.`,
          colLeft: 'DAUER',
          colRight: 'SPITZENLEISTUNG',
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
      }))
    const shelf = [...earned, ...locked].slice(0, 6)
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
          onShare: () => nav(`/e/w3-share?ride=${big.activity_id}`),
        }
      : null

    const nothing = !ftpChapter && !milestones && !consistency && !beams && !medals && !biggestDay

    return {
      micro: 'ERFOLGE',
      ledger,
      ftp: ftpChapter,
      milestones,
      consistency,
      beams,
      medals,
      biggestDay,
      empty: nothing
        ? 'Deine erste gewertete Fahrt füllt diese Seite. Bis dahin gibt es hier nichts zu zeigen.'
        : null,
    }
  }, [curveData, ach, ftp, nav])

  const { portal } = useHeroPanel(<W3WinsDock items={vm.ledger} />)

  return (
    <>
      {portal}
      <W3WinsContent vm={vm} />
    </>
  )
}
