import type { JSX, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'
import type { ChallengeMetric, CrewChallenge, ChallengeParticipant } from '../../api/challenges'
import { useCrewChallenges } from '../../hooks/useChallenges'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { T, FONT, EASE, DASH } from './w3tokens'
import { lux, hairline, TNUM } from './w3surfaces'
import { THEM_TINT } from './w3crew'
import W3Eyebrow from './W3Eyebrow'

/**
 * W3 · THE FEED'S CHALLENGES CUT.
 *
 * ── WHAT THIS CARD IS FOR ────────────────────────────────────────────────
 *
 * `GET /crews/challenges` has been complete for months and was reachable from
 * essentially nowhere: a crew defines "500 km diese Woche", the server scores
 * every member against it, and the rider never saw it. The feed's filter row
 * has a "Challenges" chip; this is what the chip shows.
 *
 * ── THE ONE THING A CHALLENGE CARD ANSWERS ───────────────────────────────
 *
 * "Where am I against this target." Not "here is a leaderboard" — a board is
 * the working, and the working belongs under the answer. So the card is built
 * in the app's normal order: the window it runs in, the thing being asked for,
 * MY figure at hero size with the 22-segment meter that IS that figure, and
 * only then the standings, as a list.
 *
 * A grid of equal tiles was the obvious alternative and it is wrong twice: it
 * makes six riders look like six equally important facts, and it gives the
 * rider no place to find themselves.
 *
 * ── COLOUR MEANS THE SAME THING IT MEANS EVERYWHERE ELSE ─────────────────
 *
 * `w3crew` already decided this and the crew screens all obey it: acid is you,
 * violet is the crew. A challenge is a crew object with your progress inside
 * it, so the card's ground, eyebrow and standings are violet, and the acid is
 * spent exactly twice — on your number and on the meter that is your number.
 * When you are NOT in the challenge there is no acid on the card at all: the
 * figure shown belongs to the leader, so it is drawn in the leader's colour
 * and it says whose it is. Painting somebody else's kilometres in your colour
 * is the kind of quiet lie this app has a rule against.
 */

// The meter, in the count every other screen uses. Today's readiness, Plan's
// periodisation and Erfolge's cabinet are all 22 steps; a challenge is not the
// place to introduce a 23rd dialect.
const SEGMENTS = 22
const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'
/** The standings never grow past this — a feed card is not a leaderboard. */
const ROWS = 5

const NF_INT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const NF_TENTH = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/**
 * THE UNIT IS THE METRIC'S OWN, AND EVERY METRIC HAS ONE.
 *
 * No default case: a `never` on the last line means adding a seventh metric to
 * `ChallengeMetric` breaks the build here rather than silently printing "km"
 * at a rider whose challenge is measured in kilojoules.
 */
function metricUnit(metric: ChallengeMetric): string {
  switch (metric) {
    case 'tss': return 'TSS'
    case 'distance_km': return 'km'
    case 'active_days': return 'Tage'
    case 'hours': return 'Stunden'
    case 'kj': return 'kJ'
    case 'rides': return 'Fahrten'
  }
  const never: never = metric
  return never
}

/** Hours and kilometres are ridden in tenths; rides and days are not. */
function metricNumber(metric: ChallengeMetric, value: number): string {
  const fine = metric === 'hours' || metric === 'distance_km'
  return (fine ? NF_TENTH : NF_INT).format(value)
}

/** ISO yyyy-mm-dd → LOCAL midnight. `new Date('2026-09-06')` is UTC midnight,
 *  which is the day before for everyone west of Greenwich. */
function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Whole days from today to `ends_on`, inclusive of the end day. */
function daysLeft(endsOn: string): number | null {
  const end = parseISO(endsOn)
  if (!end) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

/** "MONAT · NOCH 6 TAGE". The window, then how much of it is left. */
function eyebrowText(c: CrewChallenge): string {
  const window = c.period === 'month' ? 'MONAT' : 'WOCHE'
  const d = daysLeft(c.ends_on)
  if (d == null) return window
  if (d < 0) return `${window} · BEENDET`
  if (d === 0) return `${window} · LETZTER TAG`
  if (d === 1) return `${window} · NOCH 1 TAG`
  return `${window} · NOCH ${d} TAGE`
}

// ── The meter ───────────────────────────────────────────────────────────────

function Meter({ frac, accent }: { frac: number; accent: string }) {
  const reduce = useReducedMotion()
  const filled = Math.round(Math.max(0, Math.min(1, frac)) * SEGMENTS)
  return (
    <div style={{ display: 'flex', width: '100%', gap: 3, alignItems: 'flex-end' }} aria-hidden>
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const done = i < filled
        const next = i === filled
        return (
          <motion.span
            key={i}
            initial={reduce ? false : { opacity: 0.25, scaleY: 0.6 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : (done ? i * 0.018 : 0) }}
            style={{
              flex: 1, height: next ? 16 : 12, borderRadius: 3, transformOrigin: 'bottom',
              background: next ? accent : done ? `${accent}66` : T.heroOff,
            }}
          />
        )
      })}
    </div>
  )
}

// ── One challenge ───────────────────────────────────────────────────────────

function ChallengeCard({ c, meId, index }: { c: CrewChallenge; meId: number | null; index: number }) {
  const reduce = useReducedMotion()
  const unit = metricUnit(c.metric)

  const mine = meId == null ? undefined : c.participants.find((p) => p.user_id === meId)
  // Already sorted by value desc on the wire, so the leader is simply first.
  const leader: ChallengeParticipant | undefined = c.participants[0]
  const subject = mine ?? leader
  const isMine = mine != null
  const accent = isMine ? T.acid : THEM_TINT

  const frac = subject && c.target > 0 ? subject.value / c.target : 0
  const rows = c.participants.slice(0, ROWS)
  const rest = c.participants.length - rows.length

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: EASE, delay: reduce ? 0 : index * 0.06 }}
      style={{
        ...lux(26),
        padding: '16px 16px 14px',
        gap: 12,
        fontFamily: FONT,
        // The crew's own ground, faint. A challenge is not a rider's post and
        // it should not read as one.
        background: `linear-gradient(155deg, ${THEM_TINT}1F, ${T.heroDock} 58%)`,
      }}
    >
      <W3Eyebrow kind="label" tone={THEM_TINT}>{eyebrowText(c)}</W3Eyebrow>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 18.5, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15, color: T.ink, textWrap: 'balance' }}>
          {c.name}
        </span>
        <span style={{ ...TNUM, fontSize: 12, fontWeight: 500, color: T.mid }}>
          Ziel: {metricNumber(c.metric, c.target)} {unit}
        </span>
      </div>

      {/* THE CARD'S BIGGEST OBJECT. Yours if you are in it; otherwise the
          leader's, said out loud. */}
      {subject ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
          {!isMine && (
            <span style={{ fontSize: 11, fontWeight: 500, color: T.mid }}>
              Du fährst nicht mit · Führung: {subject.handle}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, minWidth: 0 }}>
            <span style={{
              ...TNUM, fontFamily: ARCHIVO, fontSize: 44, fontWeight: 700,
              letterSpacing: -2, lineHeight: 0.85, color: accent,
            }}>
              {metricNumber(c.metric, subject.value)}
            </span>
            <span style={{ ...TNUM, fontSize: 12, fontWeight: 500, color: T.mid, paddingBottom: 3 }}>
              von {metricNumber(c.metric, c.target)} {unit}
            </span>
          </div>
          <Meter frac={frac} accent={accent} />
        </div>
      ) : (
        <span style={{ fontSize: 12, fontWeight: 500, color: T.quiet }}>
          Noch niemand hat für diese Challenge gefahren. {DASH}
        </span>
      )}

      {rows.length > 0 && (
        <>
          <div style={hairline()} />
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
            {rows.map((p) => {
              const isMe = meId != null && p.user_id === meId
              return (
                <li key={p.user_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '5px 0', minWidth: 0,
                }}>
                  <span aria-hidden style={{
                    flex: 'none', width: 5, height: 5, borderRadius: 100,
                    background: isMe ? T.acid : 'transparent',
                  }} />
                  <span style={{
                    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontSize: 12.5, fontWeight: isMe ? 600 : 500, color: isMe ? T.ink : T.mid,
                  }}>
                    {p.handle}
                  </span>
                  {/* THE LIT STATE IS THE CREW'S COLOUR, EVEN ON MY OWN ROW.
                      Acid is already spent twice on this card — the hero
                      numeral and the meter under it. A third and fourth acid
                      figure down here is exactly the inflation that makes a
                      W3 card read as loud rather than as ranked. The 5px dot
                      is enough to find myself in five rows. */}
                  {p.reached && (
                    <Check size={12} strokeWidth={2.4} color={THEM_TINT} style={{ flex: 'none' }} aria-label="Ziel erreicht" />
                  )}
                  <span style={{
                    ...TNUM, marginLeft: 'auto', flex: 'none', fontSize: 12.5,
                    fontWeight: 600, color: p.reached ? THEM_TINT : T.mid,
                  }}>
                    {metricNumber(c.metric, p.value)} {unit}
                  </span>
                </li>
              )
            })}
          </ul>
          {rest > 0 && (
            <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet }}>
              +{rest} weitere
            </span>
          )}
        </>
      )}
    </motion.article>
  )
}

// ── The states before there is a challenge to draw ───────────────────────────

/** The card's real geometry, greyed. A spinner tells the rider nothing about
 *  what is coming; a block the shape of the answer tells them everything. */
function Skeleton() {
  const reduce = useReducedMotion()
  const pulse = reduce ? {} : { animate: { opacity: [0.45, 0.8, 0.45] }, transition: { duration: 1.4, repeat: Infinity, ease: EASE } }
  const bar = (w: number | string, h: number) => ({
    width: w, height: h, borderRadius: h / 2, background: T.d1, flex: 'none' as const,
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }} aria-hidden>
      {[0, 1].map((k) => (
        <motion.div key={k} {...pulse} style={{ ...lux(26), padding: '16px 16px 14px', gap: 12 }}>
          <div style={bar(88, 8)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={bar('62%', 16)} />
            <div style={bar(96, 10)} />
          </div>
          <div style={bar(132, 32)} />
          <div style={{ display: 'flex', width: '100%', gap: 3, alignItems: 'flex-end' }}>
            {Array.from({ length: SEGMENTS }).map((_, i) => (
              <span key={i} style={{ flex: 1, height: 12, borderRadius: 3, background: T.heroOff }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 4 }}>
            {[0, 1, 2].map((r) => <div key={r} style={bar('100%', 10)} />)}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function Quiet({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...lux(26), padding: '18px 16px', gap: 12, alignItems: 'flex-start', fontFamily: FONT }}>
      {children}
    </div>
  )
}

// ── The cut ─────────────────────────────────────────────────────────────────

export default function W3FeedChallenges({ onCreate }: { onCreate?: () => void }): JSX.Element {
  const { data, isLoading, isError } = useCrewChallenges()
  const profile = useAthleteProfile()
  const meId = profile.data?.user_id ?? null

  if (isLoading && !data) {
    return <Skeleton />
  }

  if (isError && !data) {
    return (
      <Quiet>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: T.mid }}>
          Challenges konnten nicht geladen werden.
        </span>
      </Quiet>
    )
  }

  const challenges = data ?? []

  if (challenges.length === 0) {
    return (
      <Quiet>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: T.mid }}>
          Deine Crew hat gerade keine Challenge.
        </span>
        {/* No `onCreate`, no button. A control that does nothing when pressed
            is worse than the absence of the control. */}
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            style={{
              border: 0, borderRadius: 100, padding: '10px 16px', cursor: 'pointer',
              background: T.acid, color: T.heroInk,
              fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
            }}
          >
            Challenge erstellen
          </button>
        )}
      </Quiet>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minWidth: 0, fontFamily: FONT }}>
      {challenges.map((c, i) => (
        <ChallengeCard key={c.id} c={c} meId={meId} index={i} />
      ))}
    </div>
  )
}
