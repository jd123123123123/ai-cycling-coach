import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useGrantOnboarding } from '../../hooks/useWallet'
import { updateUser } from '../../api/auth'
import { SHOWCASE_RIDER } from './showcaseRider'
import W3AvatarOnboardView from './W3AvatarOnboardView'

/**
 * W3 · Avatar onboarding, wired. Route /e/w3-avatar-onboard.
 *
 * The onboarding "bring yourself into it" step. Picking a photo uploads it as
 * the rider's avatar (PATCH /users/me), fires the equal 125 RC photo grant
 * (idempotent server-side — the head start every rider gets), then advances to
 * the starter bike. Skipping advances without the grant, so it's genuinely
 * optional. The uploaded selfie becomes the avatar today; turning it into the
 * generated figurine (services/cyclr_studio) is the follow-on enhancement.
 */
const NEXT = '/e/w3-first-bike'

export default function W3AvatarOnboardPage() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const grant = useGrantOnboarding()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onPick = () => inputRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(r.error)
        r.readAsDataURL(file)
      })
      await updateUser({ avatar_url: dataUri })
      await refreshUser()
      // Grant lands only once the avatar actually exists (server re-checks).
      await grant.mutateAsync('photo').catch(() => {})
      navigate(NEXT)
    } catch {
      // A failed upload shouldn't trap the rider in onboarding.
      navigate(NEXT)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFile}
        disabled={busy}
      />
      <W3AvatarOnboardView
        heroImageUrl={user?.avatar_url ?? SHOWCASE_RIDER}
        onPick={onPick}
        onSkip={() => navigate(NEXT)}
      />
    </>
  )
}
