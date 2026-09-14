import React from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import W3PlanView from '../editorial/w3/W3PlanView'
import W3PlanEmptyView from '../editorial/w3/W3PlanEmptyView'
import PlanConcept from './PlanConcept'
import {beforeVm} from './data'
import './plan.css'
const p = new URLSearchParams(location.search)
const queryClient=new QueryClient({defaultOptions:{queries:{enabled:false,retry:false}}})
function Preview(){
 if(p.has('before'))return p.get('state')==='empty'?<W3PlanEmptyView vm={{rides:41,hours:63,tss:3120,since:'seit 1. Januar'}} onBack={()=>history.back()} onStart={()=>{}} onBuilder={()=>{}} onImport={()=>{}}/>:<W3PlanView vm={beforeVm}/>
 return <PlanConcept initial={p.get('state')??'active'}/>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/e/w3-plan-preview']}><Preview/></MemoryRouter></QueryClientProvider></React.StrictMode>)
