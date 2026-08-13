import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { updateUser } from '../../api/auth'
import { composeRider } from '../../api/riderStudio'
import W3OnboardRiderView, { type RiderSlot, type RiderPhase } from './W3OnboardRiderView'

/**
 * W3 · Onboarding — Rider studio, wired. Route /e/w3-onboard-rider. Uploads the
 * three photos, calls POST /garage/rider/compose, and on accept saves the
 * composed rider as the avatar (PATCH /users/me) before continuing to rewards.
 * Honestly gated: a missing image model surfaces an 'unavailable' state.
 */
const NEXT = '/e/w3-onboard-plan'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export default function W3OnboardRiderPage() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [thumbs, setThumbs] = useState<Record<RiderSlot, string | null>>({ self: null, bike: null, helmet: null })
  const [phase, setPhase] = useState<RiderPhase>('pick')
  const [resultImage, setResultImage] = useState<string | null>(null)
  const pickingRef = useRef<RiderSlot | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = (slot: RiderSlot) => { pickingRef.current = slot; inputRef.current?.click() }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const slot = pickingRef.current
    e.target.value = ''
    if (!file || !slot) return
    const dataUrl = await readAsDataUrl(file)
    setThumbs((t) => ({ ...t, [slot]: dataUrl }))
    if (phase === 'unavailable') setPhase('pick')
  }

  const onCreate = async () => {
    if (!thumbs.self || !thumbs.bike || !thumbs.helmet) return
    setPhase('generating')
    try {
      const out = await composeRider({ selfBase64: thumbs.self, bikeBase64: thumbs.bike, helmetBase64: thumbs.helmet })
      if (out.status === 'ok' && out.image_base64) {
        setResultImage(out.image_base64)
        setPhase('result')
      } else {
        setPhase('unavailable')
      }
    } catch {
      setPhase('unavailable')
    }
  }

  const onAccept = async () => {
    if (resultImage) {
      try { await updateUser({ avatar_url: resultImage }); await refreshUser() } catch { /* non-fatal */ }
    }
    navigate(NEXT)
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      <W3OnboardRiderView
        thumbs={thumbs}
        phase={phase}
        resultImage={resultImage}
        onPick={onPick}
        onCreate={onCreate}
        onAccept={onAccept}
        onRetry={() => { setResultImage(null); setPhase('pick') }}
        onSkip={() => navigate(NEXT)}
      />
    </>
  )
}
