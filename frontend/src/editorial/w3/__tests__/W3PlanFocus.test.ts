import {describe,it,expect} from 'vitest'
import {sessionBars,mergeBars} from '../W3PlanFocus'
import type {PlanDaySession} from '../W3PlanView'

describe('prescribed workout chart',()=>{
 it('keeps a continuous base ride as one block with its full duration',()=>{
  const bars=sessionBars([{duration_seconds:5400,power_target_pct_ftp:.7,zone:2}],.7,5400)
  expect(bars).toHaveLength(1)
  expect(bars[0].seconds).toBe(5400)
 })
 it('expands repeated on/off sets without losing recovery time',()=>{
  const bars=sessionBars([{duration_seconds:180,power_target_pct_ftp:1.2,zone:5,reps:3,on_s:15,off_s:45,off_pct_ftp:.45}],1,180)
  expect(bars.map(b=>b.seconds)).toEqual([15,45,15,45,15,45])
  expect(bars.reduce((s,b)=>s+b.seconds,0)).toBe(180)
  expect(mergeBars({bars} as PlanDaySession)).toHaveLength(6)
 })
 it('does not draw fabricated effort when power prescription is unknown',()=>{
  expect(sessionBars([],null,3600)).toEqual([])
 })
 it('joins equal neighbouring blocks while preserving elapsed time',()=>{
  const bars=sessionBars([{duration_seconds:600,power_target_pct_ftp:.7,zone:2},{duration_seconds:1200,power_target_pct_ftp:.7,zone:2}],.7,1800)
  expect(mergeBars({bars} as PlanDaySession).map(b=>b.size)).toEqual([1800])
 })
})
