import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, ChevronDown, Pencil, UserRound, Watch, Users, UserPlus } from 'lucide-react'
import { COACH_VOICES, coachVoiceById } from './w3coachVoices'
import type { W3RiderHighlightsProps } from './W3RiderHighlights'
import { W3FormCurve, type W3SeasonStat } from './W3ProfileBlocks'
import type { RhythmBucket } from '../../api/rhythm'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import W3TabBar from './W3TabBar'
import { T, FONT } from './w3tokens'
import './w3.css'
import './w3profile.css'
import './w3BikerFocus.css'
import W3FocusCurve from './W3FocusCurve'
import W3ReturnInsight from './W3ReturnInsight'

export interface W3Device { name: string; sub: string; icon: 'watch' | 'activity' | 'zap' | 'heart'; on: boolean }
export interface W3BikerVm {
  rider: Omit<W3RiderHighlightsProps, 'onAllBadges' | 'onRecord'>
  coin: { balance: string; note: string } | null
  referral: { code: string; note: string } | null
  devices: W3Device[]
}
export interface W3ProfileExtras {
  season: W3SeasonStat[]
  curve: { value: number; delta: number | null; series: number[]; months: string[] } | null
  bike: { name: string; imageUrl: string | null; weightKg: number | null; km: number | null; count: number | null } | null
  onGarage?: () => void
}
type DataState = 'loading' | 'error' | 'ready'
export interface W3BikerViewProps extends Partial<W3ProfileExtras> {
  vm: W3BikerVm
  insights?: ReactNode
  seasonLabel?: string
  seasonBuckets?: RhythmBucket[]
  seasonState?: DataState
  garageState?: DataState
  recordsState?: DataState
  onRetry?: () => void
  onReferral?: () => void
  onCrew?: () => void
  voice?: { value: string; busy: boolean; error?: string | null; onSet: (id: string) => void }
  onBadges?: () => void
  onRecord?: (key: string) => void
  onCreateRider?: () => void
  onEdit?: () => void
  onSettings?: () => void
  onDevice?: (name: string) => void
  onPower?: () => void
  onRides?: () => void
}
const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

function Disclosure({ title, note, children, card = false }: { title: string; note?: string; children: ReactNode; card?: boolean }) {
  const [open, setOpen] = useState(false)
  return <section className={`profile-disclosure ${card ? 'profile-card' : ''}`}>
    <button className="profile-disclosure-trigger" aria-label={[title, note].filter(Boolean).join(' ')} aria-expanded={open} onClick={() => setOpen(!open)}>
      <span><strong>{title}</strong>{note && !open && <small>{note}</small>}</span><span className={card ? 'profile-circle' : 'profile-disclosure-chevron'}><ChevronDown size={19} style={{ transform: open ? 'rotate(180deg)' : undefined }} /></span>
    </button>
    {open && <div className="profile-disclosure-body">{children}</div>}
  </section>
}
function Action({ children, onClick, icon }: { children: ReactNode; onClick?: () => void; icon?: ReactNode }) {
  return <button type="button" className="profile-action" onClick={onClick}>{icon}<span>{children}</span><ArrowUpRight size={18} /></button>
}

/** The production profile and local review use this same view. Sources and writes
 * stay in W3BikerPage. No public profile, auto-sharing or synthetic fallback. */
export default function W3BikerView({ vm, season = [], curve = null, bike = null,
  seasonLabel = `Saison ${new Date().getFullYear()}`, seasonBuckets = [],
  seasonState = 'ready', garageState = 'ready', recordsState = 'ready',
  onGarage, onCrew, onReferral, voice, onRecord, onCreateRider, insights,
  onEdit, onSettings, onDevice, onPower, onRides, onRetry,
}: W3BikerViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const km = season.find(s => s.label === 'Kilometer')
  const ftp = season.find(s => s.label === 'FTP')
  const totals = season.filter(s => s.label !== 'FTP' && s.label !== 'Kilometer')
  const lead = vm.rider.records[0]
  const name = vm.rider.handle
  const selected = selectedMonth == null ? null : seasonBuckets[selectedMonth]
  let cumulative=0
  const kmCurve=seasonBuckets.map(b=>cumulative+=b.km)
  const hasRides = seasonBuckets.some(b => b.rides > 0) || (km != null && km.value !== '0')
  const style = {
    '--profile-bg': T.bg, '--profile-surface': T.surface, '--profile-surface2': T.surface2,
    '--profile-ink': T.ink, '--profile-mid': T.mid, '--profile-line': T.rule,
    '--profile-acid': T.acid, '--profile-acid-dim': T.acidDim,
    '--profile-error': T.bad, '--focus-muted': T.mid, fontFamily: FONT, background: T.bg,
  } as CSSProperties
  return <div className="w3-root"><div className="w3-frame w3-profile focus-biker" style={style}>
    <W3StatusBar /><W3TopBar title="Biker" />
    <main>
      <div className="profile-editorial-hero"><section className={`profile-identity ${!vm.rider.avatarUrl ? 'profile-identity-empty' : ''}`} aria-label="Dein Profil">
        <div className="profile-name">
          <h1>{name || 'Dein Profil'}</h1>
          {vm.rider.role && <p>{vm.rider.role}</p>}
          {onEdit && <button className="profile-edit" onClick={onEdit}><Pencil size={14} />Profil bearbeiten</button>}
        </div>
        {garageState === 'ready' ? <button className="profile-portrait" aria-label={vm.rider.avatarUrl ? 'Rider im Studio ändern' : 'Rider erstellen'} onClick={onCreateRider}>
          {vm.rider.avatarUrl ? <img src={vm.rider.avatarUrl} alt="Dein Rider" /> : <><UserRound size={35} /><span>Rider erstellen</span></>}
        </button> : <span className="profile-avatar-state" role="status">{garageState === 'loading' ? 'Rider lädt …' : <>Rider nicht geladen{onRetry && <button className="profile-inline" onClick={onRetry}>Erneut laden</button>}</>}</span>}
      </section>

      {bike?.imageUrl&&<button className="profile-hero-bike" onClick={onGarage} aria-label="Dein Rad in der Garage öffnen"><img src={bike.imageUrl} alt={bike.name}/></button>}
      </div>
      <section className="profile-season" aria-label={seasonLabel}>
        <header><h2>{seasonLabel}</h2>{onRides && <button className="profile-circle" aria-label="Deine Fahrten ansehen" onClick={onRides}><ArrowUpRight size={20} /></button>}</header>
        {seasonState === 'loading' && <p role="status">Deine Saison wird geladen …</p>}
        {seasonState === 'error' && <div role="status"><p>Deine Saison konnte nicht geladen werden.</p><button className="profile-inline" onClick={onRetry}>Erneut versuchen</button></div>}
        {seasonState === 'ready' && km && <>
          <div className="profile-season-main"><strong>{selected ? nf.format(Math.round(kmCurve[selectedMonth!])) : km.value}</strong><span>km</span></div>
          <div className="profile-season-context">{selected ? new Date(`${selected.start}T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) + ' · kumuliert' : km.note ?? 'seit Januar'}{selected && <button onClick={() => setSelectedMonth(null)}>Gesamte Saison</button>}</div>
          {seasonBuckets.length > 1 && <W3FocusCurve values={kmCurve} labels={seasonBuckets.map(b=>new Date(b.start+'T12:00:00').toLocaleDateString('de-DE',{month:'short'}))} selected={selectedMonth} onSelect={setSelectedMonth}/>}
          <div className="profile-season-facts">{selected ? <><span><b>{nf.format(selected.rides)}</b> Fahrten</span><span><b>{nf.format(selected.elevation_m)}</b> Höhenmeter</span></> : totals.map(s => <span key={s.label}><b>{s.value}</b> {s.label}</span>)}</div>
          {!hasRides && <p>Deine nächste Fahrt macht den Anfang.</p>}
        </>}
        {seasonState === 'ready' && !km && <p>Noch keine Saison verfügbar.</p>}
      </section>

      {curve && curve.delta != null && <W3ReturnInsight eyebrow="Dein Signal" title={`Deine Form bewegt sich ${curve.delta >= 0 ? 'nach oben' : 'nach unten'}.`} detail="Der Verlauf bleibt auf deiner Profilseite sichtbar und wird mit jeder synchronisierten Fahrt aktualisiert." metrics={[{ label: 'Aktuell', value: String(curve.value), tone: 'accent' }, { label: 'Veränderung', value: `${curve.delta >= 0 ? '+' : ''}${curve.delta}` , tone: curve.delta >= 0 ? 'positive' : 'quiet' }, ...(ftp ? [{ label: 'FTP', value: `${ftp.value} W` }] : [])]} />}

      {recordsState === 'error' && <p className="profile-state" role="status">Bestleistungen konnten nicht geladen werden. <button className="profile-inline" onClick={onRetry}>Erneut versuchen</button></p>}
      {lead && <section className="profile-memory profile-card" aria-label="Deine Bestleistungen">
        <div className="profile-section-heading"><h2>Persönlicher Rekord</h2>{lead.activityId != null && onRecord && <button className="profile-circle" aria-label="Rekordfahrt ansehen" onClick={() => onRecord(lead.key)}><ArrowUpRight size={20} /></button>}</div>
        <div className="profile-record-label">{lead.label.toLocaleLowerCase('de-DE')}</div>
        <div className="profile-record-value"><strong>{lead.value}</strong><span>{lead.unit}</span></div>
        {(lead.ride || lead.when) && <p className="profile-record-caption">{lead.ride}{lead.ride && lead.when ? ' · ' : ''}{lead.when}</p>}
        {vm.rider.records.length > 1 && <Disclosure title="Alle Bestleistungen" note={`${vm.rider.records.length} persönliche Rekorde`}>
          {vm.rider.records.map(r => <div className="profile-record-row" key={r.key}><div><strong>{r.label.toLocaleLowerCase('de-DE')}</strong><small>{r.ride}{r.ride && r.when ? ' · ' : ''}{r.when}</small></div><span>{r.value} {r.unit}</span>{r.activityId != null && onRecord && <button className="profile-circle" aria-label={`${r.label}: Fahrt ansehen`} onClick={() => onRecord(r.key)}><ArrowUpRight size={17} /></button>}</div>)}
        </Disclosure>}
      </section>}

      {insights}
      <div className="profile-details">{onPower&&<Action onClick={onPower}>Leistungsprofil & Zonen</Action>}{curve&&<Disclosure card title="Deine Form" note={ftp?`FTP ${ftp.value} W`:undefined}><W3FormCurve {...curve} embedded/></Disclosure>}</div>
      <section className="profile-device-card profile-card">
        <div className="profile-section-heading"><h2>Deine Geräte</h2>{onSettings && <button className="profile-circle" aria-label="Geräte verwalten" onClick={onSettings}><ArrowUpRight size={20} /></button>}</div>
        {vm.devices.map(d => <button className="profile-device" aria-label={`${d.name} ${d.sub}`} key={d.name} onClick={() => onDevice?.(d.name)}><Watch size={19} /><span><strong>{d.name}</strong><small>{d.sub}</small></span><ArrowUpRight size={18} /></button>)}
      </section>
      {(onCrew || (vm.referral && onReferral)) && <section className="profile-social profile-card">
        <div className="profile-section-heading"><h2>Gemeinsam fahren</h2></div>
        {onCrew && <Action onClick={onCrew} icon={<Users size={20} />}>Deine Crew</Action>}
        {vm.referral && onReferral && <Action onClick={onReferral} icon={<UserPlus size={20} />}>Freunde einladen</Action>}
      </section>}
      <section className="profile-account profile-card">
        <div className="profile-section-heading"><h2>Einstellungen</h2>{onSettings && <button className="profile-circle" aria-label="Alle Einstellungen öffnen" onClick={onSettings}><ArrowUpRight size={20} /></button>}</div>
        {voice && <Disclosure title="Coach-Stimme" note={coachVoiceById(voice.value).label}>
          <div className="profile-voices">{COACH_VOICES.map(v => <button key={v.id} disabled={voice.busy} aria-pressed={voice.value === v.id} onClick={() => voice.value !== v.id && voice.onSet(v.id)}>{v.label}</button>)}</div>
          <p>{coachVoiceById(voice.value).note}</p>{voice.busy && <p role="status">Wird gespeichert …</p>}{voice.error && <p className="profile-error" role="alert">{voice.error}</p>}
        </Disclosure>}
        {onSettings && <Action onClick={onSettings}>Konto & Datenschutz</Action>}
      </section>

    </main>
    <W3TabBar />
  </div></div>
}
