import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Plus, Share2, Check } from 'lucide-react'
import {
  CHALLENGE_METRICS,
  type RewardChallenge, type ChallengeMetric,
} from '../../api/rewardChallenges'
import { T, FONT, EASE, band, Kicker, Reveal } from './w3tokens'
import { TNUM } from './w3surfaces'
import { monthFacts, daysLeftLabel } from './w3challengeMonth'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3ChallengeRow, { type ChallengeKind } from './W3ChallengeRow'
import W3MonthStrip from './W3MonthStrip'
import './w3.css'

/**
 * RIDR · CHALLENGES — the screen, as a pure function of what it is given.
 *
 * Split from `W3ChallengesPage` the way `W3Gear` is split from `W3GearPanel`
 * and `W3PlacesView` from `W3PlacesPanel`: the page owns the queries and the
 * mutations, this owns the layout and nothing else. That is what lets the
 * preview route render the REAL screen against fixtures instead of a lookalike
 * built beside it — a lookalike is a second design to keep in sync, and it is
 * always the one that rots.
 *
 * WHAT THIS REPLACED. The old screen was a pen fixture that said so in its own
 * doc comment: invented "community challenges" with gradient cover art and a
 * "top 3 %" nobody computed, next to two real cards. Every number a rider could
 * be proud of on it was made up.
 *
 * THREE THINGS MAKE IT A CHALLENGES PAGE RATHER THAN A LIST OF TARGETS:
 *
 *  1. THE MONTH IS DRAWN, not summarised. `W3MonthStrip` shows the days that
 *     actually moved the number, because "four enormous days" and "every single
 *     day" are different months that a percentage renders identically — and the
 *     difference is what a rider is proud of and what predicts finishing.
 *  2. SOMEBODY ELSE IS IN IT. Every card carries a real participant count and
 *     opens a real board (`/challenges/{key}/board`), ranked over everyone and
 *     cut afterwards, so a rider 40th of 63 is told exactly that.
 *  3. IT LEAVES THE APP. The poster carries the strip, not a percentage — a
 *     card about THIS month rather than about any rider's month.
 *
 * The lead challenge is the one CLOSEST TO DONE rather than the newest or the
 * biggest: the next win is the thing worth putting at the top of a screen
 * somebody opens to decide what to do today.
 */

const nf = new Intl.NumberFormat('de-DE')

const UNIT: Record<ChallengeMetric, string> = Object.fromEntries(
  CHALLENGE_METRICS.map((m) => [m.metric, m.unit]),
) as Record<ChallengeMetric, string>

const TIER_DE: Record<string, string> = { bronze: 'BRONZE', silver: 'SILBER', gold: 'GOLD' }

// ── The lead: one challenge, its month, and the way to show it off ──────────

function Lead({ c, period, days, onShare, sharing }: {
  c: RewardChallenge; period: string
  /** One number per day of the month. Empty while it is still in flight — the
   *  strip holds its space rather than drawing a month of zeros, which would
   *  read as a month in which nothing happened. */
  days: number[]
  onShare: () => void; sharing: boolean
}) {
  const reduce = useReducedMotion()
  const { todayIndex } = monthFacts(period)
  const series = days
  const unit = UNIT[c.metric] ?? ''
  const left = daysLeftLabel(period)

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      style={{
        background: c.completed ? T.acidTop : T.surface,
        border: `1px solid ${c.completed ? `${T.acid}59` : 'transparent'}`,
        borderRadius: 26, padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
        fontFamily: FONT,
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>
            {c.completed ? 'GESCHAFFT' : 'AM NÄCHSTEN DRAN'}
          </span>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.8, color: T.ink, lineHeight: 1.1 }}>
            {c.title}
          </span>
          {left && !c.completed && (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>{left} in diesem Monat</span>
          )}
        </div>
        <button
          type="button" onClick={onShare} disabled={sharing}
          aria-label="Challenge teilen"
          style={{
            width: 36, height: 36, flex: 'none', borderRadius: 100, border: 0,
            background: T.surface2, display: 'grid', placeItems: 'center',
            cursor: sharing ? 'default' : 'pointer', opacity: sharing ? 0.5 : 1,
          }}>
          <Share2 size={16} color={T.mid} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, ...TNUM }}>
        <span style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2.4, lineHeight: 0.9, color: T.ink }}>
          {nf.format(Math.round(c.value))}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.mid }}>
          von {nf.format(c.target)} {unit}
        </span>
      </div>

      {series.length > 0
        ? <W3MonthStrip days={series} todayIndex={todayIndex} completed={c.completed} />
        : (
          // Honest while the series is in flight — never a strip of zeros,
          // which would read as a month in which nothing happened.
          <div style={{ height: 64 + 7 + 12 }} aria-hidden />
        )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 11px',
          borderRadius: 100, background: c.completed ? T.acidDim : T.surface2,
          fontSize: 11, fontWeight: 700, color: c.completed ? T.acid : T.mid, ...TNUM,
        }}>
          {c.completed ? `${nf.format(c.awarded_rc ?? c.reward_rc)} RC ausgezahlt` : `${nf.format(c.reward_rc)} RC`}
        </span>
        {(c.participants ?? 0) > 1 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.quiet, ...TNUM }}>
            {nf.format(c.participants as number)} dabei
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: T.acid, ...TNUM }}>
          {c.pct} %
        </span>
      </div>

    </motion.div>
  )
}

// ── A catalogue entry, before you are in it ─────────────────────────────────

function OpenCard({ c, busy, onJoin, onBoard }: {
  c: RewardChallenge; busy: boolean
  onJoin: () => void; onBoard: () => void
}) {
  const unit = UNIT[c.metric] ?? ''
  return (
    <div style={{
      background: T.surface, borderRadius: 20, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
          color: c.tier === 'gold' ? T.acid : c.tier === 'silver' ? T.mid : T.quiet,
        }}>{TIER_DE[c.tier] ?? c.tier}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.acid, ...TNUM }}>
          {nf.format(c.reward_rc)} RC
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>
          {c.title}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
          {c.detail}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.quiet, ...TNUM }}>
          {nf.format(c.target)} {unit}
        </span>
        {(c.participants ?? 0) > 0 && (
          <button
            type="button" onClick={onBoard}
            style={{
              border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
              fontFamily: FONT, fontSize: 11, fontWeight: 700, color: T.mid,
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
            {nf.format(c.participants as number)} dabei
          </button>
        )}
        <button
          type="button" onClick={onJoin} disabled={busy}
          style={{
            marginLeft: 'auto', height: 34, padding: '0 16px', borderRadius: 100, border: 0,
            background: T.acid, color: T.heroInk, fontFamily: FONT,
            fontSize: 12.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.5 : 1,
          }}>
          {busy ? 'einen Moment…' : 'Mitmachen'}
        </button>
      </div>
    </div>
  )
}

// ── The screen ──────────────────────────────────────────────────────────────


export interface W3ChallengesViewProps {
  period: string
  active: RewardChallenge[]
  available: RewardChallenge[]
  loading: boolean
  /** The lead challenge's day series. Empty until it lands. */
  leadDays: number[]
  /** RideCoin already paid out this month. 0 hides the chip. */
  earned: number
  /** Which catalogue entry is mid-join, so exactly one button spins. */
  joining: string | null
  sharing: boolean
  onBack: () => void
  onJoin: (key: string) => void
  onBoard: (c: { key: string; title: string; unit: string }) => void
  onCreate: () => void
  onShare: () => void
}

/** The next win leads: least complete among the unfinished, and only when
 *  everything is done does a finished one take the top. A rider opens this
 *  screen to decide what to do today, and the newest or the biggest is not
 *  the answer to that. */
export function leadOf(active: RewardChallenge[]): RewardChallenge | null {
  const open = active.filter((c) => !c.completed)
  const pool = open.length > 0 ? open : active
  return [...pool].sort((a, b) => b.pct - a.pct)[0] ?? null
}

export default function W3ChallengesView(p: W3ChallengesViewProps) {
  const lead = useMemo(() => leadOf(p.active), [p.active])
  const rest = useMemo(() => p.active.filter((c) => c.key !== lead?.key), [p.active, lead])

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{
        fontFamily: FONT, minHeight: '100dvh', background: T.bg,
        display: 'flex', flexDirection: 'column',
      }}>
        <W3StatusBar />

        <div style={{ ...band(20), paddingTop: 8, gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
            <button type="button" onClick={p.onBack} aria-label="Zurück" style={{
              width: 34, height: 34, borderRadius: 100, border: 0, background: T.surface,
              display: 'grid', placeItems: 'center', cursor: 'pointer', color: T.ink,
            }}>
              <ArrowLeft size={17} />
            </button>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6, color: T.ink, margin: 0 }}>
              Challenges
            </h1>
            {p.earned > 0 && (
              <span style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 28, padding: '0 12px', borderRadius: 100, background: T.acidDim,
                fontSize: 11.5, fontWeight: 800, color: T.acid, ...TNUM,
              }}>
                <Check size={12} /> {nf.format(p.earned)} RC
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.5, color: T.mid }}>
            Ein Monat, ein Ziel, und alle anderen, die es sich vorgenommen haben.
            Jede Zahl hier kommt aus deinen eigenen Fahrten.
          </span>
        </div>

        {p.loading ? (
          <div style={{ ...band(26) }}>
            <div style={{ height: 260, borderRadius: 26, background: T.surface }} />
          </div>
        ) : (
          <>
            {lead && (
              <div style={{ ...band(26) }}>
                <Lead c={lead} period={p.period} days={p.leadDays}
                  onShare={p.onShare} sharing={p.sharing} />
              </div>
            )}

            {rest.length > 0 && (
              <div style={{ ...band(26), gap: 10 }}>
                <Kicker>AUCH AM LAUFEN</Kicker>
                {rest.map((c) => (
                  <W3ChallengeRow key={c.key} vm={{
                    key: c.key,
                    title: c.title,
                    kind: c.metric as ChallengeKind,
                    value: Math.round(c.value),
                    target: Math.round(c.target),
                    unit: UNIT[c.metric] ?? '',
                    fill: c.pct / 100,
                    reward: `${nf.format(c.reward_rc)} RC`,
                    completed: c.completed,
                    // A finished challenge has no deadline left to run down;
                    // "noch 7 Tage" under GESCHAFFT is a countdown to nothing.
                    deadline: c.completed ? null : daysLeftLabel(p.period),
                    participants: c.participants,
                    onBoard: c.key.startsWith('custom:')
                      ? undefined
                      : () => p.onBoard({ key: c.key, title: c.title, unit: UNIT[c.metric] ?? '' }),
                  }} />
                ))}
              </div>
            )}

            {p.available.length > 0 && (
              <Reveal>
                <div style={{ ...band(26), gap: 10 }}>
                  <Kicker>ZUM MITMACHEN</Kicker>
                  {p.available.map((c) => (
                    <OpenCard key={c.key} c={c} busy={p.joining === c.key}
                      onJoin={() => p.onJoin(c.key)}
                      onBoard={() => p.onBoard({ key: c.key, title: c.title, unit: UNIT[c.metric] ?? '' })} />
                  ))}
                </div>
              </Reveal>
            )}

            <Reveal>
              <div style={{ ...band(30), gap: 10 }}>
                <Kicker>DEINE EIGENE</Kicker>
                <button type="button" onClick={p.onCreate} style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: 16, borderRadius: 20, border: `1px dashed ${T.heroOff}`,
                  background: 'transparent', cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
                }}>
                  <span style={{
                    width: 38, height: 38, flex: 'none', borderRadius: 12, background: T.acidDim,
                    display: 'grid', placeItems: 'center',
                  }}>
                    <Plus size={19} color={T.acid} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>
                      Eigene Challenge stellen
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>
                      Dein Ziel, dein Monat. Die Belohnung richtet sich danach, wie viel du dir vornimmst.
                    </span>
                  </span>
                </button>
              </div>
            </Reveal>
          </>
        )}

        <div style={{ flex: 1 }} />
        <W3TabBar />
      </div>
    </div>
  )
}
