import type {ActivityRead} from '../../api/dashboard'

/** Group ride evidence by the calendar day shown to the rider, not UTC. */
export function recordedPlanDay(activities:ActivityRead[],date:string){
 const rides=activities.filter(a=>{const t=new Date(a.started_at);return a.sport==='cycling'&&`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`===date})
 return {ridden:rides.length>0,actualTss:rides.length&&rides.every(a=>a.tss!=null)?rides.reduce((s,a)=>s+a.tss!,0):null,actualDuration:rides.length&&rides.every(a=>a.duration_seconds!=null)?rides.reduce((s,a)=>s+a.duration_seconds!,0):null,actualRides:rides.map(a=>({id:a.id,title:a.title||'Deine Fahrt'}))}
}
