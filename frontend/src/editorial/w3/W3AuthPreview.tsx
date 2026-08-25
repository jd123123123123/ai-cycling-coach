import { useState } from 'react'
import W3AuthView from './W3AuthView'

/** TEMP preview — no backend. /e/w3-auth-preview toggles login/register.
 *  `?d=YYYY-MM-DD` pins the cover's issue, so any plate in the series can be
 *  looked at without waiting for its day to come round. */
export default function W3AuthPreview() {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const pinned = new URLSearchParams(window.location.search).get('d')
  const now = pinned ? new Date(`${pinned}T09:00:00`) : undefined
  return (
    <W3AuthView
      vm={{ mode, inviteCode: mode === 'register' ? 'LUCA-7F3' : null, error: null, busy: false }}
      onSubmit={() => {}}
      onSwitch={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
      now={now}
    />
  )
}
