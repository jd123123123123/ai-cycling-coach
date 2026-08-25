import { motion, useReducedMotion } from 'motion/react'
import type { ComponentType, CSSProperties } from 'react'
import {
  ArrowRight, Bike, Flame, Gauge, Lock, Medal, Mountain,
  Route as RouteIcon, Sunrise, Trophy, Zap,
} from 'lucide-react'
import { T, FONT, band, grow, Reveal } from './w3tokens'
import { S, TNUM, lux, luxTile, hairline } from './w3surfaces'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import W3TabBar from './W3TabBar'
import './w3.css'

/**
 * W3 · ERFOLGE — the achievements screen, redrawn in the house register
 * (`docs/w3-house-style.md`, pen frames `kVACs` / `l4QUjL`).
 *
 * WHAT THIS REPLACED, AND WHY IT WAS THE WRONG PAGE.
 *
 * The old Wins screen was six sections of identical weight, and two of them
 * were not this page's job:
 *
 *  1. A challenge hero and a list of personal challenges — a second, poorer
 *     copy of `/e/w3-challenges`, which owns that subject and draws it with the
 *     real month strip and real boards. Two screens for one thing means one of
 *     them is always the stale one. It is now a single acid button out.
 *  2. "Community-Challenges": a fabricated pool with an invented "Top 8 % der
 *     Community". `W3ChallengesView` had already deleted exactly this fixture
 *     and said so in its own doc comment. Deleted here rather than restyled —
 *     a fabricated section does not get design polish.
 *
 * What the page is actually for was sitting unused in the payload the whole
 * time: `latest` (the badge most recently earned, with its real unlock date),
 * `in_progress[].pct` (how close each locked one is), and `all_time` (rides,
 * km, hours, kJ, ascent). All three are real, all three are now the page.
 *
 * REAL, end to end: the ledger counts, the hero badge and its date, the whole
 * cabinet incl. locked progress, the lifetime totals (`/achievements/mine`);
 * the RideCoin balance (wallet); the record watts and W/kg and the PR flags
 * (the athlete's own mean-max curve). The fabricated "+40 W vs. Mai" record
 * deltas went with the community pools — the bar now states a real thing (each
 * duration as a share of the rider's own peak) and says so in the subhead.
 *
 * Pure function of `vm`; `W3WinsPage` builds it.
 */

// ── view model ──────────────────────────────────────────────────────────────

export type W3BadgeIcon = 'medal' | 'mountain' | 'sunrise' | 'flame' | 'bike' | 'route' | 'zap' | 'gauge' | 'trophy'

export interface W3LedgerCell {
  key: string
  /** The number itself. `DASH` when the signal has not resolved. */
  value: string
  /** Sits small on the baseline beside it — "von 34", "RC". */
  unit?: string | null
  label: string
}

export interface W3Latest {
  icon: W3BadgeIcon
  title: string
  /** "133,1 km" — the achievement's own measurement, split for display. */
  value: string | null
  detail: string
  dateLabel: string
  fresh: boolean
}

export interface W3Badge {
  key: string
  icon: W3BadgeIcon
  name: string
  caption: string
  earned: boolean
  /** 0–1 for a locked badge with real progress; null when there is no number. */
  pct: number | null
}

export interface W3Record {
  key: string
  label: string
  /** "1.240 W" or DASH. */
  value: string
  /** "4,0 W/kg" — null when the rider has no weight on file. */
  wkg: string | null
  /** 0–1: this duration as a share of the rider's own peak. Null → no bar. */
  frac: number | null
  /** A recent personal record. The one thing on the row that goes acid. */
  pr: boolean
}

export interface W3LifeTile {
  key: string
  value: string
  unit: string
  label: string
}

export interface W3WinsVm {
  micro: string
  eyebrow: string
  /** The two-weight headline: the sentence, then the one word it turns on. */
  headline: string
  headlineAccent: string
  deck: string
  ledger: W3LedgerCell[]

  latestChapter: string
  latestTitle: string
  latest: W3Latest | null
  /** Copy for a rider who has not earned anything yet. */
  latestEmpty: string
  /** "12 von 34" — the cabinet's count, stated once, on the cabinet. */
  cabinetValue: string
  /** The REAL collection counts, for the segment meter. */
  cabinetLit: number
  cabinetTotal: number
  /** Which badge the hero is celebrating. It is the ONE tile in the cabinet
   *  that stays lit — see `ACCENT RATIONING` in the grid. Null when nothing has
   *  been earned yet, and then no tile is lit. */
  latestKey: string | null
  /** The inset row under the hero: the badge closest to falling. It carries
   *  the ONE fact that moves the rider, which a repeat of the count does not.
   *  Null when nothing is in progress. */
  next: { label: string; value: string } | null

  badgesChapter: string
  badgesTitle: string
  badgesSub: string
  badges: W3Badge[]

  recordsChapter: string
  recordsTitle: string
  recordsSub: string
  /** Shown INSTEAD of the rows when the rider has no power curve at all. Four
   *  dashes under a subhead promising a bar reads as a broken card. */
  recordsEmpty: string
  records: W3Record[]

  lifeChapter: string
  lifeTitle: string
  lifeSub: string
  /** The first tile runs full width — the lifetime number worth a hero. */
  life: W3LifeTile[]

  ctaLabel: string
  ctaCaption: string
}

// ── primitives ──────────────────────────────────────────────────────────────

const ICONS: Record<W3BadgeIcon, ComponentType<{ size?: number; color?: string; style?: CSSProperties }>> = {
  medal: Medal, mountain: Mountain, sunrise: Sunrise, flame: Flame,
  bike: Bike, route: RouteIcon, zap: Zap, gauge: Gauge, trophy: Trophy,
}

const OCTAGON = 'polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)'

/**
 * The medallion. Acid and lit when earned; the same mark, unlit and sealed,
 * when not.
 *
 * A LOCKED BADGE KEEPS ITS OWN FACE. The first draft swapped every unearned
 * mark for a padlock, and the bottom row of the cabinet came out as three
 * identical grey locks — the row whose entire job is "this one is eight watts
 * away, that one is a mountain you have not climbed". The lock moved to a seal
 * in the corner, which says the same thing without erasing the badge.
 */
function Emblem({ size, icon, earned, glow = true, lit = true }: {
  size: number; icon: W3BadgeIcon; earned: boolean; glow?: boolean
  /** Acid, or the quieter earned metal. See `ACCENT RATIONING` in the grid. */
  lit?: boolean
}) {
  const Ic = ICONS[icon]
  const seal = Math.round(size * 0.34)
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'grid', placeItems: 'center', flex: 'none' }}>
      {earned && lit && glow && (
        <div style={{ position: 'absolute', width: size * 1.15, height: size * 1.15, background: T.acid, clipPath: OCTAGON, filter: `blur(${Math.round(size * 0.28)}px)`, opacity: 0.5 }} />
      )}
      <div style={{
        position: 'absolute', inset: 0, clipPath: OCTAGON,
        background: !earned ? T.d1
          : lit ? `linear-gradient(155deg, ${T.acidHi}, ${T.acid} 48%, ${T.acidDeep})`
          // Earned, but not the one being celebrated: struck metal rather than
          // a second acid light. Twelve acid octagons in a nine-tile grid is a
          // wall, and a wall has no hierarchy.
          : `linear-gradient(155deg, ${T.d4}, ${T.d3} 52%, ${T.d2})`,
      }} />
      {earned && (
        <div style={{ position: 'absolute', top: size * 0.08, left: size * 0.16, right: size * 0.3, height: size * 0.24, borderRadius: '50%', background: lit ? T.d3 : T.d2, filter: `blur(${Math.round(size * 0.06)}px)` }} />
      )}
      {/* Positioned on purpose: absolutely-positioned siblings paint above a
          static child whatever the DOM order, so the mark would vanish. */}
      <Ic size={Math.round(size * 0.42)} color={earned ? (lit ? T.bg : T.ink) : T.mid} style={{ position: 'relative' }} />
      {!earned && (
        <div style={{
          position: 'absolute', right: -seal * 0.12, bottom: -seal * 0.12,
          width: seal, height: seal, borderRadius: 100, background: T.heroOff,
          border: `2px solid ${T.bg}`, display: 'grid', placeItems: 'center',
        }}>
          <Lock size={Math.round(seal * 0.5)} color={T.bg} strokeWidth={2.6} />
        </div>
      )}
    </div>
  )
}

/** A pill floating on art. Near-black + blur, so it belongs to the glass, not
 *  to the picture. `dot` gives it the live indicator. */
function GlassPill({ children, accent = false, dot = false }: { children: string; accent?: boolean; dot?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 100,
      background: accent ? T.acid : T.glass, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    }}>
      {dot && <div style={{ width: 6, height: 6, borderRadius: 100, background: accent ? T.bg : T.acid }} />}
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: accent ? T.bg : T.ink }}>{children}</span>
    </div>
  )
}

/** Countable things — badges of a set. Lit acid steps, unlit stubs. */
function SegGauge({ lit, total, reduce, delay = 0 }: { lit: number; total: number; reduce: boolean | null; delay?: number }) {
  const n = Math.max(1, Math.min(total, 34))
  const scale = total > n ? n / total : 1
  const litN = Math.round(lit * scale)
  return (
    <div style={{ display: 'flex', gap: 3, height: 10, alignItems: 'center', width: '100%' }}>
      {Array.from({ length: n }).map((_, i) => (
        <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(delay + i * 0.012)}
          style={{ flex: 1, height: i < litN ? 10 : 5, alignSelf: 'center', transformOrigin: 'center', borderRadius: 1, background: i < litN ? T.acid : T.d1 }} />
      ))}
    </div>
  )
}

/** Proportions. The percentage always lives in text beside it, never in here. */
function Bar({ fill, tint = T.acid, reduce, delay = 0, h = 6 }: { fill: number; tint?: string; reduce: boolean | null; delay?: number; h?: number }) {
  return (
    <div style={{ height: h, borderRadius: 100, background: T.d1, overflow: 'hidden', width: '100%' }}>
      <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%` }} transition={grow(delay)}
        style={{ height: '100%', borderRadius: 100, background: tint }} />
    </div>
  )
}

/** `01 — DIE VITRINE`. The ordinal is the point: it makes the page a sequence. */
const Chapter = ({ n, label, tint = T.acid }: { n: string; label: string; tint?: string }) => (
  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: tint }}>{n} — {label}</span>
)

const SectionTitle = ({ title, sub, right }: { title: string; sub?: string; right?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: S.md }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{title}</span>
      {sub && <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>{sub}</span>}
    </div>
    {right && <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, color: T.mid, paddingTop: 6, ...TNUM }}>{right}</span>}
  </div>
)

/** A big number with its unit at a third of its size, on the baseline. */
function Numeral({ value, unit, size, tint = T.acid }: { value: string; unit?: string | null; size: number; tint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: Math.round(size * 0.1) }}>
      <span style={{ fontSize: size, fontWeight: 700, letterSpacing: size * -0.035, lineHeight: 1, color: tint, ...TNUM }}>{value}</span>
      {unit && <span style={{ fontSize: Math.max(11, Math.round(size / 3)), fontWeight: 700, letterSpacing: -0.2, color: tint, ...TNUM }}>{unit}</span>}
    </div>
  )
}

// ── the screen ──────────────────────────────────────────────────────────────

export default function W3WinsView({ vm, onOpenChallenges }: {
  vm: W3WinsVm
  onOpenChallenges?: () => void
}) {
  const reduce = useReducedMotion()
  const [lifeHero, ...lifeRest] = vm.life
  // A chapter that does not render must not consume its number, or a cold
  // start shows "01" followed by "03" and the sequence stops being one.
  const hasCabinet = vm.badges.length > 0
  const hasRecords = vm.records.some((r) => r.frac != null)
  const hasLife = vm.life.length > 0
  const ord = (() => {
    const present = ['latest', hasCabinet && 'cabinet', 'records', hasLife && 'life'].filter(Boolean) as string[]
    return (k: string) => String(present.indexOf(k) + 1).padStart(2, '0')
  })()

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        <W3StatusBar />
        <W3TopBar title={vm.micro} />

        {/* ── The opening. The page states its thesis before a single number. ── */}
        <div style={{ ...band(S.xxl), gap: S.md, paddingTop: S.md }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>{vm.eyebrow}</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.05, color: T.ink }}>{vm.headline}</span>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.05, color: T.acid }}>{vm.headlineAccent}</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>{vm.deck}</span>
        </div>

        {/* ── The ledger: the whole page in three numbers. ── */}
        <div style={{ ...band(S.section), flexDirection: 'row', alignItems: 'stretch' }}>
          {vm.ledger.map((c, i) => (
            <div key={c.key} style={{ flex: 1, display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
              {i > 0 && <div style={{ width: 1, background: T.rule, opacity: 0.55, margin: '2px 14px 2px 0', flex: 'none' }} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1, color: T.ink, ...TNUM }}>{c.value}</span>
                  {c.unit && <span style={{ fontSize: 10, fontWeight: 700, color: T.quiet, ...TNUM }}>{c.unit}</span>}
                </div>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{c.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── 01 · the badge most recently earned ── */}
        <Reveal style={{ width: '100%' }}>
          <div style={{ ...band(S.section), gap: S.lg }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
              <Chapter n={ord('latest')} label={vm.latestChapter} />
              <SectionTitle title={vm.latestTitle} />
            </div>

            <div style={{ ...lux(28), overflow: 'hidden' }}>
              {/* The art panel — its own light, glass pills in opposite corners. */}
              <div style={{
                height: 186, position: 'relative', display: 'grid', placeItems: 'center', flex: 'none',
                background: vm.latest ? `radial-gradient(circle at 50% 46%, ${T.acid}30, ${T.acid}0d 44%, transparent 68%)` : undefined,
              }}>
                {/* The bloom is the EARNED state's light. Left on under a
                    locked emblem it tinted the lock acid — the screen
                    congratulating a rider for nothing. */}
                {vm.latest && (
                  <motion.div
                    animate={reduce ? undefined : { scale: [1, 1.1, 1], opacity: [0.45, 0.7, 0.45] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ position: 'absolute', width: 150, height: 150, background: T.acid, clipPath: OCTAGON, filter: 'blur(34px)', opacity: 0.45 }} />
                )}
                <Emblem size={104} icon={vm.latest?.icon ?? 'trophy'} earned={!!vm.latest} />
                {vm.latest && (
                  <>
                    <div style={{ position: 'absolute', top: 14, left: 14 }}>
                      {vm.latest.fresh
                        ? <GlassPill accent dot>NEU</GlassPill>
                        : <GlassPill dot>VERDIENT</GlassPill>}
                    </div>
                    <div style={{ position: 'absolute', bottom: 14, left: 14 }}>
                      <GlassPill>{vm.latest.dateLabel}</GlassPill>
                    </div>
                  </>
                )}
              </div>

              <div style={{ padding: `0 ${S.xl}px ${S.xl}px`, display: 'flex', flexDirection: 'column', gap: S.md }}>
                {vm.latest && (
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{vm.latest.title}</span>
                )}
                {vm.latest?.value && <Numeral {...splitMeasure(vm.latest.value)} size={56} />}
                <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>
                  {vm.latest?.detail ?? vm.latestEmpty}
                </span>

                {/* The inset row: the one fact that matters — what is next. */}
                {vm.next && (
                  <div style={{ ...luxTile(18), flexDirection: 'row', alignItems: 'center', gap: S.md, padding: `13px ${S.lg}px`, marginTop: S.xs }}>
                    <Medal size={17} color={T.acid} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.next.label}</span>
                    <span style={{ marginLeft: 'auto', flex: 'none', fontSize: 15, fontWeight: 700, letterSpacing: -0.3, color: T.acid, ...TNUM }}>{vm.next.value}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── 02 · the cabinet ── */}
        {vm.badges.length > 0 && (
        <Reveal style={{ width: '100%' }}>
          <div style={{ ...band(S.section), gap: S.lg }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
              <Chapter n={ord('cabinet')} label={vm.badgesChapter} />
              <SectionTitle title={vm.badgesTitle} sub={vm.badgesSub} right={vm.cabinetValue} />
            </div>
            {vm.cabinetTotal > 0 && <SegGauge lit={vm.cabinetLit} total={vm.cabinetTotal} reduce={reduce} />}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: S.sm }}>
              {vm.badges.map((b, i) => (
                <div key={b.key} style={{
                  display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'center',
                  padding: '16px 9px 14px', borderRadius: 20,
                  background: b.earned ? `linear-gradient(180deg, ${T.acidTop}, ${T.heroDock})` : T.heroDock,
                }}>
                  {/* ── ACCENT RATIONING ──────────────────────────────────
                      Every earned badge was a lit acid octagon, and with six of
                      them in a nine-tile grid the accent stopped being an accent
                      — it was the field. A rider could not tell which of their
                      badges was the new one, which is the only ranking this grid
                      has to offer, because all six shouted equally.

                      One is lit: the one the hero above is celebrating. The rest
                      are struck metal — unmistakably earned, visibly not new. */}
                  <Emblem size={50} icon={b.icon} earned={b.earned} lit={b.key === vm.latestKey} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', width: '100%' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', color: b.earned ? T.ink : T.mid }}>{b.name}</span>
                    {!b.earned && b.pct != null && <Bar fill={b.pct} tint={T.acidDeep} reduce={reduce} delay={i * 0.03} h={4} />}
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.7, lineHeight: 1.3, textAlign: 'center', color: b.key === vm.latestKey ? T.acid : b.earned ? T.mid : T.quiet, ...TNUM }}>{b.caption}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        )}

        {/* ── 03 · the power records ── */}
        <Reveal style={{ width: '100%' }}>
          <div style={{ ...band(S.section), gap: S.lg }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
              <Chapter n={ord('records')} label={vm.recordsChapter} />
              <SectionTitle title={vm.recordsTitle} sub={vm.recordsSub} />
            </div>
            <div style={{ ...lux(28), padding: `2px ${S.xl}px ${S.md}px` }}>
              {!hasRecords && (
                <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.mid, padding: `${S.lg}px 0` }}>{vm.recordsEmpty}</span>
              )}
              {hasRecords && vm.records.map((r, i) => (
                <div key={r.key} style={{ display: 'flex', flexDirection: 'column' }}>
                  {i > 0 && <div style={hairline()} />}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '15px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: S.md }}>
                    <span style={{ width: 46, flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{r.label}</span>
                    <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1, color: r.pr ? T.acid : T.ink, ...TNUM }}>{r.value}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: r.pr ? T.acid : T.quiet, ...TNUM }}>
                      {r.pr ? 'NEUER REKORD' : r.wkg ?? ''}
                    </span>
                  </div>
                  {r.frac != null && <Bar fill={r.frac} tint={T.d3} reduce={reduce} delay={i * 0.04} h={5} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ── 04 · everything, ever ── */}
        {vm.life.length > 0 && (
        <Reveal style={{ width: '100%' }}>
          <div style={{ ...band(S.section), gap: S.lg }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
              <Chapter n={ord('life')} label={vm.lifeChapter} />
              <SectionTitle title={vm.lifeTitle} sub={vm.lifeSub} />
            </div>
            {lifeHero && (
              <div style={{ ...lux(28), padding: `${S.xl}px ${S.xl}px 18px`, gap: S.sm }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{lifeHero.label}</span>
                <Numeral value={lifeHero.value} unit={lifeHero.unit} size={54} />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: S.sm }}>
              {lifeRest.map((t) => (
                <div key={t.key} style={{ ...lux(22), padding: `${S.lg}px ${S.lg}px 14px`, gap: 6 }}>
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{t.label}</span>
                  <Numeral value={t.value} unit={t.unit} size={26} tint={T.ink} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        )}

        {/* ── The close: one action, one quiet line about what waits. ── */}
        <div style={{ ...band(S.lg), gap: S.md, alignItems: 'center' }}>
          <button onClick={onOpenChallenges} style={{
            width: '100%', height: 56, borderRadius: 100, border: 0, background: T.acid, cursor: 'pointer',
            fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1, color: T.bg }}>{vm.ctaLabel}</span>
            <ArrowRight size={17} color={T.bg} strokeWidth={2.6} />
          </button>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>{vm.ctaCaption}</span>
        </div>

        <W3TabBar />
      </div>
    </div>
  )
}

/** "133,1 km" → a big number and a small unit. A measurement with no unit
 *  (a bare count) keeps the whole string as the number. */
export function splitMeasure(s: string): { value: string; unit: string | null } {
  const cut = s.lastIndexOf(' ')
  if (cut <= 0) return { value: s, unit: null }
  const unit = s.slice(cut + 1)
  // Only split off something that is actually a unit — "Cat 4" must not become
  // a numeral of "Cat" with a unit of "4".
  return /^[\d.,]/.test(unit) ? { value: s, unit: null } : { value: s.slice(0, cut), unit }
}
