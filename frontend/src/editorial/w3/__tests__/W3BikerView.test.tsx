import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import W3BikerView, { type W3BikerVm } from '../W3BikerView'
import { highlightRecords } from '../w3RiderRecords'
vi.mock('../W3TopBar', () => ({ default: () => null }))
vi.mock('../W3TabBar', () => ({ default: () => null }))
afterEach(cleanup)
const vm: W3BikerVm = {
 rider: { avatarUrl:null,handle:'Alex',role:'',pills:[],tier:{label:'Level —',pct:0,note:''},milestone:null,records:[],badges:null },
 coin:null,referral:null,devices:[{name:'Garmin',sub:'Status nicht verfügbar',icon:'watch',on:false}],
}
const season=[{label:'Kilometer',value:'100',unit:'km',note:null},{label:'Fahrten',value:'3',note:null}]
describe('W3 profile review',()=>{
 it('distinguishes loading and failure from an empty season',()=>{
  const {rerender}=render(<W3BikerView vm={vm} seasonState="loading"/>)
  expect(screen.getByRole('status').textContent).toContain('wird geladen')
  expect(screen.queryByText('0')).toBeNull()
  rerender(<W3BikerView vm={vm} seasonState="error"/>)
  expect(screen.getByRole('status').textContent).toContain('nicht geladen')
  expect(screen.queryByText('Deine nächste Fahrt macht den Anfang.')).toBeNull()
 })
 it('keeps a power-meter-free season complete without pretending a level',()=>{
  render(<W3BikerView vm={vm} season={season}/>)
  expect(screen.getByText('100')).toBeTruthy()
  expect(screen.queryByText(/FTP|Level 1|0 %|von 0/)).toBeNull()
 })
 it('opens the actual device destination and preserves status errors',()=>{
  const onDevice=vi.fn()
  render(<W3BikerView vm={vm} onDevice={onDevice}/>)
  fireEvent.click(screen.getByRole('button',{name:'Garmin Status nicht verfügbar'}))
  expect(onDevice).toHaveBeenCalledWith('Garmin')
  expect(screen.queryByText('Nicht verbunden')).toBeNull()
 })
 it('lets a rider inspect a month and return to the season total',()=>{
  render(<W3BikerView vm={vm} season={season} seasonBuckets={[{start:'2026-01-01',km:20,rides:1,elevation_m:100,hours:1},{start:'2026-02-01',km:80,rides:2,elevation_m:400,hours:3}]}/>)
  fireEvent.click(screen.getByRole('button',{name:/Jan.*: 20 km kumuliert/}))
  expect(screen.getByRole('button',{name:/Jan.*: 20 km kumuliert/}).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByText('20')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Gesamte Saison'}))
  expect(screen.getByText('100')).toBeTruthy()
 })
 it('preserves lifetime record year and activity id for a real ride link',()=>{
  const records=highlightRecords({longest_ride_km:{key:'longest_ride_km',value:123,unit:'km',activity_id:42,title:'Alte Ausfahrt',at:'2021-05-04T12:00:00Z'}})
  expect(records[0].when).toContain('2021')
  expect(records[0].activityId).toBe(42)
  const onRecord=vi.fn()
  render(<W3BikerView vm={{...vm,rider:{...vm.rider,records}}} onRecord={onRecord}/>)
  fireEvent.click(screen.getByRole('button',{name:'Rekordfahrt ansehen'}))
  expect(onRecord).toHaveBeenCalledWith('longest_ride_km')
 })
 it('does not promise a ride destination without an activity id',()=>{
  render(<W3BikerView vm={{...vm,rider:{...vm.rider,records:[{key:'longest_ride_km',value:'123',unit:'km',label:'LÄNGSTE FAHRT',ride:null,when:null}]}}} onRecord={vi.fn()}/>)
  expect(screen.queryByRole('button',{name:'Rekordfahrt ansehen'})).toBeNull()
 })
 it('explains CTL on demand without adding another permanent text block',()=>{
  render(<W3BikerView vm={vm} season={[...season,{label:'FTP',value:'292',unit:'W',note:null}]} curve={{value:50,delta:2,series:[44,46,48,50],months:['Juni','September']}}/>)
  fireEvent.click(screen.getByRole('button',{name:'Deine Form FTP 292 W'}))
  expect(screen.queryByText(/CTL schätzt deine längerfristige/)).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Trainingsbelastung erklären'}))
  expect(screen.getByText(/nicht automatisch bessere Fitness/)).toBeTruthy()
 })
 it('keeps the old coach selection and makes a save failure explicit',()=>{
  const onSet=vi.fn()
  render(<W3BikerView vm={vm} voice={{value:'kumpel',busy:false,error:'Speichern fehlgeschlagen',onSet}}/>)
  fireEvent.click(screen.getByRole('button',{name:'Coach-Stimme Kumpel'}))
  fireEvent.click(screen.getByRole('button',{name:'Sachlich'}))
  expect(onSet).toHaveBeenCalledWith('sachlich')
  expect(screen.getByRole('button',{name:'Kumpel'}).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('alert').textContent).toBe('Speichern fehlgeschlagen')
 })
})
