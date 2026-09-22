import {apiClient} from './client'
import type {ProgressExplorer,ProgressPoint} from './progressExplorer'
export interface PlanHistoryItem {
 id:string;title:string;start:string;planned_end:string;end:string|null;status:'active'|'completed'|'cancelled'|'replaced';weeks:number;version_count:number
 totals:{rides:number;km:number|null;hours:number|null;ascent:number|null;tss:number|null}|null
 baseline:{ftp:ProgressPoint|null;vo2:ProgressPoint|null};progress:ProgressExplorer|null
}
export interface PlanHistoryDetail extends PlanHistoryItem {
 goal:{focuses?:string[];weekly_hours?:number|null}
 revisions:{saved_at:string;schedule:{days:{date:string;title:string;duration:number|null;tss:number|null}[];blocks:{start:string;end:string;phase:string;weekly_tss:number[]}[]}}[]
 outcome:{through:string;totals:NonNullable<PlanHistoryItem['totals']>;progress:ProgressExplorer;weeks:{start:string;end:string;planned_tss:number|null;actual_tss:number|null;rides:number;duration:number|null}[];rides:{id:number;date:string;title:string;duration:number|null;tss:number|null}[];note:string}|null
}
export const refreshPlanHistory=async()=>{await apiClient.post('/plan/history/refresh')}
export const fetchPlanHistory=async(offset=0)=>(await apiClient.get<{plans:PlanHistoryItem[];next_offset:number|null}>('/plan/history',{params:{offset,limit:3}})).data
export const fetchPlanHistoryDetail=async(id:string)=>(await apiClient.get<PlanHistoryDetail>(`/plan/history/${encodeURIComponent(id)}`)).data
