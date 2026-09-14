// @vitest-environment jsdom
import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import W3HeroShell, { useHeroPanel } from '../W3HeroShell'
import type { W3StageVm } from '../W3TodayStage'
const mounts = vi.hoisted(() => ({ count: 0, unmounts: 0 }))
vi.mock('../W3TodayStage', () => ({ STAGE_PLATE:'fixture', default: function Stage() { useEffect(() => { mounts.count++; return () => { mounts.unmounts++ } }, []);return <div data-testid="original-stage">Original bike</div> } }))
vi.mock('../useGroundColour', () => ({ useGroundColour: () => '#0b0b0b' }))
vi.mock('../W3TopBar', () => ({ default: ({title}: {title:string}) => <header>{title}</header> }))
vi.mock('../W3TabBar', () => ({ default: () => null }))
vi.mock('motion/react', () => ({ useReducedMotion:()=>true, AnimatePresence:({children}:{children:React.ReactNode})=><>{children}</>, motion:{ div:({children,...rest}:{children:React.ReactNode;[key:string]:unknown})=>{const props={...rest};for(const key of ['initial','animate','exit','transition'])delete props[key];return <div {...props}>{children}</div>} } }))
function Content() {const {portal}=useHeroPanel(<div>Season dock</div>);return <>{portal}<div>Latest ride</div></>}
function TestShell(){const navigate=useNavigate();return <><button onClick={()=>navigate('/e/w3-rides')}>Rides</button><button onClick={()=>navigate('/e/w3-today')}>Today</button><button onClick={()=>navigate('/e/w3-garage')}>Garage</button><W3HeroShell vm={{} as W3StageVm}><Content/></W3HeroShell></>}
beforeEach(()=>{mounts.count=0;mounts.unmounts=0})
afterEach(cleanup)
describe('rides archive shell',()=>{
 it('keeps the original stage mounted across Today → Rides → Garage',()=>{
  render(<MemoryRouter initialEntries={['/e/w3-today']}><TestShell/></MemoryRouter>)
  const stage=screen.getByTestId('original-stage');expect(mounts.count).toBe(1)
  fireEvent.click(screen.getByText('Rides',{exact:true}))
  expect(screen.getByTestId('original-stage')).toBe(stage)
  expect(stage.parentElement?.style.display).toBe('none')
  expect(screen.getByRole('banner').textContent).toBe('Fahrten')
  expect(screen.getByText('Season dock')).toBeTruthy();expect(screen.getByText('Latest ride')).toBeTruthy()
  expect(stage.parentElement?.parentElement?.style.height).toBe('auto')
  fireEvent.click(screen.getByText('Garage',{exact:true}))
  expect(stage.parentElement?.style.display).toBe('contents')
  expect(screen.queryByRole('banner')).toBeNull()
  expect(mounts.count).toBe(1);expect(mounts.unmounts).toBe(0)
 })
 it('uses only the compact header when initially entering Rides',()=>{
  render(<MemoryRouter initialEntries={['/e/w3-rides']}><TestShell/></MemoryRouter>)
  expect(screen.getByRole('banner').textContent).toBe('Fahrten')
  expect(screen.getByTestId('original-stage').parentElement?.parentElement?.style.height).toBe('auto')
 })
})
