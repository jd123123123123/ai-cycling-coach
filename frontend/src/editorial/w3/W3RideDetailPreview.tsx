import { useEffect } from 'react'
import W3RideDetailView, { type W3RideVm } from './W3RideDetailView'
import W3TrainingReview from './W3TrainingReview'
import type { TrainingReview } from '../../api/trainingReview'
import { MARATONA } from './maratonaFixture'

// DEV-only, deterministic demonstration of the actual production components.
const zones = [
  {label:'Erholung',minutes:75,power:50}, {label:'Ausdauer',minutes:105,power:67},
  {label:'Tempo',minutes:60,power:83}, {label:'Schwelle',minutes:30,power:100},
  {label:'VO₂-Bereich',minutes:12,power:115}, {label:'Anaerob',minutes:3,power:135},
]
export const REVIEW:TrainingReview = {
  version:'1',activity_id:1,headline:'Länger als empfohlen gefahren.',summary:'Die längere Fahrt hat mehr Belastung erzeugt als die geplante Ausdauereinheit.',
  score:72,score_label:'Planpassung',status:'different',planned_title:'Lange Ausdauer · 4 Stunden',actual_title:'Dolomitenrunde',coverage:1,
  stimulus:'VO₂-Bereich',stimulus_detail:'12 Minuten im VO₂-Leistungsbereich. Ob sich deine Leistungsfähigkeit verbessert hat, zeigen erst vergleichbare Folgemessungen.',
  pairs:[{label:'Dauer',actual:285,planned:240,unit:'min'},{label:'Belastung',actual:352,planned:180,unit:'TSS'}],
  zones:zones.map((z,i)=>({label:z.label,actual_seconds:z.minutes*60,planned_seconds:[1800,10800,1800,0,0,0][i]})),
  trace:Array.from({length:57},(_,i)=>({at_s:i*300,actual_pct:[52,64,71,88,103,115,92,55,66,72,80,100][i%12],planned_pct:i<48?65:null})),
  impact:Array.from({length:7},(_,day)=>({day,fitness:4.1*Math.exp(-day/42),fatigue:24.6*Math.exp(-day/7),form:4.1*Math.exp(-day/42)-24.6*Math.exp(-day/7)})),
  impact_basis:'Vereinfachtes Belastungsmodell aus der TSS-Abweichung.',changes:[{date:'2026-09-22',before:'Tempo · 60 min',after:'Erholung · 30 min',reason:'Zusätzliche Belastung der langen Ausfahrt.'}],
  action:'Die zusätzliche Belastung wird im weiteren Wochenplan berücksichtigt.',adaptation:{state:'adapted',automatic:true,reason:'Die nächste Einheit wurde erleichtert.'},
  limitations:['Demodaten zur Beurteilung der Oberfläche.'],method:'Planpassung vergleicht Dauer, Belastung und Zeitverteilung in Leistungsbereichen.',
}
export const FIXTURE:W3RideVm = {
  dateChip:'21. Sept. · 09:12',sportChip:'Outdoor',recordChip:'Neuer Bestwert',title:'Dolomitenrunde',bigStat:'138,6',bigStatUnit:'km',climb:'5.639 hm',avgSpeed:'29,2 km/h',
  power:[],powerNote:'',polyline:MARATONA,
  hero:{polyline:MARATONA,sceneImage:null,dateLine:'21.09.2026 · 09:12',duration:'04:44:48',stats:[{label:'DISTANZ',value:'138,6',unit:'km'},{label:'Ø TEMPO',value:'29,2',unit:'km/h'},{label:'HÖHE',value:'5.639',unit:'hm'}],watts:'241',bpm:'148',ifValue:'0,86',ifFill:.86,effortLabel:'86 % VON FTP',energyLabel:'3.640 kcal'},
  movedSub:'2026 bis zu dieser Fahrt',moved:[{label:'Distanz',delta:'+138,6 km',value:'4.812 km',goal:'',beforePct:0,pct:0},{label:'Höhenmeter',delta:'+5.639 hm',value:'41.260 hm',goal:'',beforePct:0,pct:0},{label:'Fahrten',delta:'+1',value:'142',goal:'',beforePct:0,pct:0}],movedFoot:'Aufgezeichnete Radfahrten bis zum 21. September 2026.',
  stats:[{v:'352',l:'BELASTUNG · TSS',s:'Aus der Leistung berechnet'},{v:'4,2 %',l:'HF-DRIFT',s:'Veränderung der Leistungs-Herzfrequenz-Kopplung'},{v:'1,12',l:'VARIABILITÄT',s:'Normalisierte Leistung / Ø Leistung'},{v:'3.640',l:'ARBEIT · KJ',s:'Mechanische Arbeit'}],
  execScore:'72',execTotal:'100',verdictHeadline:'Deine Dolomitenrunde.',verdictBody:'Die längere Fahrt erzeugte mehr Belastung als empfohlen.',aiModel:null,
  repeatsScore:'',repeatsSub:'',repeats:[],
  zonesSub:'285 Minuten mit Leistungsmessung.',zones:zones.map((z,i)=>({z:`ZONE ${i+1}`,name:z.label,min:`${z.minutes} min`,pct:z.minutes/285*100,peak:i===1})),
  ranksSub:'Diese Fahrt gegen bisherige Bestwerte.',ranks:[{durationSeconds:5,dur:'5 SEK',watts:'1.180 W',bestWatts:'1.240 W',wattsValue:1180,bestWattsValue:1240,note:'−60 W',pr:false,fill:1180/1240},{durationSeconds:60,dur:'1 MIN',watts:'598 W',bestWatts:'620 W',wattsValue:598,bestWattsValue:620,note:'−22 W',pr:false,fill:598/620},{durationSeconds:300,dur:'5 MIN',watts:'342 W',bestWatts:'335 W',wattsValue:342,bestWattsValue:335,note:'+7 W',pr:true,fill:1},{durationSeconds:1200,dur:'20 MIN',watts:'268 W',bestWatts:'276 W',wattsValue:268,bestWattsValue:276,note:'−8 W',pr:false,fill:268/276}],
  onYouDelta:'+7',ceilingLabel:'5 min',ceilingBefore:'335',ceilingAfter:'342',
  shifts:[{key:'fitness',label:'Fitness',value:'78',delta:'+2',up:true,good:true,fill:.65,was:.63},{key:'fatigue',label:'Ermüdung',value:'88',delta:'+14',up:true,good:false,fill:.73,was:.62},{key:'form',label:'Form',value:'−10',delta:'−12',up:false,good:false,fill:.4,was:.52}],
  fitness:'78',fitnessD:'+2',fatigue:'88',fatigueD:'+14',form:'−10',formD:'−12',changesBody:'Vergleich mit dem 14. September. Das Modell berücksichtigt alle Trainingsbelastungen dieser Woche.',
}
export default function W3RideDetailPreview(){
  useEffect(()=>{if(window.location.hash==='#review'){const frame=requestAnimationFrame(()=>{const target=document.querySelector('.w3-training-review');if(target)window.scrollTo({top:target.getBoundingClientRect().top+window.scrollY-64})});return()=>cancelAnimationFrame(frame)}},[])

  const search=new URLSearchParams(window.location.search)
  const free=search.has('free'),limited=search.has('limited'),historical=search.has('historical')
  const review:TrainingReview=free?{...REVIEW,score:null,status:'unplanned',planned_title:null,pairs:REVIEW.pairs.map(p=>({...p,planned:null})),zones:REVIEW.zones.map(z=>({...z,planned_seconds:null})),trace:REVIEW.trace.map(p=>({...p,planned_pct:null})),impact:[],changes:[],adaptation:{state:'unchanged',automatic:true,reason:'Die Fahrt wurde im Belastungsverlauf berücksichtigt.'}}:REVIEW
  const shown=limited?{...review,score:null,coverage:null,trace:[],zones:[],impact:[],stimulus:'Fahrt erfasst',limitations:['Keine vollständige Leistungsaufzeichnung vorhanden.']}:review
  const vm={...FIXTURE,...(historical?{hero:{...FIXTURE.hero,dateLine:'12.08.2026 · 09:12'},movedFoot:'Aufgezeichnete Radfahrten bis zum 12. August 2026.',changesBody:'Vergleich mit dem 5. August. Das Modell berücksichtigt alle Trainingsbelastungen dieser Woche.'}:{})}
  return <><div style={{textAlign:'center',fontSize:12,padding:8,color:'var(--w3-mid)',background:'var(--w3-bg)'}}>Vorschau · Beispieldaten</div><W3RideDetailView vm={limited?{...vm,ranks:[],zones:[],shifts:[],hero:{...vm.hero,watts:'—',ifValue:'—',ifFill:0}}:vm} trainingReview={<W3TrainingReview review={shown} rideDate={historical?'2026-08-12':new Date().toISOString()} onOpenPlan={()=>{window.location.href='/e/w3-plan-experience-preview?state=active'}}/>} onBack={()=>history.back()}/></>
}
