import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Flag, Gauge, Timer } from 'lucide-react'
import { T, FONT, band, grow } from './w3tokens'

/**
 * WHAT STANDS WHERE A PLAN WOULD BE, when the rider has not set one.
 *
 * Today used to print "Trainingsblock · Deine Trainingswoche" and a "Ganzer
 * Plan" card to a rider with no plan at all — a heading with nothing behind it
 * and a link into an empty screen. That is worse than an empty state: it tells
 * a rider the app is already coaching them, so they never go and switch it on.
 *
 * So the slot says the true thing — there is no plan yet — and then does the
 * one useful thing a screen can do about it: name what a plan would be FOR, in
 * the rider's own terms, and make each one a way in. The three are the three
 * the app can genuinely act on (`TrainingGoals`): a target FTP, a target event,
 * and the hours a week the rider actually has. Nothing here offers a goal the
 * coach cannot then plan against.
 *
 * The card moves, gently and once: the three rows rise as it appears. A static
 * empty state reads as a dead end; movement reads as an invitation, and this
 * is the one place on Today where the app is asking for something rather than
 * reporting something.
 */

export interface W3GoalChoice {
  key: 'ftp' | 'event' | 'hours'
  label: string
  sub: string
}

const CHOICES: W3GoalChoice[] = [
  { key: 'ftp', label: 'FTP steigern', sub: 'Eine Zahl, auf die alles einzahlt' },
  { key: 'event', label: 'Ein Event vorbereiten', sub: 'Rückwärts geplant vom Tag X' },
  { key: 'hours', label: 'Mehr Stunden fahren', sub: 'Der Plan passt sich deiner Woche an' },
]

const ICON = { ftp: Gauge, event: Flag, hours: Timer } as const

export default function W3PickGoalCard({ onPick }: { onPick?: (key: W3GoalChoice['key']) => void }) {
  const reduce = useReducedMotion()

  return (
    <div style={{ ...band(26) }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 14,
        padding: '18px 18px 16px', borderRadius: 22, background: T.surface, fontFamily: FONT,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.acid }}>NOCH KEIN PLAN</span>
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15, color: T.ink }}>
            Sag dem Coach, worauf du hinfährst.
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>
            Ohne Ziel bekommst du Zahlen. Mit Ziel bekommst du eine Woche, die auf etwas zuläuft.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CHOICES.map((c, i) => {
            const Icon = ICON[c.key]
            return (
              <motion.button
                key={c.key}
                type="button"
                onClick={() => onPick?.(c.key)}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={grow(0.06 + i * 0.07)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '13px 14px', borderRadius: 16, border: 0,
                  background: T.surface2, cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
                }}>
                <span style={{
                  width: 34, height: 34, flex: 'none', borderRadius: 11, background: T.acidDim,
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon size={17} color={T.acid} />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{c.label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: T.quiet,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{c.sub}</span>
                </span>
                <ArrowRight size={16} color={T.mid} style={{ flex: 'none' }} />
              </motion.button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
