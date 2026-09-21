import { Fragment, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useW3FormData } from './useW3FormData'
import { validFormPoint, type FormPoint } from './w3TrainingImpact'
import { T, FONT, EASE } from './w3tokens'
import W3PlanPhaseProgress from './W3PlanPhaseProgress'
import W3PlanPhaseRoad from './W3PlanPhaseRoad'
import W3ProgressCompact from './W3ProgressCompact'
import type { W3Vm } from './W3TodayView'
import './w3TodayTrainingEditorial.css'

type Section = 'today' | 'week' | 'form' | 'crew' | 'progress' | 'goals' | 'rides'
interface Sections { weather?: ReactNode; rides?:ReactNode; ridesSummary?:ReactNode; progress?:ReactNode; progressSummary?:ReactNode; goalSummary?:ReactNode; persistentForm?: (expanded:boolean) => ReactNode; selectedWeekDay?: number; onSelectWeekDay?: (index:number) => void; onOpenPlan?: () => void; onPickGoal?: (intent: 'ftp' | 'event' | 'hours' | null) => void; today?: ReactNode; week: ReactNode; form: ReactNode; crew: ReactNode; goals: ReactNode }
export interface OverviewData {
  form: FormPoint | null
  history?: FormPoint[]
  crew: { name: string; rank: number | null; count: number; avatars: { handle: string; image: string | null }[] } | null
  crewState: 'ready' | 'loading' | 'error'
  ftp: number | null
  ftpGoal: number | null
}
const num = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)

function FormSpark({ points, metric, color }: { points: FormPoint[]; metric: 'ctl' | 'atl' | 'tsb'; color: string }) {
  if (points.length < 2) return null
  const values = points.map(p => p[metric])
  const low = Math.min(...values), high = Math.max(...values)
  const span = Math.max(5, high - low)
  const path = values.map((v, i) => `${2 + i / (values.length - 1) * 88},${25 - (v - low) / span * 21}`).join(' ')
  return <svg viewBox="0 0 92 28" className="w3-overview-spark" role="img" aria-label={`Verlauf der letzten ${points.length} Tage: ${values.map(num).join(', ')}`}>
    <polyline points={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="90" cy={25 - (values.at(-1)! - low) / span * 21} r="2.5" fill={color} />
  </svg>
}

export function W3TodayOverviewView({ vm, data, onOpenPlan, onPickGoal, selectedWeekDay, onSelectWeekDay, persistentForm, progressSummary, goalSummary, ridesSummary, weather, ...details }: { vm: W3Vm; data: OverviewData } & Sections) {
  const [open, setOpen] = useState<Section | null>(null)
  const [planOpen,setPlanOpen]=useState(false)
  const [localWeekDay, setLocalWeekDay] = useState<number | null>(null)
  const selected = selectedWeekDay ?? localWeekDay ?? Math.max(0,vm.weekDays.findIndex(d=>d.status==='today'))
  const uid = useId()
  const reduce = useReducedMotion()
  const today = vm.weekDays.find(day => day.status === 'today')
  const hasTodaySession = vm.hasPlan && !!today?.title && !today.rest
  const blocks = hasTodaySession ? (today?.blocks?.length ? today.blocks : vm.sessionBlocks ?? []) : []
  const todayTitle = !vm.hasPlan ? 'Noch kein Training geplant' : today?.rest ? 'Ruhetag' : today?.title || 'Noch kein Training geplant'
  const todayFacts = hasTodaySession ? [
    vm.sessionDur,
    today?.targetW && today.targetW !== '—' ? today.targetW : null,
    today?.planned != null ? `${num(today.planned)} TSS` : null,
  ].filter(Boolean).join(' · ') : ''
  const todayTokens = {
    '--today-training-surface': T.surface,
    '--today-training-mid': T.mid,
    '--today-training-ink': T.ink,
  } as CSSProperties
  const weekMax = Math.max(1, ...vm.weekDays.map(d => Math.max(d.actual || 0, d.planned ?? 0)))
  const form = data.form
  const titles: Record<Section, string> = { today: 'Heute', week: 'Deine Woche', form: 'Deine Form', crew: 'Crew', rides:'Unterwegs', progress:'Fortschritt', goals: 'Ziele' }
  const subtitle: Record<Section, string> = {
    today: today?.rest ? 'Ruhetag' : [today?.title ?? 'Noch kein Training geplant', today?.title ? vm.sessionDur : null].filter(Boolean).join(' · '),
    week: vm.hasPlan ? [vm.weekLoadLabel || vm.weekBlockLabel || 'Dein Wochenplan', vm.weekDoneChip].filter(Boolean).join(' · ') : 'Dein Training planen',
    form: form == null ? 'Noch kein Verlauf' : form.tsb >= 0 ? 'Wenig Ermüdung' : 'Belastung im Körper',
    crew: data.crewState === 'loading' ? 'Crew wird geladen' : data.crewState === 'error' ? 'Crew nicht verfügbar' : data.crew?.name ?? 'Gemeinsam fahren',
    goals:'', rides:'',
    progress: data.ftp == null ? (vm.weekGoal?.name ?? 'Dein nächstes Ziel') : data.ftpGoal != null ? `FTP ${num(data.ftp)} von ${num(data.ftpGoal)} W` : `FTP ${num(data.ftp)} W`,
  }
  return <div className="w3-today-overview" style={{ fontFamily: FONT }}>
    {(['today', 'week', 'form', 'crew', 'rides', 'progress', 'goals'] as const).filter(key=>key!=='rides'||(details.rides!==undefined&&data.crew!=null)).map(key => <Fragment key={key}><section data-today-card={key} className="w3-overview-card" data-open={open === key} style={key === 'today' ? todayTokens : undefined}>
      <div className="w3-overview-header">
        <h2 id={`${uid}-${key}-title`} className="w3-overview-title">{titles[key]}</h2>
        <motion.button id={`${uid}-${key}-toggle`} className="w3-overview-toggle" type="button" aria-label={`${titles[key]} ${open === key ? 'schließen' : 'öffnen'}`} aria-expanded={open === key} aria-controls={`${uid}-${key}`} onClick={() => setOpen(open === key ? null : key)} whileTap={reduce ? undefined : {scale:0.93}}>
          {open === key ? <ArrowLeft size={16} aria-hidden /> : <ArrowUpRight size={16} aria-hidden />}
        </motion.button>
      </div>
      {key === 'form' && persistentForm ? <div id={`${uid}-${key}`} className="w3-overview-form-persistent" role="region" aria-labelledby={`${uid}-${key}-title`}>{persistentForm(open==='form')}</div> : <>
      <motion.div initial={false} animate={{height:open === key && key !== 'week' ? 0 : 'auto',opacity:open === key && key !== 'week' ? 0 : 1}} transition={{duration:reduce ? 0 : 0.26,ease:EASE}} aria-hidden={open === key && key !== 'week'} inert={open === key && key !== 'week'} style={{overflow:'hidden'}}>
      <div className="w3-overview-summary">
          {key !== 'today' && <span className="w3-overview-copy">{key!=='goals'&&key!=='progress'&&subtitle[key]}</span>}{key==='goals'&&<div className="w3-overview-goals-summary">{goalSummary??'Dein nächstes Ziel'}</div>}
          {key === 'today' && <>
            <span className="w3-today-training-summary-title">{todayTitle}</span>
            {todayFacts && <span className="w3-today-training-summary-facts">{todayFacts}</span>}
            {blocks.length > 0 && <span className="w3-today-training-summary-profile" role="img" aria-label={`Trainingsprofil: ${blocks.map(b => b.label).join(', ')}`}>
              {blocks.map((b, i) => <span key={i} style={{ flex: 1, minWidth: 0, height: `${Math.max(4, Math.min(100, b.w * 100))}%`, borderRadius: '3px 3px 0 0', background: b.work ? T.acid : T.heroOff }} />)}
            </span>}
          </>}
          {key === 'week' && <div aria-label="Trainingsbelastung der Woche" className="w3-overview-week">
            {vm.weekDays.map((d, i) => {
              const expanded=open==='week'
              const height=expanded?58:34
              const label=`${d.dateLabel??d.letter}: ${d.title ?? (d.rest?'Ruhetag':'Kein Training geplant')} · ${d.actual??0} TSS gefahren${d.planned != null ? ` / ${d.planned} TSS geplant` : ''}`
              return <button type="button" key={d.dateLabel??i} className="w3-overview-day" data-current={d.status === 'today'} aria-pressed={selected===i} aria-label={label} title={label} onClick={()=>{setLocalWeekDay(i);onSelectWeekDay?.(i);setOpen('week')}}>
                <motion.span className="w3-overview-day-track" initial={false} animate={{height}} transition={{duration:reduce?0:.3,ease:EASE}} aria-hidden>
                  <motion.span className="w3-overview-day-plan" initial={false} animate={{height:Math.max(3,(d.planned??0)/weekMax*height)}} transition={{duration:reduce?0:.3,ease:EASE}} />
                  {d.actual>0&&<motion.span className="w3-overview-day-done" initial={false} animate={{height:d.actual/weekMax*height}} transition={{duration:reduce?0:.3,ease:EASE}}/>}
                </motion.span>
                <span>{d.letter}</span>
                <motion.span className="w3-overview-day-date" initial={false} animate={{height:expanded?14:0,opacity:expanded?1:0}} transition={{duration:reduce?0:.25,ease:EASE}} aria-hidden={!expanded}>{d.num}</motion.span>
              </button>
            })}
          </div>}
          {key === 'form' && form && <span className="w3-overview-metrics">
            {([{ key: 'ctl', label: 'Fitness', color: T.cool }, { key: 'atl', label: 'Ermüdung', color: T.orbit }, { key: 'tsb', label: 'Form', color: T.acid }] as const).map(m => <span key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: T.mid }}>{m.label}</span>
              <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5, color: m.color }}>{m.key === 'tsb' && form.tsb > 0 ? '+' : ''}{num(form[m.key])}</span>
              <FormSpark points={(data.history ?? []).slice(-7)} metric={m.key} color={m.color} />
            </span>)}
          </span>}
          {key === 'crew' && data.crew && <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <span style={{ display: 'flex', paddingLeft: 8 }} aria-hidden>{data.crew.avatars.slice(0, 3).map(a => <span key={a.handle} style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: '50%', background: T.tile, border: `2px solid ${T.heroDock}`, marginLeft: -8, fontSize: 10, color: T.mid }}>
              {a.image ? <img alt="" src={a.image} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : a.handle.replace('@', '').slice(0, 1).toUpperCase()}
            </span>)}</span>
            {data.crew.rank != null && <span style={{ fontSize: 22, fontWeight: 700 }}>#{data.crew.rank}<span style={{ fontSize: 10, color: T.mid }}> / {data.crew.count}</span></span>}
          </span>}
          {key === 'rides' && ridesSummary}
          {key === 'progress' && (progressSummary??<span style={{fontSize:14,color:T.ink}}>FTP {data.ftp==null?'—':num(data.ftp)} W · VO₂max · Rekorde</span>)}
      </div>
      </motion.div>
      <div id={`${uid}-${key}`} role="region" aria-labelledby={`${uid}-${key}-title`} aria-hidden={open !== key} inert={open !== key}>
        <AnimatePresence initial={false}>
          {open === key && <motion.div key={key} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: { duration: reduce ? 0 : 0.32, ease: EASE }, opacity: { duration: reduce ? 0 : 0.18 } }} style={{ overflow: 'hidden' }}>
            <div className="w3-overview-detail">{details[key]}</div>
          </motion.div>}
        </AnimatePresence>
      </div>
      </>}
    </section>
    {key === 'today' && weather}
    {key === 'today' && <section data-today-card="plan" className="w3-overview-card" aria-label="Planphase">
      <div className="w3-overview-header">
        <h2 className="w3-overview-title">{vm.hasPlan ? 'Planphase' : 'Dein Plan'}</h2>
        <button type="button" className="w3-overview-toggle" aria-expanded={vm.hasPlan?planOpen:undefined} aria-label={vm.hasPlan ? (planOpen?'Planphase schließen':'Planphase öffnen') : 'Plan setzen'} onClick={() => vm.hasPlan ? setPlanOpen(!planOpen) : onPickGoal?.(null)}><motion.span animate={{rotate:planOpen?90:0}} transition={{duration:reduce?0:.25}} style={{display:'flex'}}><ArrowUpRight size={16} aria-hidden /></motion.span></button>
      </div>
      <div className="w3-overview-plan">
        {vm.hasPlan ? <>
          <W3PlanPhaseProgress schedule={vm.planPhaseSchedule} index={vm.planWeekIndex} fallback={vm.planPhase} />
          <motion.div initial={false} animate={{height:planOpen?'auto':0,opacity:planOpen?1:0}} transition={{duration:reduce?0:.32,ease:EASE}} style={{overflow:'hidden'}} inert={!planOpen} aria-hidden={!planOpen}>
            {planOpen && vm.planPhaseSchedule?.length && vm.planWeekIndex!=null && vm.planWeekIndex>=0 && vm.planWeekIndex<vm.planPhaseSchedule.length ? <W3PlanPhaseRoad schedule={vm.planPhaseSchedule} index={vm.planWeekIndex} onOpenPlan={onOpenPlan}/> : null}
          </motion.div>
        </> : <>
          <div className="w3-overview-plan-empty"><span className="w3-overview-plan-label">NOCH KEIN PLAN</span><strong>Worauf fährst du hin?</strong><span>Wähle ein Ziel — der Coach baut deine erste Woche.</span></div>
          <div className="w3-overview-plan-choices">
            <button type="button" onClick={() => onPickGoal?.('ftp')}>FTP steigern</button>
            <button type="button" onClick={() => onPickGoal?.('event')}>Event</button>
            <button type="button" onClick={() => onPickGoal?.(null)}>Eigenes Ziel <ArrowUpRight size={13} aria-hidden /></button>
          </div>
        </>}
      </div>
    </section>}
    </Fragment>)}
  </div>
}

export default function W3TodayOverview(props: { vm: W3Vm } & Sections) {
  const { entries } = useW3FormData()
  const crew = useMyCrew()
  const { data: standings } = useCrewStandings('week')
  const { data: profile } = useAthleteProfile()
  const rows = [...(standings?.standings ?? [])].sort((a, b) => b.weekly_score - a.weekly_score)
  const me = rows.find(r => r.is_you)
  const data: OverviewData = {
    form: entries.filter(validFormPoint).at(-1) ?? null,
    history: entries.filter(validFormPoint).slice(-7),
    crewState: crew.isPending ? 'loading' : crew.isError ? 'error' : 'ready',
    crew: crew.data?.crew ? {
      name: crew.data.crew.name,
      rank: me ? rows.filter(r => r.weekly_score > me.weekly_score).length + 1 : null,
      count: rows.length,
      avatars: rows.map(r => ({ handle: r.handle, image: r.avatar ?? null })),
    } : null,
    ftp: profile?.ftp_watts ?? null,
    ftpGoal: profile?.goals?.target_ftp ?? null,
  }
  return <W3TodayOverviewView {...props} data={data} progressSummary={<W3ProgressCompact fallbackFtp={data.ftp}/>} />
}
