import { W3TodayRankView } from './W3TodayRank'
import { T, FONT } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import './w3.css'
import type { StandingRow } from '../../api/crew'

/** TEMP preview — the crew table with faces, no backend.
 *  `/e/w3-rank-preview` is unguarded like every other W3 preview route. */

/** Tiny inline WebP-free stand-ins: a flat SVG head, one per rider, so the
 *  avatar path is exercised without shipping seven renders into the bundle.
 *  Real avatars are 96 px photographs of the rider's own collectible. */
const face = (hue: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${T.heroDock}"/><circle cx="48" cy="38" r="19" fill="${hue}"/><path d="M14 96c4-22 18-30 34-30s30 8 34 30z" fill="${hue}"/></svg>`,
  )}`

// Every one of these is a real token — a preview has no business inventing
// colours the app does not have.
const HUES = [T.acid, T.cool, T.lilac, T.warn, T.training, T.bad, T.mid, T.rareRare]
const NAMES = ['lena.k', 'jonathan.ghost', 'marco', 'tine', 'paul.r', 'sofia', 'ben', 'aylin']

const rows: StandingRow[] = NAMES.map((handle, i) => ({
  user_id: i + 1,
  handle,
  is_you: i === 1,
  // Every third rider deliberately has no avatar, so the fallback dot is on
  // screen too — it is the state most crews are actually in at first.
  avatar: i % 3 === 2 ? null : face(HUES[i]),
  weekly_score: 640 - i * 62,
  weekly_tss: 520 - i * 44,
  daily_pct: Array.from({ length: 7 }, (_, d) => Math.max(0, Math.round(90 - i * 8 + Math.sin(d + i) * 40))),
  distance_km: 210 - i * 17,
  weekly_target_tss: 480,
  daily_target_tss: 70,
}))

export default function W3RankPreview() {
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.bg, paddingBottom: 40 }}>
        <W3StatusBar />
        <div style={{ padding: '8px 20px 4px' }}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>Crew</span>
        </div>
        <W3TodayRankView crewName="Maratona Squad" rows={rows} />
      </div>
    </div>
  )
}
