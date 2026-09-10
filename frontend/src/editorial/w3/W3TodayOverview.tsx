import { useId, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useW3FormData } from './useW3FormData'
import { validFormPoint, type FormPoint } from './w3TrainingImpact'
import { T, FONT, EASE } from './w3tokens'
import type { W3Vm } from './W3TodayView'

type Section = 'today' | 'week' | 'form' | 'crew' | 'goals'
interface Sections { today?: ReactNode; week: ReactNode; form: ReactNode; crew: ReactNode; goals: ReactNode }
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

export function W3TodayOverviewView({ vm, data, ...details }: { vm: W3Vm; data: OverviewData } & Sections) {
  const [open, setOpen] = useState<Section | null>(null)
  const uid = useId()
  const reduce = useReducedMotion()
  const today = vm.weekDays.find(day => day.status === 'today')
  const blocks = today?.rest ? [] : (today?.blocks?.length ? today.blocks : vm.sessionBlocks ?? [])
  const weekMax = Math.max(1, ...vm.weekDays.map(d => Math.max(d.actual || 0, d.planned ?? 0)))
  const form = data.form
  const pct = data.ftp != null && data.ftpGoal != null && data.ftpGoal > 0 ? Math.min(100, data.ftp / data.ftpGoal * 100) : null
  const titles: Record<Section, string> = { today: 'Heute', week: 'Deine Woche', form: 'Deine Form', crew: 'Crew', goals: 'Fortschritt & Ziele' }
  const subtitle: Record<Section, string> = {
    today: today?.rest ? 'Ruhetag' : [today?.title ?? 'Noch kein Training geplant', today?.title ? vm.sessionDur : null].filter(Boolean).join(' · '),
    week: vm.hasPlan ? (vm.weekLoadLabel || vm.weekBlockLabel || 'Dein Wochenplan') : 'Dein Training planen',
    form: form == null ? 'Noch kein Verlauf' : form.tsb >= 0 ? 'Wenig Ermüdung' : 'Belastung im Körper',
    crew: data.crewState === 'loading' ? 'Crew wird geladen' : data.crewState === 'error' ? 'Crew nicht verfügbar' : data.crew?.name ?? 'Gemeinsam fahren',
    goals: data.ftp == null ? (vm.weekGoal?.name ?? 'Dein nächstes Ziel') : data.ftpGoal != null ? `FTP ${num(data.ftp)} von ${num(data.ftpGoal)} W` : `FTP ${num(data.ftp)} W`,
  }
  return <div className="w3-today-overview" style={{ fontFamily: FONT }}>
    {(['today', 'week', 'form', 'crew', 'goals'] as const).map(key => <section key={key} data-today-card={key} className="w3-overview-card" data-open={open === key}>
      <div className="w3-overview-header">
        <h2 id={`${uid}-${key}-title`} className="w3-overview-title">{titles[key]}</h2>
        <motion.button id={`${uid}-${key}-toggle`} className="w3-overview-toggle" type="button" aria-label={`${titles[key]} ${open === key ? 'schließen' : 'öffnen'}`} aria-expanded={open === key} aria-controls={`${uid}-${key}`} onClick={() => setOpen(open === key ? null : key)} whileTap={reduce ? undefined : {scale:0.93}}>
          {open === key ? <ArrowLeft size={16} aria-hidden /> : <ArrowUpRight size={16} aria-hidden />}
        </motion.button>
      </div>
      <motion.div initial={false} animate={{height:open === key ? 0 : 'auto',opacity:open === key ? 0 : 1}} transition={{duration:reduce ? 0 : 0.26,ease:EASE}} aria-hidden={open === key} style={{overflow:'hidden'}}>
      <div className="w3-overview-summary">
          <span className="w3-overview-copy">{subtitle[key]}</span>
          {key === 'today' && <span className="w3-overview-workout" role="img" aria-label={today?.rest ? 'Ruhetag, keine Trainingsbelastung geplant' : blocks.length ? `Trainingsprofil: ${blocks.map(b => b.label).join(', ')}` : 'Kein Trainingsprofil verfügbar'}>
            {blocks.length ? blocks.map((b, i) => <span key={i} style={{ flex: 1, minWidth: 0, height: `${Math.max(4, Math.min(100, b.w * 100))}%`, borderRadius: '2px 2px 0 0', background: b.work ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : T.heroOff }} />) : <span style={{ width: '100%', height: 2, background: T.rule }} />}
          </span>}
          {key === 'week' && <span aria-label={vm.weekLoadLabel} className="w3-overview-week" role="img">
            {vm.weekDays.map((d, i) => <span key={i} className="w3-overview-day" data-current={d.status === 'today'} title={`${d.dateLabel}: ${d.title ?? 'Kein Training geplant'} · ${d.actual} TSS gefahren${d.planned != null ? ` / ${d.planned} TSS geplant` : ''}`}>
              <span className="w3-overview-day-track">
                <span className="w3-overview-day-plan" style={{height:Math.max(3, Math.min(34, (d.planned ?? 0) / weekMax * 34))}} />
                {d.actual > 0 && <span className="w3-overview-day-done" style={{height:Math.min(34, d.actual / weekMax * 34)}} />}
              </span>
              <span>{d.letter}</span>
            </span>)}
          </span>}
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
          {key === 'goals' && pct != null && <span className="w3-overview-goal">
            <span className="w3-overview-goal-track"><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: T.acid, borderRadius: 3 }} /></span>
            <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}%</span>
          </span>}
      </div>
      </motion.div>
      <div id={`${uid}-${key}`} role="region" aria-labelledby={`${uid}-${key}-title`} aria-hidden={open !== key} inert={open !== key}>
        <AnimatePresence initial={false}>
          {open === key && <motion.div key={key} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: { duration: reduce ? 0 : 0.32, ease: EASE }, opacity: { duration: reduce ? 0 : 0.18 } }} style={{ overflow: 'hidden' }}>
            <div className="w3-overview-detail">{details[key]}</div>
          </motion.div>}
        </AnimatePresence>
      </div>
    </section>)}
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
  return <W3TodayOverviewView {...props} data={data} />
}
