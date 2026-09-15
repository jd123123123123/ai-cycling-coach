import { useMemo } from 'react'
import W3PlanExperience from './W3PlanExperience'
import { beforeVm } from '../../review-plan/data'
import type { ProgressExplorer } from '../../api/progressExplorer'

// This route mounts the production PlanExperience itself with deterministic
// review data. It is intentionally dev-only and never reachable in a build.
const PROGRESS: ProgressExplorer = {
  period: 'plan', start: '2026-08-17', end: '2026-09-15', plan_start: '2026-08-17',
  plan_note: 'Vergleich zum Planstart',
  ftp: { points: [], baseline: { date: '2026-08-17', value: 240, source: 'plan_start' }, current: 258, target: 270 },
  vo2: { points: [], baseline: { date: '2026-08-17', value: 48, source: 'plan_start' }, current: 51, target: 54 },
  records: [5, 60, 300, 1200, 3600].map((seconds, i) => ({
    seconds, watts: [1010, 720, 412, 318, 258][i], previous_watts: [950, 680, 390, 300, 240][i],
    all_time_watts: [1040, 760, 430, 330, 270][i], date: '2026-09-14', activity_id: null,
  })),
}

export default function W3PlanExperiencePreview() {
  const state = useMemo<'active' | 'ended' | 'empty' | 'created'>(() => {
    const value = new URLSearchParams(window.location.search).get('state')
    return value === 'active' || value === 'ended' || value === 'empty' ? value : 'created'
  }, [])
  return <W3PlanExperience
    vm={beforeVm}
    state={state}
    previewProgress={PROGRESS}
    onRebuild={async () => true}
    onOpenSession={() => {}}
    onCreatedDone={() => {}}
    weekOffset={0}
    onWeekOffset={() => {}}
  />
}
