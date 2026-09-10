import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ArrowUpRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMyCrew, useCrewStandings } from '../../hooks/useCrew'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useW3FormData } from './useW3FormData'
import { validFormPoint, type FormPoint } from './w3TrainingImpact'
import { T, FONT, EASE } from './w3tokens'
import { lux } from './w3surfaces'
import type { W3Vm } from './W3TodayView'

type Section = 'week' | 'form' | 'crew' | 'goals'
interface Sections { week: ReactNode; form: ReactNode; crew: ReactNode; goals: ReactNode }
export interface OverviewData {
  form: FormPoint | null
  crew: { name: string; rank: number | null; count: number; avatars: { handle: string; image: string | null }[] } | null
  crewState: 'ready' | 'loading' | 'error'
  ftp: number | null
  ftpGoal: number | null
}
const num = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)

export function W3TodayOverviewView({ vm, data, ...details }: { vm: W3Vm; data: OverviewData } & Sections) {
  const [open, setOpen] = useState<Section | null>(null)
  const uid = useId()
  const reduce = useReducedMotion()
  const form = data.form
  const pct = data.ftp != null && data.ftpGoal != null && data.ftpGoal > 0 ? Math.min(100, data.ftp / data.ftpGoal * 100) : null
  const titles: Record<Section, string> = { week: 'Deine Woche', form: 'Deine Form', crew: 'Crew', goals: 'Fortschritt & Ziele' }
  const subtitle: Record<Section, string> = {
    week: vm.hasPlan ? (vm.weekLoadLabel || vm.weekBlockLabel || 'Dein Wochenplan') : 'Dein Training planen',
    form: form == null ? 'Noch kein Verlauf' : form.tsb >= 0 ? 'Wenig Ermüdung' : 'Belastung im Körper',
    crew: data.crewState === 'loading' ? 'Crew wird geladen' : data.crewState === 'error' ? 'Crew nicht verfügbar' : data.crew?.name ?? 'Gemeinsam fahren',
    goals: data.ftp == null ? (vm.weekGoal?.name ?? 'Dein nächstes Ziel') : data.ftpGoal != null ? `FTP ${num(data.ftp)} von ${num(data.ftpGoal)} W` : `FTP ${num(data.ftp)} W`,
  }
  return <div className="w3-today-overview" style={{ fontFamily: FONT }}>
    {(['week', 'form', 'crew', 'goals'] as const).map(key => <section key={key} data-today-card={key} style={{ ...lux(24), overflow: 'hidden' }}>
      <h2 style={{ margin: 0, font: 'inherit' }}>
        <button id={`${uid}-${key}-toggle`} className="w3-overview-toggle" type="button" aria-expanded={open === key} aria-controls={`${uid}-${key}`} onClick={() => setOpen(open === key ? null : key)} style={{ color: T.ink }}>
          <span className="w3-overview-copy">
            <span style={{ fontSize: 14, fontWeight: 650, letterSpacing: -0.3 }}>{titles[key]}</span>
            {open !== key && <span style={{ fontSize: 11, color: T.mid, lineHeight: 1.35 }}>{subtitle[key]}</span>}
          </span>
          {key === 'week' && <span aria-label={vm.weekLoadLabel} className="w3-overview-week">
            {vm.weekDays.map((d, i) => <span key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'flex', alignItems: 'flex-end', height: 18 }}><span style={{ width: 7, height: Math.max(3, Math.min(18, (d.planned ?? d.actual) / 100 * 18)), borderRadius: 2, background: d.status === 'today' || d.actual > 0 ? T.acid : T.rule }} /></span>
              <span style={{ fontSize: 9, color: d.status === 'today' ? T.acid : T.mid }}>{d.letter}</span>
            </span>)}
          </span>}
          {key === 'form' && open !== key && form && <span className="w3-overview-metrics">
            {([{ key: 'ctl', label: 'Fitness', color: T.cool }, { key: 'atl', label: 'Ermüdung', color: T.orbit }, { key: 'tsb', label: 'Form', color: T.acid }] as const).map(m => <span key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 9, color: T.mid }}>{m.label}</span>
              <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5, color: m.color }}>{m.key === 'tsb' && form.tsb > 0 ? '+' : ''}{num(form[m.key])}</span>
            </span>)}
          </span>}
          {key === 'crew' && data.crew && <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <span style={{ display: 'flex', paddingLeft: 8 }} aria-hidden>{data.crew.avatars.slice(0, 3).map(a => <span key={a.handle} style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: '50%', background: T.tile, border: `2px solid ${T.heroDock}`, marginLeft: -8, fontSize: 10, color: T.mid }}>
              {a.image ? <img alt="" src={a.image} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : a.handle.replace('@', '').slice(0, 1).toUpperCase()}
            </span>)}</span>
            {data.crew.rank != null && <span style={{ fontSize: 17, fontWeight: 600 }}>#{data.crew.rank}<span style={{ fontSize: 10, color: T.mid }}> / {data.crew.count}</span></span>}
          </span>}
          {key === 'goals' && pct != null && <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <span style={{ width: 54, height: 5, borderRadius: 3, background: T.rule, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: T.acid, borderRadius: 3 }} /></span>
            <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}%</span>
          </span>}
          <ChevronDown size={15} color={T.mid} aria-hidden style={{ flex: 'none', transform: open === key ? 'rotate(180deg)' : undefined, transition: reduce ? 'none' : 'transform 180ms' }} />
        </button>
      </h2>
      <div id={`${uid}-${key}`} role="region" aria-labelledby={`${uid}-${key}-toggle`} hidden={open !== key}>
        {open === key && <motion.div initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }} className="w3-overview-detail">
          {details[key]}
          <button type="button" className="w3-overview-close" onClick={() => { setOpen(null); document.getElementById(`${uid}-${key}-toggle`)?.focus() }} style={{ color: T.mid }}><ArrowUpRight size={13} aria-hidden />Details schließen</button>
        </motion.div>}
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
