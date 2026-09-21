import {afterEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent} from '@testing-library/react'
import W3RideDetailView,{type W3RideVm} from '../W3RideDetailView'
vi.mock('../W3StatusBar',()=>({default:()=>null}))
vi.mock('../W3TopBar',()=>({default:()=>null}))
vi.mock('../W3RideMapHero',()=>({default:()=>null}))
afterEach(cleanup)
const vm={hero:{dateLine:'12.08.2026 · 16:53',sceneImage:null},stats:[{l:'TSS',v:'92',s:'Berechnet'}],ranks:[{dur:'5 MIN',watts:'342 W',bestWatts:'335 W',wattsValue:342,bestWattsValue:335,pr:true,note:'+7 W',fill:1}],zones:[{z:'2',name:'Ausdauer',min:'35 min',pct:100,peak:true}],shifts:[],moved:[{label:'Distanz',value:'4.812 km',delta:'+54 km',goal:'',pct:0,beforePct:0}],movedFoot:'Bis zum Tag der Fahrt.',repeats:[],verdictBody:'',power:[]} as unknown as W3RideVm

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
 it('preserves decimal watt measurements on comparison bars',()=>{
  render(<W3RideDetailView vm={{...vm,ranks:[{...vm.ranks[0],watts:'299.5 W',bestWatts:'300 W',wattsValue:299.5,bestWattsValue:300,pr:false}]}}/>);
  const bar=screen.getByRole('img',{name:/299.5 W gefahren/}).querySelector('i');
  expect(parseFloat(bar!.style.width)).toBeCloseTo(299.5/300*100,2);
 });
 it('compares records on a zero-based scale and does not invent a coach score',()=>{
  render(<W3RideDetailView vm={vm}/>);
  const graph=screen.getByRole('img',{name:/Balken beginnt bei null/});
  expect(graph.querySelector('i')?.style.width).toBe('100%');
  expect(parseFloat(graph.querySelector('b')!.style.left)).toBeCloseTo(335/342*100,2);
  expect(screen.queryByText(/Ausführung|COACH-READ|LIVE AUS/)).toBeNull();
  expect(screen.getByText('Weitere Messwerte').closest('details')?.open).toBe(false);
 });
});
