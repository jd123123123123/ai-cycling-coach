import {afterEach,describe,it,expect} from 'vitest'
import {cleanup,render,screen,fireEvent} from '@testing-library/react'
import W3RideBestEfforts from '../W3RideBestEfforts'
import type {W3Rank} from '../rideAtelierTypes'
afterEach(cleanup)
const rank:W3Rank={durationSeconds:300,dur:'5 MIN',watts:'342 W',bestWatts:'335 W',wattsValue:342,bestWattsValue:335,pr:true,note:'+7 W',fill:1}
describe('Recorded ride best efforts',()=>{
 it('preserves decimal watt measurements and the measured difference',()=>{
  render(<W3RideBestEfforts ranks={[{...rank,watts:'299.5 W',bestWatts:'300 W',wattsValue:299.5,bestWattsValue:300,pr:false}]}/>);
  expect(screen.getByRole('img',{name:/299,5 Watt gefahren, bisher 300 Watt/})).toBeTruthy();
  expect(screen.getByText('-0,5')).toBeTruthy();
 });
 it('compares durations on the same zero-based power axis',()=>{
  render(<W3RideBestEfforts ranks={[{...rank,durationSeconds:5,dur:'5 SEK',wattsValue:1000,bestWattsValue:1100,pr:false},rank]}/>);
  expect(screen.getByRole('img',{name:/Leistungskurve ab null Watt.*342 Watt gefahren/})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'5 sek'}));
  expect(screen.getByRole('img',{name:/5 SEK: 1.000 Watt gefahren, bisher 1.100 Watt/})).toBeTruthy();
  expect(screen.getByText('-100')).toBeTruthy();
 });
})
