import { useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Mail, Lock, Eye, EyeOff, Ticket, Bike } from 'lucide-react'
import { T, FONT, EASE, Kicker } from './w3tokens'
import { STARTER_BIKE } from './starterBike'
import W3StatusBar from './W3StatusBar'
import './w3.css'

/**
 * W3 · AUTH — login + register in the W3 dopamine style. Pure function of `vm`;
 * `W3LoginPage` / `W3RegisterPage` wire the REAL `useAuth.login/register`.
 *
 * Register carries the invite: an `inviteCode` captured from the referral link
 * (`?ref=CODE`) is shown as a chip and travels with the sign-up so the recruiter
 * gets credited (referral system = a shared code, `api/referral`).
 */

export interface W3AuthVm { mode: 'login' | 'register'; inviteCode: string | null; error: string | null; busy: boolean }
export interface W3AuthActions {
  onSubmit?: (email: string, password: string) => void | Promise<void>
  onSwitch?: () => void
  /** A code the rider TYPED, rather than one carried by the link. Null clears
   *  it back to whatever the link said. */
  onCodeChange?: (code: string | null) => void
}

export default function W3AuthView({ vm, onSubmit, onSwitch, onCodeChange }: { vm: W3AuthVm } & W3AuthActions) {
  const reduce = useReducedMotion()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  // Open when the rider has no code from a link — somebody who was told one in
  // a bike shop had nowhere to put it, which is the same as not being invited.
  const [codeOpen, setCodeOpen] = useState(false)
  const isRegister = vm.mode === 'register'
  const valid = /.+@.+\..+/.test(email) && pw.length >= 6

  const field: CSSProperties = { flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: T.ink, fontFamily: FONT, fontSize: 15, fontWeight: 600 }
  const fieldWrap: CSSProperties = { display: 'flex', gap: 11, alignItems: 'center', height: 54, padding: '0 16px', borderRadius: 16, background: T.surface, border: `1px solid ${T.stroke}` }

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        {/* Hero — bike + acid bloom */}
        <div style={{ position: 'relative', height: 240, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: 300, height: 160, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}2E, transparent)` }} />
          <motion.img src={STARTER_BIKE} alt="" initial={reduce ? false : { opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: EASE }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 44%' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 140, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
          <div style={{ position: 'absolute', top: 16, left: 20, display: 'flex', gap: 7, alignItems: 'center', padding: '7px 12px 7px 10px', borderRadius: 100, background: '#000000A6' }}>
            <Bike size={13} color={T.acid} /><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.ink }}>w3.ride</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 20px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Kicker>{isRegister ? 'Konto erstellen' : 'Willkommen zurück'}</Kicker>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1, lineHeight: 1.0, color: T.ink }}>
              {isRegister ? <>Fahr dich<br />aufs Podium<span style={{ color: T.acid }}>.</span></> : <>Zeit für<br />die nächste Runde<span style={{ color: T.acid }}>.</span></>}
            </span>
          </div>

          {/* ── THE INVITE ──────────────────────────────────────────────
               A code carried by the link shows as a confirmation; without one
               there is now a way to TYPE it. Both paths end in the same place:
               the code goes to the server with the sign-up, which is what
               actually opens the referral window. */}
          {isRegister && (vm.inviteCode ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 14, background: T.acidDim, border: `1px solid ${T.acid}33` }}>
              <Ticket size={16} color={T.acid} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Einladung aktiv · Code {vm.inviteCode}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>Wer dich eingeladen hat, bekommt einen Anteil deiner ersten Wochen.</span>
              </div>
              <button type="button" onClick={() => { onCodeChange?.(null); setCodeOpen(true) }}
                aria-label="Code ändern"
                style={{ flex: 'none', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 11, fontWeight: 700, color: T.mid }}>
                ändern
              </button>
            </div>
          ) : codeOpen ? (
            <div style={fieldWrap}>
              <Ticket size={17} color={T.mid} />
              <input
                style={{ ...field, textTransform: 'uppercase', letterSpacing: 1.5 }}
                type="text" inputMode="text" autoCapitalize="characters" autoComplete="off"
                placeholder="Einladungscode" maxLength={12}
                onChange={(e) => onCodeChange?.(e.target.value.trim() || null)} />
            </div>
          ) : (
            <button type="button" onClick={() => setCodeOpen(true)}
              style={{ alignSelf: 'flex-start', display: 'flex', gap: 8, alignItems: 'center', padding: '8px 2px', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT }}>
              <Ticket size={14} color={T.mid} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.mid }}>Ich habe einen Einladungscode</span>
            </button>
          ))}

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={fieldWrap}>
              <Mail size={17} color={T.mid} />
              <input style={field} type="email" inputMode="email" autoComplete="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={fieldWrap}>
              <Lock size={17} color={T.mid} />
              <input style={field} type={show ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="Passwort" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button onClick={() => setShow((s) => !s)} aria-label="Passwort anzeigen" style={{ background: 'transparent', border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                {show ? <EyeOff size={16} color={T.quiet} /> : <Eye size={16} color={T.quiet} />}
              </button>
            </div>
          </div>

          {vm.error && <span style={{ fontSize: 12, fontWeight: 600, color: T.bad }}>{vm.error}</span>}

          <button onClick={() => valid && !vm.busy && onSubmit?.(email, pw)} disabled={!valid || vm.busy}
            style={{ height: 56, borderRadius: 100, background: T.acid, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 0 24px', border: 0, cursor: valid && !vm.busy ? 'pointer' : 'default', fontFamily: FONT, opacity: valid && !vm.busy ? 1 : 0.5 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: T.bg }}>{vm.busy ? 'Moment…' : isRegister ? 'Konto erstellen' : 'Anmelden'}</span>
            <div style={{ width: 40, height: 40, borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={T.acid} /></div>
          </button>

          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: 6, paddingTop: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.quiet }}>{isRegister ? 'Schon dabei?' : 'Noch kein Konto?'}</span>
            <button onClick={onSwitch} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: T.acid }}>
              {isRegister ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
