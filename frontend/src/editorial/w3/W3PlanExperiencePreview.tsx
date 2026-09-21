import { useMemo,useState } from 'react'
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
  const [offset,setOffset]=useState(0)
  const previewVm={...beforeVm,daySessions:beforeVm.daySessions?.map((d,i)=>{const date=new Date(2026,8,14+offset*7+i);return {...d,dateISO:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,dateLabel:date.toLocaleDateString('de-DE',{day:'numeric',month:'short'}),isPast:offset<0,isToday:offset===0&&i===0}})}
  return <W3PlanExperience
    vm={{...previewVm, finishStats:{tss:'1.984',km:'642,0',hours:'26,4',rides:'18'}, finishAnalysis:{planned:[230,260,285,300,320,280,340,269],actual:[214,248,301,276,345,265,329,258],adherence:94,note:'94% der geplanten Belastung umgesetzt · dein tatsächlicher Weg lag nah am Plan',impact:'Die Belastungsdosis lag nah am Plan. Dadurch ist der Vergleich von Startwert und Abschluss besonders belastbar.'}}}
    state={state}
    previewProgress={PROGRESS}
    planStart="2026-08-17"
    planEnd="2026-10-11"
    onRebuild={async () => true}
    onOpenSession={() => {}}
    onCreatedDone={() => {}}
    weekOffset={offset}
    onWeekOffset={setOffset}
  />
}
