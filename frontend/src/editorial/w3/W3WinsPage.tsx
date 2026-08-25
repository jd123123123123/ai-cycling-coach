import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePowerProfileView } from '../../hooks/usePowerProfileView'
import { useWallet } from '../../hooks/useWallet'
import { useAchievements } from '../../hooks/useAchievements'
import { useRewardChallenges } from '../../hooks/useRewardChallenges'
import { DASH } from './w3tokens'
import W3WinsView, {
  type W3WinsVm, type W3Badge, type W3BadgeIcon, type W3Record, type W3LifeTile,
} from './W3WinsView'

/**
 * W3 · ERFOLGE, wired. Route /e/w3-wins.
 *
 * EVERY NUMBER ON THIS SCREEN IS THE RIDER'S OWN.
 *
 *  · the cabinet, the hero badge, its unlock date, the locked badges' real
 *    remaining progress and the lifetime totals → `/achievements/mine`,
 *    detected server-side from the athlete's activities + PMC + streams;
 *  · the RideCoin balance → the wallet;
 *  · the count of live challenges and of joinable ones → `/challenges/mine`;
 *  · the record watts, the W/kg and the PR flags → the athlete's own mean-max
 *    curve (`/analytics/power-profile-view`).
 *
 * Nothing else is drawn. The previous version of this page carried a
 * hand-written `RECORD_SPEC` of invented month-over-month deltas ("+40 ggü.
 * Mai") and an entire fabricated community-pool section; both are gone rather
 * than restyled. See `W3WinsView`'s header for why.
 *
 * The screen asks for German (`useAchievements('de')`) — it was reading the
 * English catalogue onto a German page.
 */

const nf = new Intl.NumberFormat('de-DE')
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

// The four durations a rider actually talks about, in curve order.
const RECORD_SECONDS: { key: string; seconds: number; label: string }[] = [
  { key: '5s', seconds: 5, label: '5 SEK' },
  { key: '1m', seconds: 60, label: '1 MIN' },
  { key: '12m', seconds: 720, label: '12 MIN' },
  { key: '20m', seconds: 1200, label: '20 MIN' },
]

// The server's icon vocabulary → the emblem set. Unknown keys become a medal
// rather than throwing: a new milestone shipped on the backend must not blank
// a tile on the frontend.
const ICON_MAP: Record<string, W3BadgeIcon> = {
  medal: 'medal', mountain: 'mountain', sunrise: 'sunrise', flame: 'flame',
  bike: 'bike', route: 'route', zap: 'zap', gauge: 'gauge', trophy: 'trophy',
  'trending-up': 'gauge',
}
const emblem = (icon: string): W3BadgeIcon => ICON_MAP[icon] ?? 'medal'

/** "2026-08-14" → "14. August". Invalid or absent → null, never a guess. */
function dayMonth(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })
}

export default function W3WinsPage() {
  const nav = useNavigate()
  const { data } = usePowerProfileView()
  const { data: wallet } = useWallet()
  const { data: ach } = useAchievements('de')
  const { data: challenges } = useRewardChallenges()

  const vm = useMemo<W3WinsVm>(() => {
    const now = new Date()
    const month = now.toLocaleDateString('de-DE', { month: 'long' }).toUpperCase()

    // ── The cabinet ────────────────────────────────────────────────────────
    // Earned first, then the locked ones nearest to falling — that ordering is
    // the grid's whole argument: what you have, then what is one ride away.
    const inProgress = [...(ach?.in_progress ?? [])]
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
    const badges: W3Badge[] = ach
      ? [
          ...ach.unlocked.map<W3Badge>((u) => ({
            key: u.key,
            icon: emblem(u.icon),
            name: u.title,
            caption: (u.value_label ?? dayMonth(u.unlocked_at) ?? u.detail ?? '').toUpperCase(),
            earned: true,
            pct: null,
          })),
          ...inProgress.map<W3Badge>((p) => ({
            key: p.key,
            icon: emblem(p.icon),
            name: p.title,
            caption: (p.progress?.label ?? p.detail ?? '').toUpperCase(),
            earned: false,
            // A locked badge shows how close it is, or it shows nothing —
            // never a bar at an invented width.
            pct: p.pct != null ? Math.max(0, Math.min(1, p.pct / 100)) : null,
          })),
        ].slice(0, 9)
      : []

    // ── The records ────────────────────────────────────────────────────────
    // The bar is each duration as a share of the rider's OWN peak — the shape
    // of their power curve, which is a real fact about them. It is not a
    // comparison against a past month, because no such number exists here.
    const curve = data?.available ? data.curve ?? [] : []
    const at = (seconds: number) => curve.find((c) => c.seconds === seconds) ?? null
    const peak = RECORD_SECONDS.reduce((m, s) => Math.max(m, at(s.seconds)?.watts ?? 0), 0)
    const records: W3Record[] = RECORD_SECONDS.map((s) => {
      const p = at(s.seconds)
      const w = p?.watts ?? null
      return {
        key: s.key,
        label: p?.label_de ?? s.label,
        value: w != null ? `${nf.format(Math.round(w))} W` : DASH,
        wkg: p?.wkg != null ? `${nf1.format(p.wkg)} W/kg` : null,
        frac: w != null && peak > 0 ? w / peak : null,
        pr: !!p?.is_pr,
      }
    })

    // ── Everything, ever ───────────────────────────────────────────────────
    // Distance leads because it is the number a rider quotes. A total that is
    // absent is dropped from the grid rather than shown as a zero — zero rides
    // and "we have not counted yet" are different sentences.
    const a = ach?.all_time
    const life: W3LifeTile[] = a
      ? ([
          a.km != null ? { key: 'km', value: nf.format(Math.round(a.km)), unit: 'km', label: 'GEFAHREN INSGESAMT' } : null,
          { key: 'rides', value: nf.format(a.rides), unit: '', label: 'FAHRTEN' },
          a.hours != null ? { key: 'hours', value: nf.format(Math.round(a.hours)), unit: 'h', label: 'IM SATTEL' } : null,
          a.ascent_m != null ? { key: 'asc', value: nf.format(Math.round(a.ascent_m)), unit: 'hm', label: 'HÖHENMETER' } : null,
          a.kj != null ? { key: 'kj', value: nf.format(Math.round(a.kj)), unit: 'kJ', label: 'ARBEIT' } : null,
        ].filter(Boolean) as W3LifeTile[])
      : []

    const nearest = inProgress[0] ?? null
    const counts = ach?.counts ?? null
    const cabinetValue = counts ? `${counts.unlocked} von ${counts.total}` : `${DASH} von ${DASH}`
    const latest = ach?.latest ?? null
    const open = challenges?.available.length ?? 0

    return {
      micro: 'ERFOLGE',
      eyebrow: `SAISON ${now.getFullYear()} · ${month}`,
      // The page's thesis, in two weights. The accented word is the point of
      // the screen, not merely its last word.
      headline: 'Nichts hier ist',
      headlineAccent: 'gekauft.',
      deck: 'Jedes Abzeichen wird gefahren. Erkannt aus deinen eigenen Fahrten — Datum, Wert und Rest inklusive.',

      ledger: [
        { key: 'badges', value: counts ? String(counts.unlocked) : DASH, unit: counts ? `von ${counts.total}` : null, label: 'ABZEICHEN' },
        { key: 'active', value: challenges ? String(challenges.active.length) : DASH, label: 'CHALLENGES LIVE' },
        { key: 'rc', value: wallet ? nf.format(wallet.balance) : DASH, unit: 'RC', label: 'RIDECOIN' },
      ],

      latestChapter: 'ZULETZT VERDIENT',
      latestTitle: latest ? 'Dein letztes Abzeichen' : 'Noch nichts verdient',
      latest: latest
        ? {
            icon: emblem(latest.icon),
            title: latest.title,
            value: latest.value_label,
            detail: latest.detail,
            dateLabel: (dayMonth(latest.unlocked_at) ?? '').toUpperCase(),
            fresh: latest.fresh,
          }
        : null,
      latestEmpty: 'Deine erste gewertete Fahrt schaltet das erste Abzeichen frei. Es gibt keinen anderen Weg hinein.',
      cabinetValue,
      cabinetLit: counts?.unlocked ?? 0,
      cabinetTotal: counts?.total ?? 0,
      // What is next, not a second copy of the count. `inProgress` is already
      // sorted by how close each one is, so [0] IS the nearest.
      next: nearest
        ? { label: `Als Nächstes · ${nearest.title}`, value: nearest.progress?.label ?? `${Math.round(nearest.pct ?? 0)} %` }
        : null,

      badgesChapter: 'DIE VITRINE',
      badgesTitle: 'Abzeichen',
      badgesSub: 'Verdiente zuerst, dann die, die am nächsten dran sind',
      badges,

      recordsChapter: 'DEINE REKORDE',
      recordsTitle: 'Persönliche Bestwerte',
      recordsSub: peak > 0
        ? 'Aus deiner eigenen Leistungskurve. Der Balken zeigt jede Dauer als Anteil deiner Spitzenleistung — die Form deiner Kurve.'
        : 'Aus deiner eigenen Leistungskurve, sobald es eine gibt.',
      recordsEmpty: 'Noch keine Wattdaten. Eine einzige Fahrt mit Leistungsmessung reicht — dann steht deine Kurve hier.',
      records,

      lifeChapter: 'ALLE ZEITEN',
      lifeTitle: 'Was zusammengekommen ist',
      lifeSub: 'Alles, was der Coach je von dir gewertet hat',
      life,

      ctaLabel: 'OFFENE CHALLENGES',
      ctaCaption: open === 0
        ? 'Du bist in allen Challenges dieses Monats'
        : open === 1 ? '1 wartet auf dich' : `${open} warten auf dich`,
    }
  }, [data, wallet, ach, challenges])

  return <W3WinsView vm={vm} onOpenChallenges={() => nav('/e/w3-challenges')} />
}
