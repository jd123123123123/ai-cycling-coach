import { motion, useReducedMotion } from 'framer-motion'
import { CalendarCheck, Clock, Flame, MoreHorizontal, Mountain, Route, Zap } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { TNUM } from './w3surfaces'

/**
 * One challenge, drawn so a rider can tell what it wants at a glance.
 *
 * WHAT WAS WRONG WITH THE OLD ROW. Every challenge was the same grey block:
 * a title, a reward in 9.5px, the actual measurement — "20.840 von 80.150 km ·
 * noch 4 Wochen" — squeezed into a 10.5px quiet line, and a 20-segment gauge
 * with no number on it. Six different challenges about six different things
 * looked identical, so reading the list meant reading every word of it.
 *
 * THREE THINGS CARRY IT NOW, in the order the eye finds them:
 *
 *   1. THE MARK. Each metric gets its own icon and its own tinted tile — a road
 *      for kilometres, a mountain for climbing, a flame for active days. The
 *      list becomes scannable by shape before a single word is read.
 *   2. THE NUMBER. What you have, big, against what it takes, quiet, with the
 *      unit spelled out. This is the sentence the rider actually came for and
 *      it was the smallest thing on the row.
 *   3. THE BAR, with the percentage on it. A segmented gauge is a nice texture
 *      and a poor instrument: twenty notches cannot say 41%.
 *
 * A FINISHED CHALLENGE IS NOT A GREYED-OUT ONE. It fills acid, states what it
 * paid, and keeps its place in the list — the reward layer's whole job is to
 * make the done thing feel done.
 */

export type ChallengeKind = 'distance_km' | 'active_days' | 'tss' | 'rides' | 'hours' | 'kj'

export interface W3ChallengeRowVm {
  key: string
  title: string
  kind: ChallengeKind
  /** Where the rider is, and where the line is. Real numbers, already rounded. */
  value: number
  target: number
  unit: string
  /** 0–1. Kept separate from value/target because the server computes it. */
  fill: number
  /** RideCoin at stake, formatted. */
  reward: string
  completed: boolean
  /** "noch 4 Wochen" — null when the challenge has no deadline. */
  deadline?: string | null
  /** Only an in-flight custom challenge can be edited. */
  editable?: boolean
  onEdit?: () => void
}

//: TOKENS ONLY. Every tint here is one the design system already names — the
//: isolation gate exists precisely to stop a new screen inventing a sixth blue,
//: and it caught this file's first draft doing exactly that.
const MARK: Record<ChallengeKind, { icon: typeof Route; tint: string }> = {
  distance_km: { icon: Route, tint: T.cool },
  active_days: { icon: CalendarCheck, tint: T.training },
  tss: { icon: Zap, tint: T.warn },
  rides: { icon: Flame, tint: T.lilac },
  hours: { icon: Clock, tint: T.evening },
  kj: { icon: Mountain, tint: T.acid },
}

const nf = new Intl.NumberFormat('de-DE')

export default function W3ChallengeRow({ vm }: { vm: W3ChallengeRowVm }) {
  const reduce = useReducedMotion()
  const mark = MARK[vm.kind] ?? MARK.distance_km
  const Icon = mark.icon
  const pct = Math.max(0, Math.min(1, vm.fill))
  const tone = vm.completed ? T.acid : mark.tint

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: 16,
      borderRadius: 20, background: T.surface, fontFamily: FONT,
      // A finished challenge is outlined in acid rather than dimmed: done is a
      // state to be proud of, not a state to be retired.
      border: `1px solid ${vm.completed ? `${T.acid}59` : 'transparent'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          flex: 'none', width: 40, height: 40, borderRadius: 13,
          background: `${tone}1F`, display: 'grid', placeItems: 'center',
        }}>
          <Icon size={20} color={tone} strokeWidth={2.2} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{
            fontSize: 15, fontWeight: 700, letterSpacing: -0.2, color: T.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{vm.title}</span>
          {vm.deadline && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{vm.deadline}</span>
          )}
        </div>

        {vm.editable
          ? (
            <button
              onClick={vm.onEdit} aria-label="Challenge bearbeiten"
              style={{ background: 'transparent', border: 0, padding: 4, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            >
              <MoreHorizontal size={16} color={T.mid} />
            </button>
          )
          : null}
      </div>

      {/* THE NUMBER. What the rider came to read, at the size that says so. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, ...TNUM }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, color: T.ink }}>
          {nf.format(vm.value)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>
          von {nf.format(vm.target)} {vm.unit}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: tone, ...TNUM,
        }}>
          {Math.round(pct * 100)} %
        </span>
      </div>

      {/* THE BAR. One continuous track, because twenty notches cannot say 41%. */}
      <div style={{
        height: 8, borderRadius: 100, background: T.surface2, overflow: 'hidden',
      }}>
        <motion.div
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.7, ease: EASE }}
          style={{
            height: '100%', borderRadius: 100,
            background: vm.completed
              ? T.acid
              : `linear-gradient(90deg, ${tone}99, ${tone})`,
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
          color: vm.completed ? T.acid : T.quiet,
        }}>
          {vm.completed ? 'GESCHAFFT' : 'IN ARBEIT'}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 12px',
          borderRadius: 100, background: vm.completed ? T.acidDim : T.surface2,
          fontSize: 11, fontWeight: 700, color: vm.completed ? T.acid : T.mid, ...TNUM,
        }}>{vm.reward}</span>
      </div>
    </div>
  )
}
