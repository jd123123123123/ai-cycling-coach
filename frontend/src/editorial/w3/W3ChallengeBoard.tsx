import { motion, useReducedMotion } from 'motion/react'
import { X, Check } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { TNUM } from './w3surfaces'
import { useChallengeBoard } from '../../hooks/useRewardChallenges'

/**
 * Everyone in one challenge this month.
 *
 * WHY A BOARD AT ALL. A challenge nobody else can see you take is a to-do list
 * item. This is the whole difference, and it is why the sheet leads with the
 * count rather than with the winner: "63 dabei" is the reason to be in it, and
 * first place is somebody else's news.
 *
 * NOBODY FALLS OFF. The server ranks every enrolment and only then cuts the
 * list, so a rider sitting 40th is told they are 40th of 63 — and their own row
 * is pinned below the visible board rather than dropped. A leaderboard that
 * shows a rider nothing about themselves is a wall.
 *
 * A CUSTOM CHALLENGE HAS NO BOARD, and says so plainly: its key belongs to the
 * rider who invented it, so there is nobody else in it by construction.
 */

const nf = new Intl.NumberFormat('de-DE')

function Row({ rank, handle, value, unit, pct, completed, you }: {
  rank: number; handle: string; value: number; unit: string
  pct: number; completed: boolean; you: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '10px 12px', borderRadius: 14,
      background: you ? T.acidDim : T.surface2,
      border: `1px solid ${you ? `${T.acid}59` : 'transparent'}`,
    }}>
      <span style={{
        width: 22, flex: 'none', textAlign: 'right',
        fontSize: 12.5, fontWeight: 800, color: rank <= 3 ? T.acid : T.quiet, ...TNUM,
      }}>{rank}</span>

      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700,
        color: you ? T.acid : T.ink,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{handle}{you ? ' · du' : ''}</span>

      {completed && <Check size={13} color={T.acid} style={{ flex: 'none' }} />}

      <span style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, ...TNUM }}>
          {nf.format(Math.round(value))}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.quiet }}>{unit}</span>
      </span>

      <span style={{
        width: 34, flex: 'none', textAlign: 'right',
        fontSize: 10.5, fontWeight: 700, color: T.mid, ...TNUM,
      }}>{pct}%</span>
    </div>
  )
}

export default function W3ChallengeBoard({ challengeKey, title, unit, onClose }: {
  challengeKey: string
  title: string
  unit: string
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const { data, isLoading } = useChallengeBoard(challengeKey)
  const rows = data?.rows ?? []
  const you = data?.you ?? null
  const youIsVisible = you != null && rows.some((r) => r.user_id === you.user_id)

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: '#000000B8',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: FONT,
      }}>
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { y: 40 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.32, ease: EASE }}
        style={{
          width: '100%', maxWidth: 430, maxHeight: '82dvh', overflowY: 'auto',
          background: T.sheet, borderRadius: '26px 26px 0 0',
          padding: '18px 18px calc(22px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* The count leads. It is the reason to be in this one. */}
            <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5, color: T.ink }}>
              {data ? `${nf.format(data.participants)} dabei` : 'Wer ist dabei'}
            </span>
            <span style={{
              fontSize: 11.5, fontWeight: 600, color: T.quiet,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{title}</span>
          </div>
          <button onClick={onClose} aria-label="Schließen" style={{
            width: 32, height: 32, flex: 'none', borderRadius: 100, border: 0,
            background: T.surface2, display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}>
            <X size={15} color={T.mid} />
          </button>
        </div>

        {isLoading ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Wird geladen…</span>
        ) : rows.length === 0 ? (
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.5, color: T.quiet }}>
            {challengeKey.startsWith('custom:')
              ? 'Deine eigene Challenge — die fährst du gegen dich selbst.'
              : 'Noch niemand dabei. Sei die erste Person.'}
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {rows.map((r) => (
              <Row key={r.user_id} rank={r.rank} handle={r.handle} value={r.value}
                unit={unit} pct={r.pct} completed={r.completed}
                you={you?.user_id === r.user_id} />
            ))}

            {/* Pinned below the cut, so falling off the board still answers
                "where am I". */}
            {you != null && !youIsVisible && (
              <>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet,
                  padding: '6px 0 2px', textAlign: 'center',
                }}>· · ·</span>
                <Row rank={you.rank} handle={you.handle} value={you.value} unit={unit}
                  pct={you.pct} completed={you.completed} you />
              </>
            )}

            {data?.truncated && (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, paddingTop: 2 }}>
                Zeigt die ersten {rows.length} von {nf.format(data.participants)}.
              </span>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
