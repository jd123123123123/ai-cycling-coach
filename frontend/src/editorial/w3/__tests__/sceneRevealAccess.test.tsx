// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {SceneCollectionView} from '../W3SceneCollection'
import type {StageCard} from '../../../api/stageGallery'
vi.mock('../W3RewardCase',()=>({default:({onOpen}:{onOpen:()=>void})=><button onClick={onOpen}>Kiste öffnen</button>}))
vi.mock('../W3SceneDevelop',()=>({default:()=>null}))
beforeEach(()=>{
 window.matchMedia=vi.fn().mockReturnValue({matches:true,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()})
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
})
afterEach(cleanup)
it('announces the reward after reduced-motion reveal without claiming measured rain duration',async()=>{
 const stage:StageCard={id:'waschanlage',name_de:'Die Waschanlage',unlock_de:'Fahrt über 2 Stunden mit Regen',owned:true,starter:false,render_status:'ok',image:'/bike.webp',plate_url:'/scene.webp',tier:'ernsthaft',selected:false,unlocked_at:null,activity_id:1,progress:null}
 render(<SceneCollectionView data={{stages:[stage],owned_count:1,total_count:1}} bike={null} onSelect={async()=>{}} reveal revealOnly/>)
 fireEvent.click(await screen.findByRole('button',{name:'Kulisse enthüllen'}))
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Kulisse freigeschaltet. Fahrt über 2 Stunden mit Regen'))
 expect(screen.getByText('Fahrt mit Regen')).toBeTruthy()
 expect(screen.queryByText('im Regen gefahren')).toBeNull()
 expect(screen.getByRole('button',{name:'Als Hintergrund setzen'})).toBeTruthy()
})
