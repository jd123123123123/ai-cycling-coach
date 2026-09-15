import {useState} from 'react'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import Auth,{type W3AuthVm} from '../W3AuthView'
afterEach(cleanup)
const vm:W3AuthVm={mode:'login',inviteCode:null,error:null,busy:false}
function credentials(password='password8'){
 fireEvent.change(screen.getByLabelText('E-Mail'),{target:{value:'rider@example.com'}})
 fireEvent.change(screen.getByLabelText('Passwort'),{target:{value:password}})
}
describe('auth forms',()=>{
 it('submits the real form and preserves password bytes and autofill semantics',async()=>{
  const submit=vi.fn().mockResolvedValue(undefined);render(<Auth vm={vm} onSubmit={submit}/>);credentials(' password8 ')
  fireEvent.submit(screen.getByRole('form',{name:'Anmelden'}))
  await waitFor(()=>expect(submit).toHaveBeenCalledWith('rider@example.com',' password8 '))
  expect(screen.getByLabelText('E-Mail').getAttribute('autocomplete')).toBe('email')
  expect(screen.getByLabelText('Passwort',{exact:true}).getAttribute('autocomplete')).toBe('current-password')
 })
 it('matches registration minimum without rejecting existing shorter login passwords',()=>{
  const result=render(<Auth vm={{...vm,mode:'register'}}/>);credentials('1234567')
  expect((screen.getByRole('button',{name:'Konto erstellen'}) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByLabelText('Passwort',{exact:true}).getAttribute('autocomplete')).toBe('new-password')
  fireEvent.change(screen.getByLabelText('Passwort',{exact:true}),{target:{value:'12345678'}})
  expect((screen.getByRole('button',{name:'Konto erstellen'}) as HTMLButtonElement).disabled).toBe(false)
  result.rerender(<Auth vm={vm}/>);credentials('short')
  expect((screen.getByRole('button',{name:'Anmelden'}) as HTMLButtonElement).disabled).toBe(false)
 })
 it('keeps the referral editor mounted while the wrapper updates the code',()=>{
  function Editable(){const [code,setCode]=useState<string|null>('FROM-LINK');return <Auth vm={{...vm,mode:'register',inviteCode:code}} onCodeChange={setCode}/>}
  render(<Editable/>);fireEvent.click(screen.getByRole('button',{name:/Einladungscode FROM-LINK ändern/}))
  const input=screen.getByLabelText('Einladungscode · optional')
  for(const code of ['N','NE','NEWCODE'])fireEvent.change(input,{target:{value:code}})
  expect((screen.getByLabelText('Einladungscode · optional') as HTMLInputElement).value).toBe('NEWCODE')
 })
 it('preserves errors and fields while busy; blocks duplicate submit and switching',async()=>{
  let finish!:()=>void
  const submit=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve})),switchMode=vi.fn()
  const result=render(<Auth vm={vm} onSubmit={submit} onSwitch={switchMode}/>);credentials()
  fireEvent.submit(screen.getByRole('form'));fireEvent.submit(screen.getByRole('form'))
  expect(submit).toHaveBeenCalledOnce();finish()
  result.rerender(<Auth vm={{...vm,busy:true,error:'Verbindung unterbrochen'}} onSubmit={submit} onSwitch={switchMode}/>)
  fireEvent.click(screen.getByRole('button',{name:'Konto erstellen'}));fireEvent.submit(screen.getByRole('form'))
  expect(switchMode).not.toHaveBeenCalled();expect(submit).toHaveBeenCalledOnce()
  expect(screen.getByRole('alert').textContent).toBe('Verbindung unterbrochen')
  expect((screen.getByLabelText('Passwort',{exact:true}) as HTMLInputElement).value).toBe('password8')
 })
 it('toggles password visibility without submitting',()=>{
  const submit=vi.fn();render(<Auth vm={vm} onSubmit={submit}/>);credentials()
  fireEvent.click(screen.getByRole('button',{name:'Passwort anzeigen'}))
  expect(screen.getByLabelText('Passwort',{exact:true}).getAttribute('type')).toBe('text')
  expect(screen.getByRole('button',{name:'Passwort verbergen'}).getAttribute('aria-pressed')).toBe('true')
  expect(submit).not.toHaveBeenCalled()
 })
 it('keeps the auth entry focused without scene thumbnails',()=>{
  const result=render(<Auth vm={{...vm,mode:'register'}}/>)
  expect(screen.queryAllByRole('img',{name:/Kulissen-Vorschau/})).toHaveLength(0)
  expect(screen.getByText(/Versteh dein Training/)).toBeTruthy()
  result.rerender(<Auth vm={vm}/>);expect(screen.queryAllByRole('img',{name:/Kulissen-Vorschau/})).toHaveLength(0)
 })
})
