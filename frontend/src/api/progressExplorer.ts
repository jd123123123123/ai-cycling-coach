import { apiClient } from './client'
export type ProgressPeriod='week'|'month'|'year'|'plan'
export interface ProgressPoint {date:string;value:number;source:string}
export interface ProgressMetric {points:ProgressPoint[];baseline:ProgressPoint|null;current:number|null;target:number|null}
export interface ProgressRecord {seconds:number;watts:number|null;all_time_watts:number|null;previous_watts:number|null;date:string|null;activity_id:number|null}
export interface ProgressExplorer {period:ProgressPeriod;start:string|null;end:string;today?:string|null;plan_start:string|null;plan_note:string|null;ftp:ProgressMetric;vo2:ProgressMetric;records:ProgressRecord[]}
export async function fetchProgressExplorer(period:ProgressPeriod, referenceDate?:string|null):Promise<ProgressExplorer> {
 return (await apiClient.get<ProgressExplorer>('/analytics/progress-explorer',{params:{period,...(referenceDate?{reference_date:referenceDate}:{})}})).data
}
