import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import W3AuthView from './W3AuthView'

/**
 * W3 · REGISTER, wired to the real `useAuth.register`. Route /e/w3-register.
 *
 * The invite: a referral code arrives on the link as `?ref=CODE` (the code a
 * recruiter shares from `api/referral`). It's shown as a chip and persisted to
 * localStorage as the pending referral so the recruiter can be credited — the
 * register payload itself is only {email,password}, so attribution is claimed
 * by the referral system after sign-up (no register-time redeem endpoint yet).
 */

const REFERRAL_KEY = 'w3.referralCode'

function authError(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'Konto konnte nicht erstellt werden. Prüfe deine Angaben.'
}

export default function W3RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The code is EDITABLE, not just displayed. It arrives from the link in the
  // common case, but a rider who was told a code in a bike shop or a group chat
  // had no way to enter it at all — the field simply did not exist.
  const [typedCode, setTypedCode] = useState<string | null>(null)

  // Capture the invite code from the link (and remember it), else re-use a
  // previously captured one.
  const linkCode = useMemo(() => {
    const p = params.get('ref') || params.get('invite')
    if (p) { try { localStorage.setItem(REFERRAL_KEY, p) } catch { /* private mode */ } return p }
    try { return localStorage.getItem(REFERRAL_KEY) } catch { return null }
  }, [params])
  const inviteCode = typedCode ?? linkCode

  const onSubmit = async (email: string, password: string) => {
    setBusy(true); setError(null)
    try {
      // ── THE CODE GOES TO THE SERVER ───────────────────────────────────
      // It used to be written to localStorage and never sent anywhere, so the
      // referral window was never opened and every rider's overview stayed
      // empty — not because they had invited nobody, but because inviting
      // somebody could not be recorded. The one moment the two facts exist
      // together is this request.
      const code = inviteCode?.trim().toUpperCase() || undefined
      await register({ email, password, referral_code: code })
      // The code has done its job; keeping it would re-attribute the next
      // sign-up on this device to the same recruiter.
      try { localStorage.removeItem(REFERRAL_KEY) } catch { /* ignore */ }
      navigate('/e/w3-today')
    } catch (e) {
      setError(authError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <W3AuthView
      vm={{ mode: 'register', inviteCode, error, busy }}
      onSubmit={onSubmit}
      onCodeChange={setTypedCode}
      onSwitch={() => navigate('/e/w3-login')} />
  )
}
