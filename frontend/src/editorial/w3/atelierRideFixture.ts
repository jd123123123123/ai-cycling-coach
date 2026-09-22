import type { FTPEntry, RideSample } from './atelierRideData'
import type { RideContributions } from './AtelierRideMeaning'
// Fully synthetic preview streams: never substitute these for a missing device recording.
// Seven climbs; ascent matches the existing 5,639 hm demonstration summary.
export const ATELIER_SAMPLES:RideSample[]=(()=>{
 const terrain=[[0,1400],[10,2030],[16,1470],[27,2180],[34,1670],[43,2080],[51,1720],[62,2230],[73,1420],[85,2250],[94,1760],[105,2360],[115,1550],[125,2060],[138.6,1460]]
 const raw=Array.from({length:127},(_,i)=>{
  const km=138.6*i/126,right=terrain.findIndex(([d])=>d>=km),a=terrain[Math.max(0,right-1)],b=terrain[Math.max(0,right)]
  const t=(km-a[0])/Math.max(.001,b[0]-a[0])
  return {distance:km*1000,altitude:a[1]+(b[1]-a[1])*(1-Math.cos(t*Math.PI))/2}
 })
 const ascent=raw.slice(1).reduce((sum,p,i)=>sum+Math.max(0,p.altitude-raw[i].altitude),0)
 const points=raw.map(p=>({...p,altitude:1400+(p.altitude-1400)*5639/ascent}))
 let seconds=0
 const rows=points.map((p,i)=>{
  const next=points[Math.min(i+1,126)],grade=i<126?(next.altitude-p.altitude)/(next.distance-p.distance)*100:0
  const speed=Math.max(12,32-grade*1.7),power=[42,65,85,108].includes(i)?320:Math.max(0,Math.round(grade>0?230+grade*2+Math.sin(i*2.7)*12:195+grade*3+Math.sin(i*2.7)*18))
  const row={...p,seconds,grade,power,heart_rate:Math.round(136+Math.max(0,grade)*3+Math.sin(i/3)*9),cadence:Math.round(80+Math.sin(i/4)*12),speed}
  if(i<126)seconds+=(next.distance-p.distance)/(speed/3.6)
  return row
 })
 const factor=17100/seconds
 return rows.map(r=>({...r,seconds:r.seconds*factor,speed:r.speed/factor}))
})()
export const ATELIER_FTP:FTPEntry[]=[
 {date:'2026-03-23',watts:252,source:'FTP-Test'}, {date:'2026-05-04',watts:258,source:'FTP-Test'},
 {date:'2026-06-29',watts:264,source:'FTP-Test'}, {date:'2026-07-20',watts:269,source:'FTP-Test'},
 {date:'2026-08-10',watts:266,source:'Manuell gesetzt'}, {date:'2026-08-31',watts:274,source:'FTP-Test'},
 {date:'2026-09-21',watts:280,source:'FTP-Test'},
]
// Explicit demonstration totals BEFORE this ride. Production must supply period-matched aggregates.
export const ATELIER_CONTRIBUTIONS: RideContributions = {
  period: 'Dein Jahr 2026', rideDate:'2026-09-21', history:[
    ['2026-01-01',0,0,0], ['2026-02-01',325,12,1450], ['2026-03-01',700,26,3800],
    ['2026-04-01',1350,47,7950], ['2026-05-01',2140,74,13000], ['2026-06-01',2710,94,18500],
    ['2026-07-01',3150,110,23000], ['2026-08-01',3870,131,28700], ['2026-09-01',4480,153,32700],
    ['2026-09-20',4673.4,160.25,35621],
  ].map(([date,distance,hours,ascent])=>({date:String(date),totals:{distance:Number(distance),time:Number(hours)*3600,ascent:Number(ascent)}})), metrics: [
    { key: 'distance', label: 'Kilometer', unit: 'km', before: 4673.4, added: 138.6 },
    { key: 'time', label: 'Sattelzeit', unit: 'h', before: 576900, added: 17100 },
    { key: 'ascent', label: 'Höhenmeter', unit: 'hm', before: 35621, added: 5639 },
  ],
}
