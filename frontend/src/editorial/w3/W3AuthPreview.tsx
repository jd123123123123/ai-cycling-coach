import { useState } from 'react'
import W3AuthView from './W3AuthView'

/** TEMP preview — no backend. /e/w3-auth-preview toggles login/register.
 *  Remove before merge. */
export default function W3AuthPreview() {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  return (
    <W3AuthView
      vm={{ mode, inviteCode: mode === 'register' ? 'LUCA-7F3' : null, error: null, busy: false }}
      onSubmit={() => {}}
      onSwitch={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
    />
  )
}
