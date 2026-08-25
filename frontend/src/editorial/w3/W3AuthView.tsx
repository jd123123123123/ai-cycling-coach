import { useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Mail, Lock, Eye, EyeOff, Ticket } from 'lucide-react'
import { T, FONT, DISPLAY, MONO, EASE } from './w3tokens'
import { coverIssue } from './w3cover'
import W3StatusBar from './W3StatusBar'
import './w3.css'

/**
 * W3 · AUTH — login + register. Pure function of `vm`; `W3LoginPage` /
 * `W3RegisterPage` wire the REAL `useAuth.login/register`.
 *
 * ── THE SCREEN IS A COVER ──────────────────────────────────────────────
 * This was a black bike, on a black plinth, on a black ground, under a
 * gradient — handsome and completely forgettable, and the first thing anybody
 * ever saw of the app. It now prints like a magazine cover, a new issue every
 * day: one bike, one ink, an issue number and a credit down the spine. See
 * `w3cover.ts` for how an issue is chosen and why it is the DAY rather than a
 * reshuffle on every mount.
 *
 * WHY THIS SCREEN BREAKS THE ONE-GROUND RULE. Every other W3 surface is near
 * black with acid spent sparingly, and it should stay that way: those screens
 * are read by someone mid-training who needs the numbers to come forward. This
 * one is read by someone who is not a rider yet, where the job is the opposite
 * — be unmistakable in the two seconds before a password. So the cover takes a
 * full-bleed colour field and the app's grammar resumes, exactly, one hard edge
 * below it. The edge is hard on purpose: a gradient fade between the two is the
 * timid version of this idea and reads as an image that ran out.
 *
 * ONE INK PER ISSUE. The field, the bike's duotone and the button all take the
 * same colour, so a cover can never turn into a colour scheme. `onField` is the
 * only type colour allowed on top of it.
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
  /** The issue's date. Injected only so a test or a preview can pin a cover;
   *  production never passes it and gets today. */
  now?: Date
}

export default function W3AuthView({ vm, onSubmit, onSwitch, onCodeChange, now }: { vm: W3AuthVm } & W3AuthActions) {
  const reduce = useReducedMotion()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  // Open when the rider has no code from a link — somebody who was told one in
  // a bike shop had nowhere to put it, which is the same as not being invited.
  const [codeOpen, setCodeOpen] = useState(false)
  const isRegister = vm.mode === 'register'
  const valid = /.+@.+\..+/.test(email) && pw.length >= 6

  const issue = coverIssue(now ?? new Date())
  const { field, onField } = issue.plate

  const fieldStyle: CSSProperties = { flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: T.ink, fontFamily: FONT, fontSize: 15, fontWeight: 600 }
  const fieldWrap: CSSProperties = { display: 'flex', gap: 11, alignItems: 'center', height: 54, padding: '0 16px', borderRadius: 16, background: T.surface, border: `1px solid ${T.stroke}` }

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        {/* ── THE COVER ────────────────────────────────────────────────────
             `isolation: isolate` is load-bearing: it keeps the bike's multiply
             blending against the ink field and nothing else on the page. */}
        {/* THE COVER YIELDS, THE FORM DOES NOT. Register carries an invite
             block that login does not, and on a 667 px phone a fixed-height
             cover pushed the button off the bottom of the screen — a sign-up
             screen whose sign-up button is below the fold. The poster takes
             whatever is left after the form has what it needs, never the
             reverse. */}
        <div style={{
          position: 'relative', flex: 'none', isolation: 'isolate', overflow: 'hidden',
          height: isRegister ? 'min(332px, 39vh)' : 'min(410px, 48vh)', background: field,
        }}>

          {/* The masthead is type as architecture — set to bleed off both
              edges, so it reads as a printed cover rather than a logo placed on
              a photo. Decorative: the accessible name of this screen is the
              heading below, and a screen reader announcing "RIDR" first would
              just delay it. */}
          <span aria-hidden style={{
            position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)',
            fontFamily: DISPLAY, fontSize: 'min(46vw, 184px)', lineHeight: 0.82,
            letterSpacing: '-0.015em', whiteSpace: 'nowrap', color: onField,
          }}>RIDR</span>

          {/* THE BIKE, PRINTED IN THE ISSUE'S INK. Every render in
              `public/w3/bikes/` is shot on the same near-white studio ground at
              the same locked drive-side camera, so greyscale + multiply drops
              that ground into the field and leaves the machine as a duotone.
              That is why any of the 26 can carry a cover without its own art —
              and why the masthead reads THROUGH the pale parts of the wheels,
              which is what a real two-colour print does. */}
          <motion.img
            src={issue.bike} alt=""
            initial={reduce ? false : { opacity: 0, y: 14, scale: 1.04 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.85, ease: EASE }}
            style={{
              // FULL COVERAGE IS NOT A CROP CHOICE, IT IS THE TRICK WORKING.
              // The studio ground is a near-white, not a pure one, so multiply
              // darkens it a hair — and the moment any edge of the picture sits
              // inside the field you can see the rectangle it came in. Filling
              // the field completely puts all four edges off-screen: what is
              // left is one even tone across the whole plate, which reads as
              // paper rather than as a pasted photograph.
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center 58%',
              mixBlendMode: 'multiply',
              // Greyscale alone leaves a pale machine that all but vanishes
              // into a saturated field. Pushing contrast and dropping exposure
              // prints it the way a two-colour poster does: the frame goes
              // near-black, the highlights stay open.
              filter: 'grayscale(1) contrast(1.5) brightness(0.9)',
            }} />

          {/* The spine: what this issue is, credited the way a cover credits
              its cover star. The bike name is read off the file that is
              actually on screen, so it cannot describe a different picture. */}
          <span style={{
            position: 'absolute', left: 9, top: 0, bottom: 0, display: 'flex', alignItems: 'center',
            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            fontFamily: MONO, fontSize: 9.5, fontWeight: 500, letterSpacing: 2.2,
            color: onField, opacity: 0.72,
          }}>
            AUSGABE {issue.no} · {issue.plate.name} · {issue.credit}
          </span>

        </div>

        {/* ── THE BLOCK ────────────────────────────────────────────────────
             The app's own grammar, resuming at a hard edge. */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 20px 20px' }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: -1, lineHeight: 1.0, color: T.ink }}>
            {isRegister ? <>Fahr dich<br />aufs Podium<span style={{ color: field }}>.</span></> : <>Zeit für<br />die nächste Runde<span style={{ color: field }}>.</span></>}
          </h1>

          {/* ── THE INVITE ──────────────────────────────────────────────
               A code carried by the link shows as a confirmation; without one
               there is now a way to TYPE it. Both paths end in the same place:
               the code goes to the server with the sign-up, which is what
               actually opens the referral window. */}
          {isRegister && (vm.inviteCode ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 14, background: T.surface, border: `1px solid ${T.stroke}` }}>
              <Ticket size={16} color={field} />
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
                style={{ ...fieldStyle, textTransform: 'uppercase', letterSpacing: 1.5 }}
                type="text" inputMode="text" autoCapitalize="characters" autoComplete="off"
                placeholder="Einladungscode" maxLength={12}
                onChange={(e) => onCodeChange?.(e.target.value.trim() || null)} />
            </div>
          ) : (
            <button type="button" onClick={() => setCodeOpen(true)}
              style={{ alignSelf: 'flex-start', display: 'flex', gap: 8, alignItems: 'center', padding: '4px 2px', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT }}>
              <Ticket size={14} color={T.mid} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.mid }}>Ich habe einen Einladungscode</span>
            </button>
          ))}

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={fieldWrap}>
              <Mail size={17} color={T.mid} />
              <input style={fieldStyle} type="email" inputMode="email" autoComplete="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={fieldWrap}>
              <Lock size={17} color={T.mid} />
              <input style={fieldStyle} type={show ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="Passwort" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button onClick={() => setShow((s) => !s)} aria-label="Passwort anzeigen" style={{ background: 'transparent', border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                {show ? <EyeOff size={16} color={T.quiet} /> : <Eye size={16} color={T.quiet} />}
              </button>
            </div>
          </div>

          {vm.error && <span role="alert" style={{ fontSize: 12, fontWeight: 600, color: T.bad }}>{vm.error}</span>}

          {/* The button prints in the issue's ink — the fourth and last thing
              that does, which is what keeps one ink from becoming a palette. */}
          <button onClick={() => valid && !vm.busy && onSubmit?.(email, pw)} disabled={!valid || vm.busy}
            style={{ height: 56, borderRadius: 100, background: field, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 0 24px', border: 0, cursor: valid && !vm.busy ? 'pointer' : 'default', fontFamily: FONT, opacity: valid && !vm.busy ? 1 : 0.45 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: onField }}>{vm.busy ? 'Moment…' : isRegister ? 'Konto erstellen' : 'Anmelden'}</span>
            <div style={{ width: 40, height: 40, borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={field} /></div>
          </button>

          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: 6, paddingTop: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.quiet }}>{isRegister ? 'Schon dabei?' : 'Noch kein Konto?'}</span>
            <button onClick={onSwitch} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: field }}>
              {isRegister ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
