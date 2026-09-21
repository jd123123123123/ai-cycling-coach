import {afterEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent} from '@testing-library/react'
import W3RideDetailView,{type W3RideVm} from '../W3RideDetailView'
vi.mock('../W3StatusBar',()=>({default:()=>null}))
vi.mock('../W3TopBar',()=>({default:()=>null}))
vi.mock('../W3RideMapHero',()=>({default:()=>null}))
afterEach(cleanup)
const vm={hero:{dateLine:'12.08.2026 · 16:53',sceneImage:null},stats:[{l:'TSS',v:'92',s:'Berechnet'}],ranks:[{durationSeconds:300,dur:'5 MIN',watts:'342 W',bestWatts:'335 W',wattsValue:342,bestWattsValue:335,pr:true,note:'+7 W',fill:1}],zones:[{z:'2',name:'Ausdauer',min:'35 min',pct:100,peak:true}],shifts:[],moved:[{label:'Distanz',value:'4.812 km',delta:'+54 km',goal:'',pct:0,beforePct:0}],movedFoot:'Bis zum Tag der Fahrt.',repeats:[],verdictBody:'',power:[]} as unknown as W3RideVm

describe('Editorial ride evidence',()=>{
 it('has a keyboard-selectable evidence panel and keeps goal-less totals factual',()=>{
  render(<W3RideDetailView vm={vm}/>);
  const best=screen.getByRole('tab',{name:'Bestwerte'});
  best.focus();fireEvent.keyDown(best,{key:'End'});
  expect(screen.getByRole('tab',{name:'Jahr'}).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByText('4.812 km')).toBeTruthy();
  expect(screen.queryByText(/12.?000/)).toBeNull();
  expect(screen.queryByText('Wirkung')).toBeNull();
 });
 it('preserves decimal watt measurements and the measured difference',()=>{
  render(<W3RideDetailView vm={{...vm,ranks:[{...vm.ranks[0],watts:'299.5 W',bestWatts:'300 W',wattsValue:299.5,bestWattsValue:300,pr:false}]}}/>);
  expect(screen.getByRole('img',{name:/299,5 Watt gefahren, bisher 300 Watt/})).toBeTruthy();
  expect(screen.getByText('-0,5')).toBeTruthy();
 });
 it('compares records on one zero-based power axis with selectable durations',()=>{
  render(<W3RideDetailView vm={{...vm,ranks:[{...vm.ranks[0],durationSeconds:5,dur:'5 SEK',wattsValue:1000,bestWattsValue:1100,pr:false},...vm.ranks]}}/>);
  expect(screen.getByRole('img',{name:/Leistungskurve ab null Watt.*342 Watt gefahren/})).toBeTruthy();
  expect(screen.getByText('+7')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'5 sek'}));
  expect(screen.getByRole('img',{name:/5 SEK: 1.000 Watt gefahren, bisher 1.100 Watt/})).toBeTruthy();
  expect(screen.getByText('-100')).toBeTruthy();
  expect(screen.getByText('Weitere Messwerte').closest('details')?.open).toBe(false);
 });
 it('does not repeat the zone analysis when the training review already owns it',()=>{
  render(<W3RideDetailView vm={vm} trainingReview={<div>Training review</div>}/>);
  expect(screen.queryByRole('tab',{name:'Zonen'})).toBeNull();
 });
});
