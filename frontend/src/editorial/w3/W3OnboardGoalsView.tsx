import { motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3OnboardTopBar, W3OnboardDots, W3OnboardCta, W3OnboardHeadline } from './W3OnboardKit'
import './w3.css'

/**
 * W3 · Onboarding — "Set your year". The rider sets the season's shape: a
 * distance target, how many days a week they ride, which weekdays are theirs,
 * and which of those carry the long ride. A live summary reads the plan back
 * in one line. Pure function of props — all state + persistence live in the
 * Page. Reused kit chrome (top bar / progress dots / acid CTA).
 */

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const WEEKDAYS: { key: Weekday; short: string }[] = [
  { key: 'mon', short: 'Mon' },
  { key: 'tue', short: 'Tue' },
  { key: 'wed', short: 'Wed' },
  { key: 'thu', short: 'Thu' },
  { key: 'fri', short: 'Fri' },
  { key: 'sat', short: 'Sat' },
  { key: 'sun', short: 'Sun' },
]

export interface W3YearGoals {
  /** Distance target for the year, in kilometres. */
  distanceKm: number
  /** Target training days per week, 1–7. */
  daysPerWeek: number
  /** Weekdays the rider prefers to train. */
  trainingDays: Weekday[]
  /** Weekday(s) reserved for the long ride. */
  longRideDays: Weekday[]
}

export const DISTANCE_MIN = 1000
export const DISTANCE_MAX = 20000
export const DISTANCE_STEP = 500

const fmtKm = (km: number) => km.toLocaleString('en-US')

/** One-line human read-back of the plan, e.g. "8,000 km · 4 days/week · long rides on Sat". */
export function summarize(g: W3YearGoals): string {
  const parts = [`${fmtKm(g.distanceKm)} km`, `${g.daysPerWeek} day${g.daysPerWeek === 1 ? '' : 's'}/week`]
  const longs = WEEKDAYS.filter((d) => g.longRideDays.includes(d.key)).map((d) => d.short)
  parts.push(longs.length ? `long ride${longs.length === 1 ? '' : 's'} on ${longs.join(' & ')}` : 'no long ride set')
  return parts.join(' · ')
}

export interface W3OnboardGoalsProps {
  goals: W3YearGoals
  onChange: (patch: Partial<W3YearGoals>) => void
  onNext: () => void
  onSkip: () => void
  saving?: boolean
  step?: number
  total?: number
}

export default function W3OnboardGoalsView({
  goals,
  onChange,
  onNext,
  onSkip,
  saving = false,
  step = 3,
  total = 5,
}: W3OnboardGoalsProps) {
  const reduce = useReducedMotion()

  const clampDistance = (km: number) => Math.min(DISTANCE_MAX, Math.max(DISTANCE_MIN, km))
  const bumpDistance = (delta: number) =>
    onChange({ distanceKm: clampDistance(Math.round((goals.distanceKm + delta) / DISTANCE_STEP) * DISTANCE_STEP) })

  const toggleDay = (field: 'trainingDays' | 'longRideDays', day: Weekday) => {
    const set = new Set(goals[field])
    if (set.has(day)) set.delete(day)
    else set.add(day)
    // Keep in canonical Mon–Sun order for a stable summary read-back.
    const next = WEEKDAYS.filter((d) => set.has(d.key)).map((d) => d.key)
    if (field === 'longRideDays') {
      // A long-ride day is also a training day — keep the two in sync so the
      // summary never claims a long ride on a day the rider isn't training.
      const trainSet = new Set(goals.trainingDays)
      next.forEach((d) => trainSet.add(d))
      const nextTrain = WEEKDAYS.filter((d) => trainSet.has(d.key)).map((d) => d.key)
      onChange({ longRideDays: next, trainingDays: nextTrain })
    } else {
      // Dropping a training day drops it as a long-ride day too.
      const nextLong = goals.longRideDays.filter((d) => set.has(d))
      onChange({ trainingDays: next, longRideDays: nextLong })
    }
  }

  const enter = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: EASE, delay } }

  return (
    <div className="w3-root">
      <div style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3OnboardTopBar onSkip={onSkip} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '14px 20px 28px', flex: 1 }}>
          <motion.div {...enter(0.05)}>
            <W3OnboardHeadline
              kicker="04 — YOUR SEASON"
              line1="Set your"
              line2="year."
              body="Give the coach the shape of your season. You can change any of this later in Settings."
            />
          </motion.div>

          {/* Distance target */}
          <motion.section {...enter(0.12)} style={sectionStyle}>
            <Label>Distance goal · this year</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <StepButton ariaLabel="Decrease distance" onClick={() => bumpDistance(-DISTANCE_STEP)} disabled={goals.distanceKm <= DISTANCE_MIN}>
                <Minus size={20} strokeWidth={2.6} color={T.ink} />
              </StepButton>
              <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.4, color: T.ink, lineHeight: 1 }}>
                  {fmtKm(goals.distanceKm)}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>KM</span>
              </div>
              <StepButton ariaLabel="Increase distance" onClick={() => bumpDistance(DISTANCE_STEP)} disabled={goals.distanceKm >= DISTANCE_MAX}>
                <Plus size={20} strokeWidth={2.6} color={T.ink} />
              </StepButton>
            </div>
            <input
              type="range"
              min={DISTANCE_MIN}
              max={DISTANCE_MAX}
              step={DISTANCE_STEP}
              value={goals.distanceKm}
              onChange={(e) => onChange({ distanceKm: clampDistance(Number(e.target.value)) })}
              aria-label="Distance goal in kilometres"
              style={{ width: '100%', accentColor: T.acid, height: 28, marginTop: 4, colorScheme: 'dark' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={scaleStyle}>{fmtKm(DISTANCE_MIN)}</span>
              <span style={scaleStyle}>{fmtKm(DISTANCE_MAX)}</span>
            </div>
          </motion.section>

          {/* Days per week */}
          <motion.section {...enter(0.18)} style={sectionStyle}>
            <Label>Training days · per week</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                const active = goals.daysPerWeek === n
                return (
                  <button
                    key={n}
                    onClick={() => onChange({ daysPerWeek: n })}
                    aria-pressed={active}
                    style={{
                      flex: 1, height: 46, borderRadius: 14, cursor: 'pointer',
                      background: active ? T.acid : T.surface2,
                      color: active ? T.bg : T.mid,
                      border: `1px solid ${active ? T.acid : T.stroke}`,
                      fontFamily: FONT, fontSize: 16, fontWeight: 800,
                      transition: 'background 160ms, color 160ms, border-color 160ms',
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </motion.section>

          {/* Favourite training days */}
          <motion.section {...enter(0.24)} style={sectionStyle}>
            <Label>Favourite days</Label>
            <DayChips
              selected={goals.trainingDays}
              onToggle={(d) => toggleDay('trainingDays', d)}
              accent="train"
            />
          </motion.section>

          {/* Long-ride day(s) */}
          <motion.section {...enter(0.3)} style={sectionStyle}>
            <Label>Long-ride day{goals.longRideDays.length === 1 ? '' : 's'}</Label>
            <DayChips
              selected={goals.longRideDays}
              onToggle={(d) => toggleDay('longRideDays', d)}
              accent="long"
            />
          </motion.section>

          {/* Live summary */}
          <motion.div
            {...enter(0.36)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', borderRadius: 16,
              background: T.acidDim, border: `1px solid ${T.acid}44`,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: T.acidDeep }}>Your year</span>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.3, color: T.ink, lineHeight: 1.35 }}>{summarize(goals)}</span>
          </motion.div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 'auto', paddingTop: 8 }}>
            <W3OnboardDots step={step} total={total} />
            <W3OnboardCta label={saving ? 'SAVING…' : 'NEXT'} onClick={onNext} />
          </div>
        </div>
      </div>
    </div>
  )
}

const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 }
const scaleStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: T.quiet }}>{children}</span>
  )
}

/** Big (48px) circular +/- tap target for the distance stepper. */
function StepButton({ children, onClick, disabled, ariaLabel }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; ariaLabel: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: 48, height: 48, borderRadius: '50%', flex: 'none', cursor: disabled ? 'default' : 'pointer',
        background: T.surface2, border: `1px solid ${T.stroke}`,
        display: 'grid', placeItems: 'center', opacity: disabled ? 0.4 : 1,
        transition: 'opacity 160ms',
      }}
    >
      {children}
    </button>
  )
}

/** Mon–Sun multi-select chip row. Touch-friendly (46px tall). */
function DayChips({ selected, onToggle, accent }: { selected: Weekday[]; onToggle: (d: Weekday) => void; accent: 'train' | 'long' }) {
  const on = accent === 'long' ? T.evening : T.acid
  const onInk = accent === 'long' ? T.ink : T.bg
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {WEEKDAYS.map((d) => {
        const active = selected.includes(d.key)
        return (
          <button
            key={d.key}
            onClick={() => onToggle(d.key)}
            aria-pressed={active}
            style={{
              flex: 1, height: 46, borderRadius: 12, cursor: 'pointer',
              background: active ? on : T.surface2,
              color: active ? onInk : T.mid,
              border: `1px solid ${active ? on : T.stroke}`,
              fontFamily: FONT, fontSize: 12.5, fontWeight: 800, letterSpacing: 0.2,
              transition: 'background 160ms, color 160ms, border-color 160ms',
            }}
          >
            {d.short.slice(0, 2)}
          </button>
        )
      })}
    </div>
  )
}
