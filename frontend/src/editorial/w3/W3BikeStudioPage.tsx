import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../api/client'
import W3BikeStudioView, { type StudioState } from './W3BikeStudioView'

/**
 * W3 · Bike Studio, wired live. Route /e/w3-bike-studio (the GARAGE tab).
 *
 * Add a bike photo → `POST /garage/asset/render` (kind:'bike'). The vision
 * `description` is real; the render image is present only when the server has an
 * image model provisioned (see backend `services/cyclr_studio.py`) — otherwise
 * `status !== 'ok'` and the view shows an honest "studio unavailable" state, not
 * a faked image. The photo is read to a downscaled base64 data URL client-side.
 */

interface AssetRenderResponse {
  description: string | null
  prompt: string
  image_base64: string | null
  status: string
}

// Downscale the photo before upload — keeps the request small and the vision
// call fast; the model needs shape/colour, not megapixels.
function fileToDownscaledDataUrl(file: File, max = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('no canvas'))
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')) }
    img.src = url
  })
}

export default function W3BikeStudioPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<StudioState>('intro')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [renderStatus, setRenderStatus] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setState('intro'); setPhotoUrl(null); setDescription(null); setImageUrl(null)
    setRenderStatus(null); setPrompt(null); setError(null)
  }, [])

  const onFile = useCallback(async (file: File) => {
    try {
      const dataUrl = await fileToDownscaledDataUrl(file)
      setPhotoUrl(dataUrl)
      setState('analyzing')
      const res = await apiClient.post<AssetRenderResponse>('/garage/asset/render', {
        photo_base64: dataUrl, kind: 'bike',
      })
      setDescription(res.data.description)
      setPrompt(res.data.prompt)
      setState('rendering')
      // the server does both stages in one call; the 'rendering' beat is just
      // the reveal choreography for the description before the image lands.
      setImageUrl(res.data.image_base64)
      setRenderStatus(res.data.status)
      setTimeout(() => setState('reveal'), 500)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Couldn’t render this photo. Try another shot of the whole bike.')
      setState('error')
    }
  }, [])

  // Save = download the rendered collectible (a real data-URL PNG) to the device.
  const onSave = useCallback(() => {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = 'w3-bike-collectible.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [imageUrl])

  return (
    <>
      {/* No `capture` attr → the picker offers the photo library / files, not
          just the camera. accept limits to images. */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <W3BikeStudioView
        state={state} photoUrl={photoUrl} description={description} imageUrl={imageUrl}
        renderStatus={renderStatus} prompt={prompt} error={error}
        onBack={() => navigate(-1)}
        onPick={() => fileRef.current?.click()}
        onReset={reset}
        onSave={onSave} />
    </>
  )
}
