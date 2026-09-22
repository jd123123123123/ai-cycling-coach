import {describe,it,expect} from 'vitest'
import {rideAtelierVm,rideAtelierReview} from '../rideAtelierAdapter'
import type {ActivityRead} from '../../../api/dashboard'
import type {RideChart} from '../../../api/rideChart'
const activity:ActivityRead={id:9,user_id:2,started_at:'2026-09-20T08:00:00Z',title:'Eigene Fahrt',sport:'cycling',duration_seconds:7200,distance_meters:54000,elevation_gain_m:640,tss:null,average_hr:130,max_hr:160,average_power:null,normalized_power:null,calories:null,source:'garmin'}
describe('production ride adapter',()=>{
 it('opens recorded distance without a coach, FTP or power recording',()=>{
  const vm=rideAtelierVm(activity)
  expect(vm.bigStat).toBe('54');expect(vm.avgSpeed).toBe('27 km/h');expect(vm.ranks).toEqual([]);expect(vm.polyline).toBeNull()
 })
 it('preserves missing load and recommendation while analysis loads',()=>{
  const review=rideAtelierReview(activity,undefined,undefined,true)
  expect(review.pairs.find(p=>p.unit==='TSS')?.actual).toBeNull()
  expect(review.zones.every(z=>z.actual_seconds===null&&z.planned_seconds===null)).toBe(true)
  expect(review.planned_title).toBeNull();expect(review.summary).toContain('geladen')
 })
 it('uses exact second-resolution zone totals independently of the plotted samples',()=>{
  const chart={zone_seconds:[200,300,0,0,0,0,0],efforts:[{seconds:1,watts:810,previous:800},{seconds:1200,watts:200,previous:null}]} as RideChart
  const review=rideAtelierReview(activity,chart,undefined)
  expect(review.zones[0].actual_seconds).toBe(200);expect(review.zones[2].actual_seconds).toBe(0)
  const vm=rideAtelierVm(activity,chart)
  expect(vm.ranks.map(r=>r.durationSeconds)).toEqual([1,1200]);expect(vm.ranks[0].pr).toBe(true);expect(vm.ranks[1].pr).toBe(false)
 })
})
