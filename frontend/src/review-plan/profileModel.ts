export type Demand = 'steady' | 'climbs' | 'attacks' | 'sprints' | 'unknown'
export type Intent = 'finish' | 'faster' | 'race' | 'unknown'
export interface GoalBrief {name:string;date:string;distance:string;elevation:string;duration:string;demand:Demand;intent:Intent;source:string;sourceName:string;kind:'goal'|'schedule';adapt:boolean;confirmed:boolean}
export const EMPTY_BRIEF:GoalBrief={name:'',date:'',distance:'',elevation:'',duration:'',demand:'unknown',intent:'unknown',source:'',sourceName:'Beschreibung',kind:'goal',adapt:false,confirmed:false}
export const EXAMPLES={
 alpine:'Alpenrunde am 08.11.2026. 160 km und 2800 hm mit langen Anstiegen. Ich rechne mit 6 Stunden Fahrzeit. Ich möchte gut ankommen und am letzten Pass noch Kraft haben. Für Training habe ich 6 Stunden pro Woche.',
 crit:'Mein Kriterium am 08.11.2026 dauert 60 Minuten. Viele Attacken und kurze Beschleunigungen nach den Kurven. Ich möchte um die Platzierung fahren, nicht nur ankommen. Ich habe 6 Stunden pro Woche.',
 coach:'Trainingsplan vom Coach. Ab 19.10.2026. Dienstag: 5 × 3 min, jeweils 2 min locker. Donnerstag: 60 min Z2. Samstag: 150 min Grundlage, fix. Alle Intensitäten nach FTP. Bitte die Struktur beibehalten.'
}
/** Local demo extraction. Not an LLM, and never a source of physiological scores. */
export function interpretBrief(text:string,sourceName='Beschreibung',kind:GoalBrief['kind']='goal'):GoalBrief{
 const lower=text.toLowerCase(),date=text.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/)
 const duration=text.match(/(?:rechne mit|fahrzeit\s*[:=]?|dauer\s*[:=]?|dauert)\s*(\d+(?:[.,]\d+)?)\s*(stunden?|h\b|minuten?|min\b)/i)
 const hours=duration?Number(duration[1].replace(',','.'))*(/^min/i.test(duration[2])?1/60:1):null
 const demand:Demand=/zielsprint|kurze sprints|explosivkraft/.test(lower)?'sprints':/attacken|beschleunigung/.test(lower)?'attacks':/lange[nr]? anstiege|lange[nr]? p[aä]ss/.test(lower)?'climbs':/gleichmäßig|flach/.test(lower)?'steady':'unknown'
 const intent:Intent=/platzierung|sieg|spitzengruppe/.test(lower)?'race':/schneller|bestzeit|unter \d/.test(lower)?'faster':/ankommen|finishen|durchkommen/.test(lower)?'finish':'unknown'
 let name=text.split(/[\n.!?]/)[0].split(/\s+am\s+/)[0].slice(0,70).trim()
 if(name.length<3)name=''
 return {...EMPTY_BRIEF,name,date:date?`${date[3]}-${date[2].padStart(2,'0')}-${date[1].padStart(2,'0')}`:'',distance:text.match(/\b(\d+(?:[.,]\d+)?)\s*km\b/i)?.[1]??'',elevation:text.match(/\b([\d.]+)\s*(?:hm|höhenmeter)\b/i)?.[1]?.replaceAll('.','')??'',duration:hours?String(+hours.toFixed(2)):'',demand,intent,source:text,sourceName,kind}
}
export const DEMAND_LABELS:Record<Demand,string>={steady:'Gleichmäßig',climbs:'Lange Anstiege',attacks:'Viele Attacken',sprints:'Kurze Sprints',unknown:'Noch offen'}
export const INTENT_LABELS:Record<Intent,string>={finish:'Gut ankommen',faster:'Schneller fahren',race:'Um Platzierung fahren',unknown:'Noch offen'}
export function focusFor(brief:GoalBrief|null,goal='ftp'):number[]{
 if(!brief)return goal==='vo2'?[2,1]:goal==='endurance'?[4,3]:[3,4]
 if(brief.demand==='unknown'||brief.intent==='unknown')return []
 if(brief.demand==='sprints')return [0,1]
 if(brief.demand==='attacks')return brief.intent==='finish'?[2,4]:[1,2]
 if(brief.intent==='finish')return [4,3]
 return brief.demand==='climbs'?[3,2]:[3,4]
}
export const AXES=[
 {name:'Sprint',short:'5 Sekunden',unit:'W',max:1200,before:790,current:820,after:830,date:'12. Sep.',description:'Beste aufgezeichnete 5-Sekunden-Leistung. Fehlende maximale Sprints sind kein Beleg für eine Schwäche.'},
 {name:'Antritt',short:'1 Minute',unit:'W',max:700,before:405,current:420,after:438,date:'8. Sep.',description:'Beste aufgezeichnete 1-Minuten-Leistung. Wiederholte Attacken werden damit noch nicht vollständig beschrieben.'},
 {name:'Kurzleistung',short:'5 Minuten',unit:'W',max:500,before:330,current:330,after:349,date:'8. Sep.',description:'Beste aufgezeichnete 5-Minuten-Leistung. Das ist keine direkte VO₂max-Messung.'},
 {name:'Schwelle',short:'FTP',unit:'W',max:400,before:240,current:240,after:258,date:'16. Aug.',description:'Hinterlegter FTP-Test. Vorher und nachher nur bei vergleichbarem Testprotokoll gegenüberstellen.'},
 {name:'Tourendauer',short:'Längste Fahrt',unit:'min',max:360,before:190,current:220,after:270,date:'13. Sep.',description:'Längste aufgezeichnete Fahrt. Zeigt Erfahrung mit langen Touren, nicht deine maximale Ausdauer.'},
]
export const nativeValue=(axis:number,value:number)=>axis===4?`${Math.floor(value/60)}:${String(value%60).padStart(2,'0')} h`:`${value} W`
export function focusReason(brief:GoalBrief|null,axis:number){
 if(axis===4&&brief?.duration&&Number(brief.duration)<=220/60)return 'Die Zieldauer ist bereits durch längere Fahrten belegt. Jetzt zählt, diese Dauer mit der geforderten Intensität zu verbinden.'
 if(axis===4)return brief?.duration?`Du planst ${brief.duration.replace('.',',')} Stunden. Bisher sind 3:40 h am Stück belegt. Lange Fahrten schrittweise aufbauen.`:'Längere Fahrten aufbauen. Deine längste aufgezeichnete Tour beträgt 3:40 h.'
 if(axis===3)return brief?.demand==='climbs'?'Lange Anstiege verlangen anhaltende Leistung. Deshalb Schwellenarbeit als Schwerpunkt.':'Länger nahe deiner Schwelle fahren: kontrollierte Intervalle statt nur kurzer Spitzen.'
 if(axis===1)return 'Viele Beschleunigungen verlangen wiederholte kurze Belastungen. Deine beste Minute allein belegt noch keine Wiederholbarkeit.'
 if(axis===2&&brief?.demand==='climbs')return 'Höheres Tempo an steilen Passagen verlangt Leistung über mehrere Minuten. Die längeren Anstiege bleiben der Hauptfokus.'
 if(axis===2)return 'Intensive Minuten für die Attacken im Rennen. Die Erholung zwischen den Belastungen gehört zum Fokus.'
 return 'Kurze Sprintleistung gezielt trainieren, wenn dein Ziel sie tatsächlich verlangt.'
}
