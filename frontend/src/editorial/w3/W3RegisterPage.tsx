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

  // Capture the invite code from the link (and remember it), else re-use a
  // previously captured one.
  const inviteCode = useMemo(() => {
    const p = params.get('ref') || params.get('invite')
    if (p) { try { localStorage.setItem(REFERRAL_KEY, p) } catch { /* private mode */ } return p }
    try { return localStorage.getItem(REFERRAL_KEY) } catch { return null }
  }, [params])

  const onSubmit = async (email: string, password: string) => {
    setBusy(true); setError(null)
    try {
      await register({ email, password })
      // Keep the pending referral for the post-sign-up attribution flow.
      if (inviteCode) { try { localStorage.setItem(REFERRAL_KEY, inviteCode) } catch { /* ignore */ } }
      navigate('/e/w3-today')
    } catch (e) {
      setError(authError(e))
    } finally {
      setBusy(false)
    }
  }

  return <W3AuthView vm={{ mode: 'register', inviteCode, error, busy }} onSubmit={onSubmit} onSwitch={() => navigate('/e/w3-login')} />
}
