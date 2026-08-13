import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import W3AuthView from './W3AuthView'

/** W3 · LOGIN, wired to the real `useAuth.login`. Route /e/w3-login. */

function authError(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'E-Mail oder Passwort stimmt nicht. Versuch es nochmal.'
}

export default function W3LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (email: string, password: string) => {
    setBusy(true); setError(null)
    try {
      await login(email, password)
      navigate('/e/w3-today')
    } catch (e) {
      setError(authError(e))
    } finally {
      setBusy(false)
    }
  }

  return <W3AuthView vm={{ mode: 'login', inviteCode: null, error, busy }} onSubmit={onSubmit} onSwitch={() => navigate('/e/w3-register')} />
}
