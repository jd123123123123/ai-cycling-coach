import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useGrantOnboarding } from '../../hooks/useWallet'
import { updateUser } from '../../api/auth'
import { apiClient } from '../../api/client'
import { SHOWCASE_RIDER } from './showcaseRider'
import W3AvatarOnboardView, { type AvatarStage } from './W3AvatarOnboardView'

/**
 * W3 · Avatar onboarding, wired to the LLM pipeline. Route /e/w3-avatar-onboard.
 *
 * The photo runs through `POST /garage/asset/render` (kind:'rider' → the
 * `services/cyclr_studio` analyse-then-render pipeline): the vision pass reads
 * the rider, the image model renders the collectible figurine. That generated
 * figurine becomes the avatar and reveals as "AVATAR UNLOCKED". If the image
 * model isn't provisioned (`status !== 'ok'`, no image) we fall back to the raw
 * photo so onboarding never dead-ends. Then the equal 125 RC photo grant fires.
 */
const NEXT = '/e/w3-first-bike'

interface AssetRenderResponse { description: string | null; prompt: string; image_base64: string | null; status: string }

/** Downscale before upload — the vision model needs shape/colour, not megapixels. */
function fileToDownscaledDataUrl(file: File, max = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); return reject(new Error('no canvas')) }
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')) }
    img.src = url
  })
}

export default function W3AvatarOnboardPage() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const grant = useGrantOnboarding()
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<AvatarStage>('intro')
  const [hero, setHero] = useState<string | null>(user?.avatar_url ?? SHOWCASE_RIDER)

  const onPick = () => inputRef.current?.click()
  const handle = user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider')

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setStage('generating')
    try {
      const photo = await fileToDownscaledDataUrl(file)
      setHero(photo) // show their photo while the studio renders
      // The LLM pipeline: analyse the rider + render the collectible figurine.
      let avatar = photo
      try {
        const res = await apiClient.post<AssetRenderResponse>('/garage/asset/render', { photo_base64: photo, kind: 'rider' })
        if (res.data.status === 'ok' && res.data.image_base64) avatar = res.data.image_base64
      } catch { /* image model unavailable → keep the raw photo */ }
      await updateUser({ avatar_url: avatar })
      await refreshUser()
      await grant.mutateAsync('photo').catch(() => {})
      setHero(avatar)
      setStage('revealed')
    } catch {
      // A failed pipeline shouldn't trap the rider in onboarding.
      navigate(NEXT)
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      <W3AvatarOnboardView
        heroImageUrl={hero}
        stage={stage}
        handle={handle}
        onPick={onPick}
        onSkip={() => navigate(NEXT)}
        onTake={() => navigate(NEXT)}
      />
    </>
  )
}
