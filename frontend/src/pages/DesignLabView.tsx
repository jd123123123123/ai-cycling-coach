import AppShell from '../components/shell/AppShell'
import Scene from '../components/scene/Scene'
import MomentCard from '../components/celebration/MomentCard'
import { adherenceStreak, momentsForDay, type DayRecord } from '../utils/moments'

/**
 * DesignLabView — the one place the shared primitives are rendered side by side.
 *
 * This exists because the primitives are only "done" once they have been looked
 * at on a phone-sized viewport. It is lazily loaded like every other route, so
 * it costs nothing in the main bundle, and it renders from fixture data rather
 * than the API so it works without a synced account.
 *
 * Not linked from the nav — reachable at /design-lab when working on the system.
 */

// A real-ish Alpine profile: valley, a sustained climb, a descent.
const ELEVATION = Array.from({ length: 120 }, (_, i) => {
  if (i < 20) return 1050 + i * 4
  if (i < 70) return 1130 + (i - 20) * 18
  return 2030 - (i - 70) * 16
})

const WEEK_WITH_REST: DayRecord[] = [
  { date: '2026-07-28', prescribed: 'session', trained: true, grade: 'strong' },
  { date: '2026-07-29', prescribed: 'rest', trained: false },
  { date: '2026-07-30', prescribed: 'session', trained: true, grade: 'perfect' },
  { date: '2026-07-31', prescribed: 'session', trained: true, grade: 'okay' },
  { date: '2026-08-01', prescribed: 'rest', trained: false },
  { date: '2026-08-02', prescribed: 'session', trained: true, grade: 'strong' },
  { date: '2026-08-03', prescribed: 'rest', trained: false },
]

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span
        className="eyebrow"
        style={{ fontSize: 10, letterSpacing: '0.22em', fontWeight: 700, color: 'var(--color-muted)' }}
      >
        {label}
      </span>
      {children}
    </section>
  )
}

export default function DesignLabView() {
  const streak = adherenceStreak(WEEK_WITH_REST)
  const moments = momentsForDay(WEEK_WITH_REST, { ftpGainW: 6, prCount: 1 })

  return (
    <AppShell
      title="Design lab"
      subtitle="Shared primitives, phone-sized"
      scene={<Scene kind="sky" readiness={0.78} hour={7} seed="lab:sky" height={420} />}
    >
      <Section label="Scene · terrain">
        <div
          className="overflow-hidden rounded-2xl"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
        >
          <Scene kind="terrain" values={ELEVATION} seed="lab:terrain" height={150} />
        </div>
      </Section>

      <Section label="Scene · field (zones)">
        <div
          className="overflow-hidden rounded-2xl"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
        >
          <Scene kind="field" zones={[0.42, 0.28, 0.16, 0.09, 0.05]} seed="lab:field" height={110} />
        </div>
      </Section>

      <Section label="Scene · honest gap (no data)">
        <div
          className="grid place-items-center rounded-2xl"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-rule)',
            minHeight: 72,
          }}
        >
          {/* Renders null by design — the surface states the gap in words. */}
          <Scene kind="terrain" values={[]} seed="lab:empty" height={72} />
          <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            No route on file yet.
          </span>
        </div>
      </Section>

      <Section label={`Moments · adherence streak ${streak} days`}>
        <div className="flex flex-col gap-2">
          {moments.map((m) => (
            <MomentCard key={m.id} moment={m} />
          ))}
        </div>
      </Section>
    </AppShell>
  )
}
