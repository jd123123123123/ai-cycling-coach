import { motion, useReducedMotion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Users, ChevronRight, Crown, Route as RouteIcon } from 'lucide-react'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import type { StandingRow } from '../../api/crew'
import { T, FONT, EASE, grow, Kicker } from './w3tokens'
import { S, lux, hairline, TNUM } from './w3surfaces'

/**
 * W3 · Today "Dein Rang" — the rider's real standing in their real crew.
 *
 * It replaced a fixture: three invented riders (Mara / Timo) on a bar scaled to
 * a hardcoded 150, under an invented "CREW-CHALLENGE · UM DIE WELT · 412/500
 * km" that no endpoint has ever produced. Everything below is on the wire:
 *
 *   • GET /crews/me            — whether there IS a crew, and its name.
 *   • GET /crews/me/standings?period=week — per member `weekly_score`,
 *     `weekly_tss`, `daily_pct[]`, `weekly_target_tss`, `daily_target_tss`,
 *     plus the window bounds. Rows arrive sorted by score.
 *
 * THE SCORING, stated plainly because it changes how the table should be read
 * (services/crew_score.py): each day a rider earns
 * `min(1.5, dayTSS / their OWN daily target) × 100` points. The denominator is
 * every rider's own 4-week average — so a 12 h/week rider does NOT out-score a
 * 4 h/week rider by volume. The card says this out loud instead of letting the
 * bars imply raw strength, and the gap to the rider ahead is converted back
 * into the rider's OWN TSS, which is the only unit they can act on.
 *
 * No crew → the honest empty state and a way in. Never a fabricated leaderboard.
 */

const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', background: T.bg, padding: `0 20px ${padBottom}px`, fontFamily: FONT })
const ellipsis = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }
const cardBtn = { width: '100%', border: 0, background: T.surface, fontFamily: FONT, textAlign: 'left' as const, cursor: 'pointer' }
const num = (n: number) => n.toLocaleString('de-DE')

/** Per-day points, capped at 150 by the server — the strip's own ceiling. */
const DAY_CAP = 150
/** Identity hues for the other riders — W3 tokens only, so the crew table can
 *  never drift from the design system. Acid is reserved for the rider, and
 *  T.training is deliberately NOT in here: at 6px it is close enough to acid
 *  that a crew-mate's row read as a second "you" at a glance. */
const MEMBER_HUES = [T.evening, T.cool, T.warn, T.d4, T.d3]

/** One rider's row. TWO lines, because a points total on its own is abstract:
 *  the second line carries what riders actually talk about — km and TSS — plus
 *  the attainment of that rider's OWN target, which is the thing the points are
 *  really made of. Every figure is a server field (`distance_km`, `weekly_tss`,
 *  `weekly_target_tss`); a null one is dropped from the line, never shown as 0. */
function Row({ r, rank, hue, reduce, delay, leader }: {
  r: StandingRow; rank: number; hue: string; reduce: boolean | null; delay: number; leader: boolean
}) {
  const me = r.is_you
  const days = r.daily_pct ?? []
  const pct = r.weekly_target_tss && r.weekly_target_tss > 0
    ? Math.round((r.weekly_tss / r.weekly_target_tss) * 100)
    : null
  const meta = [
    r.distance_km != null && r.distance_km > 0 ? `${num(Math.round(r.distance_km))} km` : null,
    r.weekly_tss > 0 ? `${num(r.weekly_tss)} TSS` : null,
    pct != null ? `${pct} % vom Ziel` : null,
  ].filter(Boolean).join(' · ')

  // The podium reads at a glance: 1–3 get a weighted rank numeral, the rest
  // stay quiet. No invented medals — just typographic rank.
  const podium = rank <= 3
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, minWidth: 0,
      // The rider's own row is lifted off the table so it can be found without
      // reading — the only row that gets a surface of its own.
      background: me ? '#FFFFFF0D' : 'transparent',
      border: `1px solid ${me ? T.rule : 'transparent'}`,
      borderRadius: 14, padding: me ? '8px 10px' : '8px 0', margin: me ? '0 -10px' : 0,
    }}>
      <span style={{ ...TNUM, flex: 'none', width: 13, fontSize: podium ? 12 : 11, fontWeight: podium ? 800 : 700, color: me ? T.acid : podium ? T.mid : T.quiet }}>{rank}</span>
      <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 100, background: me ? T.acid : hue, boxShadow: me ? `0 0 9px ${T.acid}A6` : `0 0 6px ${hue}59` }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{ ...ellipsis, minWidth: 0, fontSize: 13, fontWeight: me ? 700 : 600, color: me ? T.acid : T.ink }}>
            {me ? 'Du' : `@${r.handle}`}
          </span>
          {leader && <Crown size={11} color={T.warn} style={{ flex: 'none' }} />}
        </div>
        {meta && <span style={{ ...ellipsis, fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{meta}</span>}
      </div>
      {/* Their real week, day by day — the bar IS the data, not a scaled proxy. */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', gap: 2, height: 22 }}>
        {days.map((p, i) => {
          const h = Math.max(2, Math.round(Math.min(1, p / DAY_CAP) * 22))
          return (
            <motion.span key={i}
              initial={reduce ? false : { height: 2 }} animate={{ height: h }} transition={grow(delay + i * 0.03)}
              style={{ width: 4.5, height: h, borderRadius: 100, background: p > 0 ? (me ? T.acid : hue) : '#FFFFFF12' }} />
          )
        })}
      </div>
      <span style={{ ...TNUM, flex: 'none', width: 38, textAlign: 'right', fontSize: 13, fontWeight: 700, letterSpacing: -0.3, color: me ? T.acid : T.mid }}>
        {num(r.weekly_score)}
      </span>
    </div>
  )
}

function Head({ tag }: { tag: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Dein Rang</span>
        <span style={{ ...ellipsis, fontSize: 10.5, fontWeight: 600, color: T.quiet }}>Erarbeitet, nicht gekauft</span>
      </div>
      {/* Neutral on purpose: the pill repeats the rank the card states one line
          below in 40px type. The acid here belongs to the rider's own row. */}
      {tag && (
        <div style={{ flex: 'none', padding: '7px 13px', borderRadius: 100, background: T.surface2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: T.mid }}>{tag}</span>
        </div>
      )}
    </div>
  )
}

export default function W3TodayRank() {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { data: crew } = useMyCrew()
  const { data: standings } = useCrewStandings('week')
  const go = () => navigate('/e/w3-crew')

  const rows = standings?.standings ?? []
  const meIdx = rows.findIndex((r) => r.is_you)
  const me = meIdx >= 0 ? rows[meIdx] : null

  // ── No crew (or none on the wire yet) → the honest way in, no fake rivals ──
  if (rows.length === 0 || me == null) {
    const hasCrew = crew?.crew != null
    return (
      <div style={{ ...band(26), gap: 14 }}>
        <Head tag={null} />
        <button onClick={go} style={{ ...cardBtn, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%' }}>
            <span style={{ width: 34, height: 34, borderRadius: 12, background: T.surface2, display: 'grid', placeItems: 'center', flex: 'none' }}>
              <Users size={16} color={T.mid} />
            </span>
            <span style={{ ...ellipsis, flex: 1, fontSize: 15, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>
              {hasCrew ? crew!.crew!.name : 'Noch keine Crew'}
            </span>
            <ChevronRight size={16} color={T.quiet} style={{ flex: 'none' }} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
            In einer Crew wird jede Woche gewertet — aber jeder an seinem eigenen Ziel. Nicht die meisten Stunden gewinnen, sondern die konsequenteste Woche.
          </span>
        </button>
      </div>
    )
  }

  // ── Window + the honest denominators ──────────────────────────────────────
  // The bar every rider is measured against is their OWN. `weekly_target_tss`
  // is the 4-week average × 1.05 the server computed for THEM.
  const start = standings?.week_start ? new Date(`${standings.week_start}T00:00:00`) : null
  const end = standings?.week_end ? new Date(`${standings.week_end}T00:00:00`) : null
  const days = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1) : 7
  /** Full-target week = 100 points on every day of the window. */
  const perfect = days * 100

  const rank = meIdx + 1
  const total = rows.length
  const myDaily = me.daily_target_tss ?? standings?.daily_target_tss ?? null
  const myWeekly = me.weekly_target_tss ?? standings?.weekly_target_tss ?? null
  const targetPct = myWeekly && myWeekly > 0 ? Math.round((me.weekly_tss / myWeekly) * 100) : null

  // The gap, in the only unit a rider can act on: their own TSS. 100 points IS
  // one full daily target for them, so the conversion is exact.
  const ahead = meIdx > 0 ? rows[meIdx - 1] : null
  const behind = meIdx < total - 1 ? rows[meIdx + 1] : null
  const gap = ahead ? ahead.weekly_score - me.weekly_score : null
  const lead = behind ? me.weekly_score - behind.weekly_score : null
  const gapTss = gap != null && myDaily ? Math.round((gap / 100) * myDaily) : null
  const leadTss = lead != null && myDaily ? Math.round((lead / 100) * myDaily) : null

  const gapLine = ahead && gap != null && gap > 0
    ? `Noch ${num(gap)} Punkte auf @${ahead.handle}${gapTss ? ` — für dich ${num(gapTss)} TSS.` : '.'}`
    : lead != null && lead > 0 && behind
      ? `Du führst mit ${num(lead)} Punkten Vorsprung${leadTss ? ` — ${num(leadTss)} TSS Puffer.` : '.'}`
      : total === 1
        ? 'Du fährst die Woche allein. Lade Fahrer ein — gewertet wird jeder an seinem eigenen Ziel.'
        : 'Gleichauf mit deiner Crew.'

  // Who to show: the top of the table, and always the rider themselves.
  const VISIBLE = 5
  const shown: StandingRow[] = meIdx < VISIBLE
    ? rows.slice(0, VISIBLE)
    : [...rows.slice(0, VISIBLE - 1), me]
  const gapRow = meIdx >= VISIBLE

  // ── What the crew did TOGETHER ────────────────────────────────────────────
  // The one number nobody competes over, and the reason a crew is worth being
  // in. Summed from the same per-member fields the table shows; `distance_km`
  // is nullable, so the km half is dropped rather than under-reported when any
  // member is missing it.
  const crewTss = rows.reduce((s, r) => s + r.weekly_tss, 0)
  const allHaveKm = rows.every((r) => r.distance_km != null)
  const crewKm = allHaveKm ? rows.reduce((s, r) => s + (r.distance_km ?? 0), 0) : null
  const crewRides = rows.filter((r) => r.weekly_tss > 0).length

  return (
    <div style={{ ...band(26), gap: 14 }}>
      <Head tag={`#${rank} VON ${total}`} />

      <div style={{ ...lux(26), padding: S.xl, gap: S.lg, minWidth: 0 }}>

        {/* ── Headline: the rank, and the one thing to do about it ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
            <Kicker>Diese Woche{crew?.crew ? ` · ${crew.crew.name}` : ''}</Kicker>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              {/* Leading a crew of one is not a win — no acid for that. */}
              <span style={{ ...TNUM, fontSize: 46, fontWeight: 700, letterSpacing: -2.2, lineHeight: 0.94, color: rank === 1 && total > 1 ? T.acid : T.ink, textShadow: rank === 1 && total > 1 ? `0 0 26px ${T.acid}4D` : 'none' }}>#{rank}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>von {total}</span>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.mid, minWidth: 0, paddingTop: 2 }}>{gapLine}</span>
          </div>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ ...TNUM, fontSize: 18, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{num(me.weekly_score)}</span>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>PUNKTE</span>
            {/* The honest reference: 100 points per day IS the rider's own
                full target, so `perfect` is "week fully hit", not a ceiling
                (the daily cap is 150, so a big day can push you past it). */}
            <span style={{ ...TNUM, fontSize: 9.5, fontWeight: 600, color: T.quiet, paddingTop: 2 }}>{num(perfect)} = Ziel erfüllt</span>
          </div>
        </div>

        <div style={hairline(-S.xs)} />

        {/* ── The table: every rider's real week, day by day ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {shown.map((r, i) => (
            <div key={r.user_id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {gapRow && i === shown.length - 1 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: T.quiet, paddingLeft: 4 }}>⋯</span>
              )}
              <Row r={r} rank={rows.indexOf(r) + 1} hue={MEMBER_HUES[i % MEMBER_HUES.length]}
                reduce={reduce} delay={i * 0.05} leader={total > 1 && rows.indexOf(r) === 0} />
            </div>
          ))}
        </div>

        {/* ── What the crew put down TOGETHER. The one line in this card that is
             not a competition — it is why the crew is worth being in. ── */}
        {crewTss > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderRadius: 14, background: '#FFFFFF08', minWidth: 0 }}>
            <RouteIcon size={13} color={T.mid} style={{ flex: 'none' }} />
            <span style={{ ...ellipsis, flex: 1, fontSize: 11, fontWeight: 600, color: T.mid }}>
              Zusammen diese Woche: {crewKm != null ? `${num(Math.round(crewKm))} km · ` : ''}{num(crewTss)} TSS
              {crewRides > 0 ? ` · ${crewRides} von ${total} am Start` : ''}
            </span>
          </div>
        )}

        {/* ── Your own bar: the denominator behind your points ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <span style={{ ...ellipsis, flex: 1, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>Dein Wochenziel</span>
            <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
              {num(me.weekly_tss)}{myWeekly ? ` / ${num(Math.round(myWeekly))}` : ''} TSS
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
            <motion.div
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.min(100, targetPct ?? 0)}%` }}
              transition={{ duration: 0.8, ease: EASE }}
              style={{ height: '100%', borderRadius: 100, background: (targetPct ?? 0) >= 100 ? T.acid : T.d3 }} />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet, minWidth: 0 }}>
            {myDaily
              ? `Punkte = dein Anteil an deinem EIGENEN Tagesziel (${num(Math.round(myDaily))} TSS), maximal 150 pro Tag. Jeder in der Crew wird an seinem eigenen Ziel gemessen — mehr Stunden allein bringen niemanden nach vorn.`
              : 'Jeder in der Crew wird an seinem eigenen Wochenziel gemessen — mehr Stunden allein bringen niemanden nach vorn.'}
          </span>
        </div>

        <button onClick={go} style={{ ...cardBtn, background: 'transparent', display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, color: T.mid }}>
          CREW ANSEHEN <ChevronRight size={13} color={T.mid} />
        </button>
      </div>
    </div>
  )
}
