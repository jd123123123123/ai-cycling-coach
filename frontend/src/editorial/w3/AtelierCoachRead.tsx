import { useState, type ReactNode } from 'react'
import { ArrowUpRight, ArrowRight, Activity, Mountain, Gauge, Heart, Footprints, Zap, TrendingUp, CalendarDays, Check } from 'lucide-react'
import type { TrainingReview } from '../../api/trainingReview'
import { AtelierExplanation } from './AtelierExplanation'
import { T } from './w3tokens'
import { AtelierPlot } from './AtelierRideAnalysis'
import { elapsed, formatValue as f, ridePlot, type PlotModel } from './atelierRideData'
import { cadenceExposure, coachEvidence, COACH_CHAPTERS, known, signed, type CoachChapter, type CoachEvidence } from './atelierCoachData'

const empty:CoachEvidence={debrief:null,streams:null,samples:[],ftpAtRide:null}
const icons={Fazit:Activity,Pacing:Gauge,Körper:Heart,Technik:Footprints,Berge:Mountain,Energie:Zap,Entwicklung:TrendingUp,Planfolge:CalendarDays}
const duration=(s:number)=>s<60?`${s} s`:`${s/60} min`
function Reason({children,label='Was bedeutet das?'}:{children:ReactNode;label?:string}){return <AtelierExplanation title={label}>{children}</AtelierExplanation>}
function Stat({label,value,unit}:{label:string;value:string;unit?:string}){return <div><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>}
function Pair({a,b,labels,unit='W'}:{a:number|null|undefined;b:number|null|undefined;labels:[string,string];unit?:string}){
  const max=Math.max(1,known(a)?a:0,known(b)?b:0)
  return <div className="coach-pair" aria-label={`${labels[0]} ${f(a)} ${unit}, ${labels[1]} ${f(b)} ${unit}`}>
    {[a,b].map((v,i)=><div key={i}><header><span>{labels[i]}</span><strong>{f(v)}<small> {unit}</small></strong></header><div className="coach-pair-track">{known(v)&&<i style={{width:`${Math.max(0,v)/max*100}%`}}/>}</div></div>)}
  </div>
}
function Trend({values,unit,labels,high,color=T.acid}:{values:(number|null)[];unit:string;labels:[string,string,string];high?:number;color?:string}){
  if(!values.some(known))return <p className="coach-missing">Dieser Verlauf wurde nicht aufgezeichnet.</p>
  const model:PlotModel={low:0,high:high??Math.ceil(Math.max(1,...values.filter(known))/50)*50,unit,xLabels:labels,series:[{color,area:true,points:values.map((y,i)=>known(y)?{x:i/Math.max(1,values.length-1),y}:null)}]}
  return <AtelierPlot model={model} label={`${unit}-Verlauf von ${labels[0]} bis ${labels[2]}`}/>
}

export function CoachRead({review,data=empty,onPlan,onFTP}:{review:TrainingReview;data?:CoachEvidence;onPlan:()=>void;onFTP:()=>void}){
  const [chapter,setChapter]=useState<CoachChapter>('Fazit'),[climb,setClimb]=useState(0),[technique,setTechnique]=useState<'cadence'|'force'>('cadence')
  const insights=coachEvidence(data,review),d=data.debrief,p=d?.pacing,bike=data.streams?.bike_dynamics,e=d?.efficiency
  const change=review.changes[0],applied=review.adaptation?.state==='adapted',cadence=cadenceExposure(data.samples)
  const mountain=d?.climbs[climb],fuel=d?.fueling
  const [effort,setEffort]=useState(300),chosen=d?.efforts.find(v=>v.duration_s===effort)??d?.efforts[0]
  const target=fuel?.carb_target_g_per_h
  const fuelKnown=target?.length===2&&target.every(known)&&target[0]>=0&&target[1]>=target[0]
  const hasPedals=known(bike?.balance_left_pct)&&known(bike?.balance_right_pct)
  const go=(next:CoachChapter)=>setChapter(next)
  return <div className={`atelier-coach-deep ${chapter==='Fazit'?'is-overview':''}`}>
    <nav className="coach-chapters" aria-label="Coach-Analyse auswählen">{COACH_CHAPTERS.map(c=><button key={c} aria-pressed={chapter===c} onClick={e=>{go(c);e.currentTarget.scrollIntoView?.({block:'nearest',inline:'nearest'})}}>{c}</button>)}</nav>
    <div className="coach-chapter" data-chapter={chapter} key={chapter}>
    {chapter==='Fazit'?<>
      <div className="coach-kicker"><Activity size={15}/> Dein Coach-Read</div>
      <h2>{insights.headline}</h2>
      <div className="coach-summary-visual"><Pair a={p?.first_half_np} b={p?.second_half_np} labels={['Erste Hälfte · NP','Zweite Hälfte · NP']}/></div>
      <div className="coach-findings">
        <button onClick={()=>go('Pacing')}><Gauge size={19}/><span><strong>{insights.pacingTitle}</strong><small>{insights.split==null?'Leistungsdaten fehlen':`${signed(insights.split,1)} % NP in Hälfte zwei`}</small></span><ArrowUpRight size={17}/></button>
        <button onClick={()=>go('Körper')}><Heart size={19}/><span><strong>{known(insights.drift)?`${signed(insights.drift,1)} % Herz-Leistungs-Drift`:'Herzreaktion prüfen'}</strong><small>{insights.mixedTerrain?'Mit Höhenprofil einordnen':'Leistung und Herzfrequenz zusammen'}</small></span><ArrowUpRight size={17}/></button>
        <button onClick={()=>go('Entwicklung')}><TrendingUp size={19}/><span><strong>{insights.best?`${signed(insights.best.ride_watts-insights.best.best_watts!)} W über der Referenz`:'Deine Entwicklung'}</strong><small>{insights.best?`${duration(insights.best.duration_s)} Leistung · Vergleich öffnen`:'Diese Fahrt im historischen Vergleich'}</small></span><ArrowUpRight size={17}/></button>
      </div>
      <button className="coach-next" onClick={()=>go('Planfolge')}><span><small>{insights.loadDelta==null?'Was folgt daraus?':`${signed(insights.loadDelta)} TSS gegenüber der Empfehlung`}</small><strong>{change?.after??'Deinen nächsten Schritt prüfen'}</strong></span><ArrowRight size={20}/></button>
    </>:<>
      <div className="coach-kicker">{(()=>{const Icon=icons[chapter];return <Icon size={15}/>})()} {chapter==='Entwicklung'?'Deine Referenzwerte':chapter}</div>
      {chapter==='Pacing'&&<>
        <h2>{insights.pacingTitle}.</h2>
        <Pair a={p?.first_half_np} b={p?.second_half_np} labels={['Erste Hälfte · NP','Zweite Hälfte · NP']}/>
        <div className="coach-stats"><Stat label="Veränderung" value={signed(insights.split,1)} unit="%"/><Stat label="Variabilität" value={f(p?.variability_index,2)}/><Stat label="Spitzen >110 % FTP" value={f(p?.surge_count)}/></div>
        <Trend values={p?.phase_np??[]} unit="W NP" labels={['1. Drittel','2. Drittel','3. Drittel']}/>
        <p className="coach-takeaway">{insights.pacingRead}</p>
        <Reason><p>NP gewichtet wechselnde Leistung stärker als ein einfacher Durchschnitt. {known(p?.final_30min_np)&&`Die letzten 30 Minuten lagen bei ${f(p.final_30min_np)} W NP.`}</p><p>Variabilität = NP / Durchschnittsleistung. Eine gleichmäßige Fahrt nähert sich 1. Spitzen zählen mindestens zehn Sekunden über 110 % deiner FTP. Auf Anstiegen, im Rennen und in Intervallen kann das beabsichtigt sein.</p><p>Für die nächste lockere Ausfahrt: die Leistung am Anstieg kontrollieren, statt den bisherigen Schnitt zu halten.</p></Reason>
      </>}
      {chapter==='Körper'&&<>
        <h2>Was dein Körper<br/>zur Leistung sagt.</h2>
        <div className="coach-stats"><Stat label="Herz-Leistungs-Drift" value={signed(insights.drift,1)} unit="%"/><Stat label="Ø Herzfrequenz" value={f(e?.avg_hr??data.streams?.avg_hr)} unit="bpm"/></div>
        <p className="coach-takeaway">{insights.cardiacRead}</p>
        {insights.stamina?<><div className="coach-chart-heading"><span>Garmin Stamina</span><strong>{f(insights.stamina.start)} → {f(insights.stamina.end)} %</strong></div><Trend values={bike?.stamina_curve??[]} unit="%" high={100} labels={['Start','Fahrtmitte','Ziel']}/></>:<div className="coach-missing">Stamina wurde von diesem Gerät nicht übermittelt.</div>}
        <div className="coach-stats"><Stat label="Effizienz · NP / Puls" value={f(e?.efficiency_factor,2)} unit="W/bpm"/><Stat label="Garmin Leistungszustand" value={signed(bike?.performance_condition)} /></div>
        <Reason><p>Positive Drift bedeutet weniger Watt pro Herzschlag in der zweiten Hälfte. Das ist ein Vergleich der Hälften, keine Diagnose für Erschöpfung, Dehydrierung oder Übertraining.</p><p>Stamina ist Garmins Modell deiner verbleibenden Leistungsreserve. Der Leistungszustand vergleicht die Gerätebewertung mit deinem persönlichen Niveau. Beides ersetzt keinen Erholungstest.</p><p>Hitze, Höhenprofil, Windschatten und Verpflegung verändern die Interpretation. Eine vergleichbare ruhige Ausfahrt ist aussagekräftiger als ein einzelner Bergtag.</p></Reason>
      </>}
      {chapter==='Technik'&&<>
        <h2>Wie du die Leistung<br/>auf die Straße bringst.</h2>
        <div className="coach-stats"><Stat label="Ø Kadenz" value={f(data.streams?.avg_cadence)} unit="rpm"/><Stat label="L / R" value={hasPedals?`${f(bike!.balance_left_pct)} / ${f(bike!.balance_right_pct)}`:'—'} unit="%"/></div>
        <div className="coach-technique-tabs"><button aria-pressed={technique==='cadence'} onClick={()=>setTechnique('cadence')}>Trittfrequenz</button><button aria-pressed={technique==='force'} onClick={()=>setTechnique('force')}>Kraftverteilung</button></div>
        {technique==='cadence'&&(cadence.pedalling>0?<div className="coach-cadence">{cadence.bands.map((s,i)=><div key={i}><div><i style={{height:`${Math.max(2,s/cadence.pedalling*100)}%`}}/></div><strong>{f(s/cadence.pedalling*100)} %</strong><span>{['<70','70–95','>95'][i]} rpm</span></div>)}</div>:<p className="coach-missing">Kein Kadenzverlauf vorhanden.</p>)}
        {technique==='force'&&(d?.quadrant?<div className="coach-quadrant" aria-label="Zeitanteile nach Kraft und Trittfrequenz">{[['Hohe Kraft · niedrige Kadenz',d.quadrant.q2_pct],['Hohe Kraft · hohe Kadenz',d.quadrant.q1_pct],['Niedrige Kraft · niedrige Kadenz',d.quadrant.q3_pct],['Niedrige Kraft · hohe Kadenz',d.quadrant.q4_pct]].map(([label,v])=><div key={label}><strong>{f(Number(v))} %</strong><span>{label}</span></div>)}</div>:<p className="coach-missing">Für die Kraftverteilung fehlen Sensordaten.</p>)}
        <Reason><p>Die Kadenzbänder beschreiben deinen Fahrstil; sie sind keine allgemeingültige Idealvorgabe. Niedrige Kadenz bei hoher Leistung verlangt mehr Kraft pro Tritt. Die linke/rechte Balance ist eine Verteilung, kein Technik-Score.</p>{d?.quadrant&&<p>Die Quadranten trennen bei {f(d.quadrant.cadence_threshold_rpm)} rpm und {f(d.quadrant.force_threshold_n)} N; {f(d.quadrant.sample_count)} Messpunkte.</p>}<p>Pedalplattform-Versatz: links {f(bike?.pco_left_mm,1)} / rechts {f(bike?.pco_right_mm,1)} mm. Kraftphase links {bike?.power_phase_left?.map(v=>f(v)).join('–')??'—'}°, rechts {bike?.power_phase_right?.map(v=>f(v)).join('–')??'—'}°. Ohne diese Sensorwerte wird keine Sitzpositions-Empfehlung abgeleitet.</p></Reason>
      </>}
      {chapter==='Berge'&&<>
        <h2>Deine Arbeit<br/>am Berg.</h2>
        {d?.climbs.length?<>
          <div className="coach-selectors" role="group" aria-label="Anstieg wählen">{d.climbs.map((c,i)=><button key={c.start_s} aria-pressed={i===climb} onClick={()=>setClimb(i)}>{i+1}</button>)}</div>
          <div className="coach-stats"><Stat label="Anstieg" value={f(mountain?.elev_gain_m)} unit="hm"/><Stat label="Mittlere Steigung" value={f(mountain?.avg_grade_pct,1)} unit="%"/></div>
          <AtelierPlot model={ridePlot(data.samples,'altitude',null,null)} label="Höhenverlauf der gesamten Fahrt"/>
          <div className="coach-stats"><Stat label="Leistung" value={f(mountain?.avg_power)} unit="W"/><Stat label="Relativ" value={f(mountain?.w_per_kg,2)} unit="W/kg"/><Stat label="Steigrate" value={f(mountain?.vam_m_per_h)} unit="hm/h"/></div>
          <p className="coach-takeaway">{mountain&&`${f(mountain.duration_s/60)} Minuten ab ${elapsed(mountain.start_s)} h. ${known(mountain.avg_power)&&known(data.ftpAtRide)&&data.ftpAtRide>0?`${f(mountain.avg_power/data.ftpAtRide*100)} % deiner damaligen FTP.`:''}`}</p>
          <Reason><p>Vergleiche Watt und Watt pro Kilogramm bei ähnlicher Dauer. Die Steigrate hängt zusätzlich von Steigung, Untergrund und Wind ab. Höhere hm/h allein beweisen keinen Fitnessgewinn.</p><p>Bei einer geplanten Ausdauereinheit hilft ein leichterer Gang, die Zielzone auch an steilen Stellen zu halten.</p></Reason>
        </>:<p className="coach-missing">Für diese Fahrt wurden keine Anstiege erkannt.</p>}
      </>}
      {chapter==='Energie'&&<>
        <h2>Was diese Fahrt<br/>gekostet hat.</h2>
        <div className="coach-energy"><strong>{f(d?.header.total_kj)}<small> kJ</small></strong><span>Mechanische Arbeit am Rad</span></div>
        {fuelKnown?<><div className="coach-chart-heading"><span>Verpflegung für eine ähnliche Fahrt</span></div><div className="coach-fuel-range"><strong>{f(target![0])}–{f(target![1])}<small>g / Stunde</small></strong><div><i/></div><span>Kohlenhydrate · Modellbereich</span></div><p className="coach-takeaway">{fuel?.likely_underfueled==null?'Deine tatsächliche Zufuhr ist unbekannt. Ein Verpflegungsdefizit lässt sich daraus nicht feststellen.':'Die Verpflegungsbewertung ist ein Modellhinweis, kein nachgewiesenes Defizit.'}</p></>:<p className="coach-missing">Ohne Energieauswertung wird kein Verpflegungsbereich geschätzt.</p>}
        <Reason><p>kJ sind mechanische Arbeit aus der Leistungsmessung, nicht gemessene gegessene Kalorien. Auch der Kohlenhydratverbrauch ist modelliert. Aus fallender Leistung lässt sich kein Hungerast beweisen.</p><p>Für die nächste vergleichbare Ausfahrt: Verpflegung vorab einplanen und die Verträglichkeit im Training erproben. Der Modellbereich ist ein Ausgangspunkt und berücksichtigt keine individuellen Unverträglichkeiten.</p>{d?.matchbook&&<p>Leistungsreserve: {f(d.matchbook.match_count)} modellierte Belastungsspitzen, {f(d.matchbook.time_above_cp_s/60,1)} min über Critical Power. W′ ist ein Leistungsmodell, kein gemessener Kohlenhydratspeicher.</p>}</Reason>
      </>}
      {chapter==='Entwicklung'&&<>
        <h2>Deine Leistung<br/>im Vergleich.</h2>
        {chosen?<><div className="coach-selectors" role="group" aria-label="Leistungsdauer vergleichen">{d!.efforts.map(v=><button key={v.duration_s} aria-pressed={v.duration_s===chosen.duration_s} onClick={()=>setEffort(v.duration_s)}>{duration(v.duration_s)}</button>)}</div>
        <Pair a={chosen.best_watts} b={chosen.ride_watts} labels={['Referenzwert','Diese Fahrt']}/>
        <div className="coach-stats"><Stat label="Veränderung" value={known(chosen.best_watts)&&chosen.best_watts>0?signed(chosen.ride_watts-chosen.best_watts):'—'} unit="W"/><Stat label="Relativ" value={known(chosen.best_watts)&&chosen.best_watts>0?signed((chosen.ride_watts/chosen.best_watts-1)*100,1):'—'} unit="%"/></div>
        <p className="coach-takeaway">{known(chosen.best_watts)&&chosen.best_watts>0?chosen.ride_watts>chosen.best_watts?'Referenz übertroffen. Noch kein FTP-Nachweis.':'Kein Bestwert ist kein Rückschritt.':'Keine frühere Referenz verfügbar.'}</p></>:<p className="coach-missing">Keine vergleichbaren Bestwerte verfügbar.</p>}
        <button className="coach-next" onClick={onFTP}><span><strong>Deinen FTP-Verlauf öffnen</strong></span><ArrowUpRight size={19}/></button>
        <Reason><p>Die Referenz kommt aus der bestehenden Bestwerte-Auswertung. Sie ist kein Vergleich mit einer hinsichtlich Strecke, Wind oder Ermüdung identischen Fahrt. Das Bezugsfenster ist im aktuellen Datensatz nicht angegeben.</p><p>Für eine belastbare Entwicklung: wiederholte vergleichbare Tests und Leistungswerte über mehrere Fahrten betrachten. Ein einziger 20-Minuten-Wert wird hier nicht automatisch zu deiner neuen FTP.</p></Reason>
      </>}
      {chapter==='Planfolge'&&<>
        <h2>{change?'Die Konsequenz\nfür deinen Plan.':'Was du mitnehmen\nkannst.'}</h2>
        <div className="coach-plan-load"><strong>{signed(insights.loadDelta)} TSS</strong><span>gegenüber der Empfehlung</span></div>
        {change?<div className="coach-plan-change"><header>{applied?<Check size={15}/>:<CalendarDays size={15}/>}<span>{applied?'Im Plan angepasst':'Vorgeschlagene Anpassung'} · {new Date(`${change.date}T12:00:00`).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</span></header><del>{change.before}</del><ArrowRight size={19}/><strong>{change.after}</strong><p>{change.reason}</p></div>:<p className="coach-takeaway">Dieser Fahrt ist keine konkrete Planänderung zugeordnet.</p>}
        <Reason label="Was du jetzt tun kannst"><div className="coach-action-list"><div><span>01</span><p><strong>Belastung gezielt verteilen.</strong>{insights.loadDelta!=null&&insights.loadDelta>0?'Die Zusatzbelastung ist dokumentiert. Eine weitere harte Einheit nicht allein aus dem Erfolg dieser Fahrt ableiten.':'Geplante lockere Abschnitte locker halten; Trainingsreiz und Erholung gemeinsam betrachten.'}</p></div><div><span>02</span><p><strong>Die nächste Messung nutzen.</strong>Vor der nächsten Einheit Schlaf, persönliche HRV-Basis und dein Körpergefühl gemeinsam prüfen.</p></div></div></Reason>
        <button className="coach-next" onClick={onPlan}><span><small>Gespeicherte Empfehlung & Anpassung</small><strong>Planvergleich öffnen</strong></span><ArrowUpRight size={20}/></button>
      </>}
    </>}
    </div>
    <AtelierExplanation title="Welche Daten stecken dahinter?"><div className="coach-source-pills">{insights.sources.map(s=><span key={s.label} className={s.available?'is-present':''}>{s.available?<Check size={12}/>:<span>—</span>}{s.label}</span>)}</div><p>Gerätewerte, RIDR-Auswertungen und Modellschätzungen werden getrennt. Training Effect, Temperaturverlauf, Trinkmenge und gegessene Kohlenhydrate sind in diesem Coach-Datensatz nicht verfügbar und fließen nicht als vermeintliche Messwerte ein.</p><p>Gerätefunktionen: <a href="https://www.garmin.com/en-US/garmin-technology/cycling-science/physiological-measurements/training-effect/" target="_blank" rel="noreferrer">Garmin Training Effect</a>. Der Coach ergänzt diese Daten nur, wenn sie tatsächlich übermittelt wurden.</p></AtelierExplanation>
  </div>
}
