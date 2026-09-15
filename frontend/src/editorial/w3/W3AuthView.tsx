import { useId, useRef, useState } from 'react'
import { ArrowRight, Eye, EyeOff, Ticket } from 'lucide-react'
import RidrMark, { RIDR_LIME } from '../../components/RidrMark'
import './w3.css'
import './w3Auth.css'

export interface W3AuthVm { mode: 'login' | 'register'; inviteCode: string | null; error: string | null; busy: boolean }
export interface W3AuthActions {
  onSubmit?: (email: string, password: string) => void | Promise<void>
  onSwitch?: () => void
  /** Null restores the referral captured by the existing register wrapper. */
  onCodeChange?: (code: string | null) => void
  /** Retained for existing preview callers; this view no longer rotates covers. */
  now?: Date
}
/** Presentation only. The existing wrappers own authentication, referral
 * validation, errors and navigation; no credentials are persisted here. */
export default function W3AuthView({ vm, onSubmit, onSwitch, onCodeChange }: { vm: W3AuthVm } & W3AuthActions) {
  const id = useId(), submitting = useRef(false)
  const [email, setEmail] = useState(''), [pw, setPw] = useState('')
  const [show, setShow] = useState(false), [codeOpen, setCodeOpen] = useState(false)
  const [codeDraft, setCodeDraft] = useState(vm.inviteCode ?? '')
  const isRegister = vm.mode === 'register'
  // Register mirrors the server's eight-character minimum. Login must allow
  // any existing password and leave credential decisions to the server.
  const valid = email.trim().length > 0 && pw.length >= (isRegister ? 8 : 1)
  const errorId = `${id}-error`, passwordHelpId = `${id}-password-help`
  return <main className={`w3-root w3-auth ${isRegister ? 'w3-auth-register' : 'w3-auth-login'}`}>
    <div className="w3-frame w3-auth-frame">
      <section className="w3-auth-hero" aria-labelledby={`${id}-title`}>
        <img className="w3-auth-photo" src="/w3/morning/switzerland.jpg" alt="" fetchPriority="high" />
        <div className="w3-auth-photo-shade" />
        <div className="w3-auth-brand"><RidrMark size={34} color={RIDR_LIME} /><span>RIDR</span></div>
        <div className="w3-auth-heading">
          <h1 id={`${id}-title`}>{isRegister ? <>Jede Fahrt kann <br />mehr werden<span>.</span></> : <>Deine nächste <br />Runde wartet<span>.</span></>}</h1>
          {!isRegister && <p>Willkommen zurück.</p>}
        </div>
      </section>
      <div className="w3-auth-content">
        {isRegister && <section className="w3-auth-value" aria-label="Was dich bei RIDR erwartet">
          <p>Versteh dein Training. Gestalte dein Bike.<br />Fahr dir neue Kulissen frei.</p>
        </section>}
        <form className="w3-auth-form" aria-label={isRegister ? 'Konto erstellen' : 'Anmelden'} aria-busy={vm.busy} onSubmit={async event => {
          event.preventDefault()
          if (!valid || vm.busy || submitting.current) return
          submitting.current = true
          try { await onSubmit?.(email.trim(), pw) } finally { submitting.current = false }
        }}>
          <label className="w3-auth-field" htmlFor={`${id}-email`}><span>E-Mail</span>
            <input id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={event => setEmail(event.target.value)} readOnly={vm.busy} aria-describedby={vm.error ? errorId : undefined} />
          </label>
          <label className="w3-auth-field" htmlFor={`${id}-password`}><span>Passwort</span><div>
            <input id={`${id}-password`} name="password" type={show ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} required value={pw} onChange={event => setPw(event.target.value)} readOnly={vm.busy} aria-describedby={[isRegister ? passwordHelpId : '', vm.error ? errorId : ''].filter(Boolean).join(' ') || undefined} />
            <button className="w3-auth-eye" type="button" onClick={() => setShow(value => !value)} aria-label={show ? 'Passwort verbergen' : 'Passwort anzeigen'} aria-pressed={show}>{show ? <EyeOff size={19} /> : <Eye size={19} />}</button>
          </div></label>
          {isRegister && <span className="w3-auth-password-help" id={passwordHelpId}>Mindestens 8 Zeichen</span>}
          {isRegister && <div className="w3-auth-referral">
            {codeOpen ? <label className="w3-auth-field" htmlFor={`${id}-code`}><span>Einladungscode · optional</span><input id={`${id}-code`} name="referral_code" type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={12} value={codeDraft} readOnly={vm.busy} onChange={event => { setCodeDraft(event.target.value); onCodeChange?.(event.target.value.trim() || null) }} /></label> :
              <button type="button" disabled={vm.busy} className="w3-auth-code-button" aria-label={vm.inviteCode ? `Einladungscode ${vm.inviteCode} ändern` : 'Einladungscode hinzufügen'} onClick={() => { setCodeDraft(vm.inviteCode ?? ''); setCodeOpen(true) }}><Ticket size={16} /><span>{vm.inviteCode ? <>Einladung: <strong>{vm.inviteCode}</strong></> : 'Einladungscode hinzufügen'}</span>{vm.inviteCode && <span>Ändern</span>}</button>}
          </div>}
          {vm.error && <p className="w3-auth-error" role="alert" id={errorId}>{vm.error}</p>}
          <button className="w3-auth-submit" type="submit" disabled={!valid || vm.busy}><span>{vm.busy ? 'Moment …' : isRegister ? 'Konto erstellen' : 'Anmelden'}</span><ArrowRight size={21} /></button>
        </form>
        <div className="w3-auth-switch"><span>{isRegister ? 'Schon dabei?' : 'Neu bei RIDR?'}</span><button type="button" disabled={vm.busy} onClick={onSwitch}>{isRegister ? 'Anmelden' : 'Konto erstellen'}</button></div>
      </div>
    </div>
  </main>
}
