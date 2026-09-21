import { useId, useState, type CSSProperties } from 'react'
import { ArrowUpRight, ArrowRight, ChevronDown, Check } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { TrainingReview } from '../../api/trainingReview'
import { T, FONT } from './w3tokens'
import { smoothCurve } from './w3SmoothCurve'
import './w3trainingReview.css'

const fmt = (n: number | null, unit = '') => n == null ? '—' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`
const signed = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const impactMetrics = [{ key: 'fitness', label: 'Fitness' }, { key: 'fatigue', label: 'Ermüdung' }, { key: 'form', label: 'Form' }] as const

type ReviewBlock = { w: number; work: boolean; label: string; start: number; duration: number; value: number }

/** The width represents elapsed time, including unmeasured gaps. Means are
 * weighted by sample duration; exact recorded samples remain on the scrubber. */
export function reviewBlocks(trace: TrainingReview['trace'], field: 'actual_pct' | 'planned_pct', endMinutes: number): ReviewBlock[] {
  const limits = [55, 75, 90, 105, 120, 150]
  const groups: { zone: number; weighted: number; duration: number; start: number; end: number }[] = []
  for (let i = 0; i < trace.length; i++) {
    const point = trace[i], value = point[field]
    if (value == null) continue
    const end = trace[i + 1]?.at_s ?? Math.max(point.at_s, endMinutes * 60)
    const duration = Math.max(0, end - point.at_s)
    if (!duration) continue
    const found = limits.findIndex(limit => value <= limit)
    const zone = found < 0 ? 6 : found
    const previous = groups.at(-1)
    if (previous && previous.zone === zone && previous.end === point.at_s) {
      previous.weighted += value * duration
      previous.duration += duration
      previous.end = end
    } else groups.push({ zone, weighted: value * duration, duration, start: point.at_s, end })
  }
  return groups.map(group => {
    const value = group.weighted / group.duration
    return { w: Math.min(1, value / 125), work: group.zone >= 2, start: group.start, duration: group.duration, value,
      label: `${clock(group.start)}–${clock(group.end)} · Ø ${fmt(value)} % FTP` }
  })
}

function hasSavedPlan(review: TrainingReview) {
  return Boolean(review.planned_title?.trim()) && (review.score != null || review.pairs.some(pair => pair.planned != null)
    || review.trace.some(point => point.planned_pct != null) || review.zones.some(zone => zone.planned_seconds != null))
}

function isHistorical(rideDate?: string | null) {
  if (!rideDate) return false
  const ride = new Date(rideDate)
  if (Number.isNaN(ride.getTime())) return false
  const today = new Date()
  return new Date(ride.getFullYear(), ride.getMonth(), ride.getDate()).getTime()
    < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
}

function ReviewBenefit({ review, planned }: { review: TrainingReview; planned: boolean }) {
  const dominant = review.zones.filter(zone => (zone.actual_seconds ?? 0) > 0)
    .reduce<TrainingReview['zones'][number] | null>((best, zone) => !best || zone.actual_seconds! > best.actual_seconds! ? zone : best, null)
  const title = dominant ? `Schwerpunkt ${dominant.label}.`
    : planned && review.score != null ? review.score >= 80 ? 'Zur Empfehlung passend.' : 'Anders als empfohlen.' : 'Deine Fahrt im Rückblick.'
  return <header className="w3-review-benefit">
    <span className="w3-review-eyebrow">Trainingsrückblick</span>
    <h2>{title}</h2>
    {dominant && <p className="w3-review-benefit-dose"><strong>{fmt(dominant.actual_seconds! / 60)} min</strong><span>im längsten gefahrenen Leistungsbereich</span></p>}
  </header>
}

function ReviewProfile({ review, planned }: { review: TrainingReview; planned: boolean }) {
  const [mode, setMode] = useState<'trace' | 'zones'>(review.trace.length ? 'trace' : 'zones')
  const [recording, setRecording] = useState<'actual_pct' | 'planned_pct'>('actual_pct')
  const [slice, setSlice] = useState<number | null>(null)
  const [zone, setZone] = useState<number | null>(null)
  const canCompareTrace = planned && review.trace.some(point => point.planned_pct != null)
  const field = canCompareTrace ? recording : 'actual_pct'
  const duration = review.pairs.find(pair => pair.label === 'Dauer')
  const endMinutes = (field === 'planned_pct' ? duration?.planned : duration?.actual) ?? (review.trace.at(-1)?.at_s ?? 0) / 60
  const seconds = Math.max(1, endMinutes * 60, review.trace.at(-1)?.at_s ?? 0)
  const selected = slice == null ? null : review.trace[Math.min(slice, review.trace.length - 1)]
  const visibleZones = review.zones.filter(item => (item.actual_seconds ?? 0) > 0 || (planned && (item.planned_seconds ?? 0) > 0))
  const largest = Math.max(60, ...visibleZones.flatMap(item => [item.actual_seconds ?? 0, planned ? item.planned_seconds ?? 0 : 0]))
  const selectedZone = zone == null ? null : visibleZones[zone]
  const blocks = reviewBlocks(review.trace, field, endMinutes)
  const ceiling = Math.max(125, ...blocks.map(block => block.value))
  if (!review.trace.length && !visibleZones.length) return null

  return <div className="w3-review-chart-panel">
    <div className="w3-review-chart-tabs" role="group" aria-label="Trainingsgrafik">
      {([['trace', 'Verlauf'], ['zones', 'Leistungsbereiche']] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}
    </div>
    {mode === 'trace' ? <>
      {canCompareTrace && <div className="w3-review-recordings" role="group" aria-label="Leistungsprofil wählen">
        {([['actual_pct', 'Gefahren'], ['planned_pct', 'Empfohlen']] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={field === key} onClick={() => setRecording(key)}>{label}</button>)}
      </div>}
      <div className="w3-review-chart-reading"><strong>{selected ? clock(selected.at_s) : 'Leistung über die Zeit'}</strong><span>{selected ? `${fmt(selected[field])} % FTP` : '% FTP'}</span></div>
      {review.trace.length ? <>
        <div className="w3-review-time-chart" role="img" aria-label={`${field === 'actual_pct' ? 'Gefahrene' : 'Empfohlene'} Leistung über die Zeit; Balkenbreite entspricht der Dauer, Höhe der Leistung relativ zur FTP`}>
          <div className="w3-review-ftp-line" style={{ bottom: `${100 / ceiling * 100}%` }}><span>100 % FTP</span></div>
          {blocks.map(block => <div key={block.start} className="w3-review-time-block" title={block.label} style={{ left: `${block.start / seconds * 100}%`, width: `${block.duration / seconds * 100}%`, height: `${Math.max(1.5, block.value / ceiling * 100)}%`, background: block.work ? T.acid : T.mid }} />)}
          {selected && <i className="w3-review-time-cursor" style={{ left: `${Math.min(100, selected.at_s / seconds * 100)}%` }} />}
        </div>
        <div className="w3-review-axis"><span>0 min</span><span>{fmt(seconds / 60, 'min')}</span></div>
        <input className="w3-review-trace-scrubber" type="range" min="0" max={review.trace.length - 1} value={slice ?? 0} aria-label="Abschnitt der Fahrt auswählen"
          aria-valuetext={selected ? `${clock(selected.at_s)}, gefahren ${fmt(selected.actual_pct)} Prozent FTP${canCompareTrace ? `, empfohlen ${fmt(selected.planned_pct)} Prozent FTP` : ''}` : 'Start der Fahrt'}
          onChange={event => setSlice(Number(event.target.value))} />
      </> : <p className="w3-review-muted">Kein ausreichend vollständiger Leistungsverlauf.</p>}
    </> : <>
      <div className="w3-review-chart-reading"><strong>{selectedZone?.label ?? 'Zeit im Leistungsbereich'}</strong><span>Minuten</span></div>
      <div className="w3-review-zone-bars">{visibleZones.map((item, index) => <button key={item.label} type="button" aria-pressed={zone === index}
        aria-label={`${item.label}: ${fmt(item.actual_seconds == null ? null : item.actual_seconds / 60, 'min')} gefahren${planned && item.planned_seconds != null ? `, ${fmt(item.planned_seconds / 60, 'min')} empfohlen` : ''}`}
        onClick={() => setZone(zone === index ? null : index)}>
        <span>{item.label}</span><span className="w3-review-zone-track"><i style={{ width: `${(item.actual_seconds ?? 0) / largest * 100}%` }} />{planned && item.planned_seconds != null && <b style={{ left: `${Math.min(99, item.planned_seconds / largest * 100)}%` }} />}</span>
        <strong>{fmt(item.actual_seconds == null ? null : item.actual_seconds / 60)}{planned && item.planned_seconds != null && <small> / {fmt(item.planned_seconds / 60)}</small>}</strong>
      </button>)}</div>
      <p className="w3-review-zone-note">{selectedZone ? `${fmt(selectedZone.actual_seconds == null ? null : selectedZone.actual_seconds / 60, 'min')} gefahren${planned && selectedZone.planned_seconds != null ? ` · ${fmt(selectedZone.planned_seconds / 60, 'min')} empfohlen` : ''}`
        : planned ? 'Balken: gefahren · Markierung: empfohlen' : 'Gemessene Zeit in jedem Leistungsbereich'}</p>
    </>}
  </div>
}

export default function W3TrainingReview({ review: r, onOpenPlan, rideDate }: { review: TrainingReview; onOpenPlan?: () => void; rideDate?: string | null }) {
  const [day, setDay] = useState(0), [metric, setMetric] = useState<'fitness' | 'fatigue' | 'form'>('form')
  const reduce = useReducedMotion(), uid = useId()
  const historical = isHistorical(rideDate), planned = hasSavedPlan(r)
  const recommendationSaved = Boolean(r.planned_title?.trim())
  const point = r.impact[Math.min(day, r.impact.length - 1)]
  const scale = Math.max(1, ...r.impact.map(item => Math.abs(item[metric])))
  const x = (index: number) => 28 + index / Math.max(1, r.impact.length - 1) * 248
  const y = (value: number) => 65 - value / scale * 36
  const path = smoothCurve(r.impact.map((item,index)=>({x:x(index),y:y(item[metric])})))
  const hasDeviation = r.impact.some(item => Math.abs(item.fitness) > .01 || Math.abs(item.fatigue) > .01 || Math.abs(item.form) > .01)
  const adaptation = r.adaptation
  const pairs = r.pairs.filter(pair => pair.actual != null && (planned && pair.planned != null || pair.unit === 'TSS' || pair.label === 'Dauer'))
  const hasPlanOutcome = adaptation != null || r.changes.length > 0
  return <section className="w3-training-review" style={{ fontFamily: FONT, '--w3-surface': T.surface, '--w3-ink': T.ink, '--w3-mid': T.mid, '--w3-d2': T.d2, '--w3-acid': T.acid, '--w3-hero-ink': T.heroInk, '--w3-soft': T.surface2 } as CSSProperties} aria-label="Trainingsrückblick">
    <ReviewBenefit review={r} planned={planned} />
    {planned && r.score != null ? <div className="w3-review-assessment">
      <span>{historical ? 'Passung zur damaligen Empfehlung' : 'Passung zur Empfehlung'}</span>
      <strong role="img" aria-label={`${r.score} von 100 Planpassung`}>{r.score}<small> / 100</small></strong>
    </div> : <p className="w3-review-no-plan">{recommendationSaved ? 'Empfehlung gespeichert · Vergleich noch nicht gesichert' : 'Keine gespeicherte Empfehlung für diese Fahrt'}</p>}
    <ReviewProfile key={r.activity_id} review={r} planned={planned} />
    {pairs.length > 0 && <div className="w3-review-pairs">{pairs.map(pair => <div key={pair.label}>
      <span>{pair.label}</span><strong>{fmt(pair.actual)}<small>{pair.unit}</small></strong>
      {planned && pair.planned != null && <small>{fmt(pair.planned, pair.unit)} empfohlen</small>}
    </div>)}</div>}
    <div className="w3-review-next">
      <h3>{historical ? 'Planprüfung zu dieser Fahrt' : hasPlanOutcome ? 'Dein Plan nach der Fahrt' : 'Dein nächster Schritt'}</h3>
      {adaptation && <p className="w3-review-auto">{adaptation.automatic && <Check size={15} aria-hidden />}{adaptation.automatic ? historical ? 'In der damaligen Planung berücksichtigt' : 'Automatisch berücksichtigt' : adaptation.state === 'pending' ? 'Auswertung ausstehend' : 'Datengrundlage begrenzt'}</p>}
      {r.changes.map((change, index) => <div className="w3-review-change" key={`${change.date}-${index}`}>
        <div className="w3-review-change-date"><strong>{new Date(`${change.date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' })}</strong><span>{new Date(`${change.date}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span></div>
        <div className="w3-review-change-content"><div><span>{change.before}</span><ArrowRight size={15} aria-hidden /><strong>{change.after}</strong></div><details><summary>Warum? <ChevronDown size={14} /></summary><p>{change.reason}</p></details></div>
      </div>)}
      {!historical && <p>{adaptation?.automatic ? adaptation.reason : r.action}</p>}
      {!hasPlanOutcome && <p className="w3-review-muted">Keine dieser Fahrt zugeordnete Planänderung gespeichert.</p>}
      {onOpenPlan && <button type="button" className="w3-review-open" aria-label="Trainingsplan öffnen" onClick={onOpenPlan}>{historical ? 'Aktuellen Trainingsplan ansehen' : 'Trainingsplan ansehen'}<ArrowUpRight size={18} /></button>}
    </div>
    {planned && point && <details className="w3-review-impact"><summary>Modellierte Planabweichung <ChevronDown size={16} /></summary>
      {hasDeviation ? <>
        <div className="w3-review-heading"><span>Belastungsmodell</span><span>{day === 0 ? 'Nach der Fahrt' : `${day} ${day === 1 ? 'Tag' : 'Tage'} danach`}</span></div>
        <div className="w3-review-impact-values">{impactMetrics.map(item => <button key={item.key} type="button" aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}><span>{item.label}</span><strong>{signed(point[item.key])}</strong>{metric === item.key && <motion.i layoutId={`${uid}-metric`} transition={{ duration: reduce ? 0 : .2 }} />}</button>)}</div>
        <svg viewBox="0 0 310 124" role="img" aria-label={`Modellierte ${impactMetrics.find(item => item.key === metric)!.label}abweichung gegenüber der empfohlenen Einheit für ${r.impact.length} Tage`}
          onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); setDay(Math.round(Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * 310 - 28) / 248)) * (r.impact.length - 1))) }}>
          <line x1="28" x2="276" y1="65" y2="65" stroke={T.quiet} strokeDasharray="3 5" /><text x="276" y="59" fill={T.mid} textAnchor="end" fontSize="12">Plan · 0</text>
          <text x="28" y="19" fill={T.mid} fontSize="12">+{fmt(scale)}</text><text x="28" y="119" fill={T.mid} fontSize="12">−{fmt(scale)}</text>
          <motion.path initial={false} animate={{ d: path }} transition={{ duration: reduce ? 0 : .22 }} fill="none" stroke={T.acid} strokeWidth="2.5" strokeLinejoin="round" />
          <motion.circle initial={false} animate={{ cx: x(day), cy: y(point[metric]) }} transition={{ duration: reduce ? 0 : .15 }} r="4" fill={T.acid} />
        </svg>
        <div className="w3-review-days" role="group" aria-label="Tag der Belastungsprognose">{r.impact.map((item, index) => <button key={item.day} type="button" aria-pressed={day === index} onClick={() => setDay(index)}>{index === 0 ? 'Fahrt' : `+${index}`}</button>)}</div>
      </> : <p className="w3-review-on-plan"><Check size={15} />Belastung wie geplant</p>}
      <p>{r.impact_basis} Belastungsmodellwerte, keine nachgewiesenen Leistungszuwächse.</p>
    </details>}
    <details className="w3-review-method"><summary>Einordnung & Datengrundlage <ChevronDown size={16} /></summary>
      <p>{r.stimulus_detail}</p><p>Die Leistungsbereiche beschreiben gemessene Leistung. Ob deine Leistungsfähigkeit gestiegen ist, zeigen erst vergleichbare Folgemessungen.</p>
      {planned && <p>{r.headline} {r.summary}</p>}
      <p>{r.method}</p><p>Empfehlung: {r.planned_title ?? 'Nicht gespeichert'}. {r.coverage == null ? 'Keine Leistungsmessung.' : `${Math.round(r.coverage * 100)} % Leistungsabdeckung.`}</p>
      {r.limitations.map(limit => <p key={limit}>{limit}</p>)}
      <p>Die Verlaufsgrafik fasst benachbarte Messungen desselben Leistungsbereichs zusammen. Vollständig fehlende Abschnitte bleiben frei; der Regler zeigt zusammengefasste Abschnittswerte. Der Zonenvergleich bewertet Zeitverteilung, nicht die exakte Abfolge einzelner Intervalle.</p>
      {adaptation && !adaptation.automatic && !historical && <p>{adaptation.reason}</p>}
    </details>
  </section>
}
