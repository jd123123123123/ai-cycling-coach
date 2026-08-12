import { useCallback, useRef, useState } from 'react'
import { apiClient } from '../../api/client'
import W3BikeStudioView, { type BikeAnalysis, type StudioState } from './W3BikeStudioView'

/**
 * W3 · Bike Studio, wired live. Route /e/w3-bike-studio.
 *
 * Capture a photo → `POST /garage/bike/render`. The vision analysis is real;
 * the render image is present only when the server has an image model
 * provisioned (see backend `services/bike_render.py`). The photo is read to a
 * base64 data URL client-side (same shape the avatar upload uses).
 */

interface RenderResponse {
  analysis: BikeAnalysis
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<StudioState>('intro')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<BikeAnalysis | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [renderStatus, setRenderStatus] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setState('intro'); setPhotoUrl(null); setAnalysis(null); setImageUrl(null)
    setRenderStatus(null); setPrompt(null); setError(null)
  }, [])

  const onFile = useCallback(async (file: File) => {
    try {
      const dataUrl = await fileToDownscaledDataUrl(file)
      setPhotoUrl(dataUrl)
      setState('analyzing')
      const res = await apiClient.post<RenderResponse>('/garage/bike/render', { photo_base64: dataUrl })
      setAnalysis(res.data.analysis)
      setPrompt(res.data.prompt)
      setState('rendering')
      // the server does both stages in one call; the 'rendering' beat is just
      // the reveal choreography for the analysis chips before the image lands.
      setImageUrl(res.data.image_base64)
      setRenderStatus(res.data.status)
      setTimeout(() => setState('reveal'), 500)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Couldn’t render this photo. Try another shot of the whole bike.')
      setState('error')
    }
  }, [])

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <W3BikeStudioView
        state={state} photoUrl={photoUrl} analysis={analysis} imageUrl={imageUrl}
        renderStatus={renderStatus} prompt={prompt} error={error}
        onPick={() => fileRef.current?.click()}
        onReset={reset}
        onSave={reset /* TODO: persist to a bike record once the garage model lands */} />
    </>
  )
}
