import type { DailyMetric } from '../../api/dashboard'

export type RecoveryMetric = 'hrv' | 'rhr' | 'sleep'
export const METRIC_LABEL: Record<RecoveryMetric, string> = {hrv:'HRV',rhr:'Ruhepuls',sleep:'Schlaf'}
export const METRIC_UNIT: Record<RecoveryMetric, string> = {hrv:'ms',rhr:'bpm',sleep:'h'}
export function shiftDay(date:string, days:number):string {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days)
  return d.toISOString().slice(0,10)
}
export function metricValue(row:DailyMetric | undefined, metric:RecoveryMetric):number|null {
  const value = metric==='hrv' ? row?.hrv_nightly_mean : metric==='rhr' ? row?.resting_hr : row?.sleep_detail?.total_s == null ? null : row.sleep_detail.total_s/3600
  return value != null && Number.isFinite(value) && value>0 ? value : null
}
export function metricFormat(value:number|null, metric:RecoveryMetric):string {
  if(value==null) return '—'
  if(metric==='sleep') { const minutes=Math.round(value*60); return `${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}` }
  return Math.round(value).toLocaleString('de-DE')
}
export function differenceFormat(value:number, metric:RecoveryMetric):string {
  const n = Math.round(value*(metric==='sleep'?60:1))
  return `${n>0?'+':n<0?'−':''}${Math.abs(n)} ${metric==='sleep'?'min':METRIC_UNIT[metric]}`
}
const mean=(values:number[])=>values.reduce((sum,v)=>sum+v,0)/values.length
const quantile=(sorted:number[], q:number)=>{const x=(sorted.length-1)*q; const i=Math.floor(x);return sorted[i]+(sorted[Math.ceil(x)]-sorted[i])*(x-i)}
export interface HistoryDay {date:string;value:number|null;row?:DailyMetric;trend:number|null;low:number|null;high:number|null;baseline:number|null;baselineCount:number;weekChange:number|null}
/** Calendar gaps stay gaps. Bands describe observed variation, never a clinical threshold. */
export function historyDays(rows:DailyMetric[], metric:RecoveryMetric, end:string, days:number):HistoryDay[] {
  const byDate = new Map<string,DailyMetric>()
  for(const row of [...rows].sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at))) if(row.date) byDate.set(row.date,row)
  const values=(date:string,from:number,to:number)=>Array.from({length:to-from+1},(_,i)=>metricValue(byDate.get(shiftDay(date,from+i)),metric)).filter((v):v is number=>v!=null)
  return Array.from({length:days},(_,i)=>{
    const date=shiftDay(end,i-days+1), row=byDate.get(date), value=metricValue(row,metric)
    const prior=values(date,-28,-1).sort((a,b)=>a-b), week=values(date,-6,0), previous=values(date,-13,-7)
    return {date,row,value,trend:value!=null&&week.length>=4?mean(week):null,
      low:prior.length>=14?quantile(prior,.25):null,high:prior.length>=14?quantile(prior,.75):null,
      baseline:prior.length>=14?mean(prior):null,baselineCount:prior.length,
      weekChange:week.length>=4&&previous.length>=4?mean(week)-mean(previous):null}
  })
}

export function periodSummary(rows:DailyMetric[],metric:RecoveryMetric,end:string,days:number) {
  const current=historyDays(rows,metric,end,days).flatMap(p=>p.value==null?[]:[p.value])
  const previous=historyDays(rows,metric,shiftDay(end,-days),days).flatMap(p=>p.value==null?[]:[p.value])
  return {mean:current.length?mean(current):null,count:current.length,previousCount:previous.length,
    change:current.length>=Math.ceil(days/2)&&previous.length>=Math.ceil(days/2)?mean(current)-mean(previous):null}
}
