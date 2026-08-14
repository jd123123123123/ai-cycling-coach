import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGarage, useRenderAsset } from '../../hooks/useGarage'
import { HIDDEN_FILE_INPUT } from './w3tokens'
import { fileToDownscaledDataUrl } from './w3photo'
import W3BikeStudioView, { type StudioState } from './W3BikeStudioView'

/**
 * W3 · Bike Studio, wired live. Route /e/w3-bike-studio (the GARAGE tab).
 *
 * Add a bike photo → `POST /garage/asset/render` (kind:'bike'). The vision
 * `description` and `name` are real; the render image is present only when the
 * server has an image model provisioned (see backend `services/cyclr_studio.py`)
 * — otherwise `status !== 'ok'` and the view shows an honest "studio
 * unavailable" state, not a faked image. The photo is read to a downscaled
 * base64 data URL client-side.
 *
 * A successful render is KEPT: it becomes the rider's garage bike server-side,
 * which is what the Today hero and the ride hero read. Opening the studio with
 * a bike already in the garage shows that bike rather than an empty camera
 * frame — the garage is a place you visit, not just a one-shot flow.
 */

export default function W3BikeStudioPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: garage, isLoading: garageLoading } = useGarage()
  const render = useRenderAsset()
  const [state, setState] = useState<StudioState>('intro')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [renderStatus, setRenderStatus] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The unlock celebration belongs to a bike made just now, never to the one
  // already sitting in the garage.
  const [celebrate, setCelebrate] = useState(false)

  // Show the bike the rider already owns — ONCE, when the garage first resolves.
  // Not on every render pass: "Anderes Bike rendern" returns to the camera
  // frame, and re-hydrating there would bounce them straight back to the bike
  // they were trying to replace.
  const stored = garage?.bike ?? null
  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current || !stored?.image_base64) return
    hydrated.current = true
    setImageUrl(stored.image_base64)
    setDescription(stored.description)
    setName(stored.name)
    setRenderStatus('ok')
    setCelebrate(false)
    setState('reveal')
  }, [stored])

  const reset = useCallback(() => {
    setState('intro'); setPhotoUrl(null); setDescription(null); setName(null)
    setImageUrl(null); setRenderStatus(null); setPrompt(null); setError(null)
    setCelebrate(false)
  }, [])

  const onFile = useCallback(async (file: File) => {
    try {
      const dataUrl = await fileToDownscaledDataUrl(file)
      setPhotoUrl(dataUrl)
      setState('analyzing')
      const result = await render.mutateAsync({ kind: 'bike', photoBase64: dataUrl })
      setDescription(result.description)
      setName(result.name)
      setPrompt(result.prompt)
      setState('rendering')
      // the server does both stages in one call; the 'rendering' beat is just
      // the reveal choreography for the description before the image lands.
      setImageUrl(result.image_base64)
      setRenderStatus(result.status)
      setCelebrate(true)
      setTimeout(() => setState('reveal'), 500)
    } catch (e: unknown) {
      // Name the real cause. A generic "try another photo" sent us looking at
      // server logs for a failure that never left the browser (an unreadable
      // HEIC decodes to nothing and no request is made).
      const status = (e as { response?: { status?: number } })?.response?.status
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      const msg = (e as { message?: string })?.message
      setError(
        status === 401 ? 'Deine Sitzung ist abgelaufen. Lade die Seite neu und probier es nochmal.'
          : detail ?? msg ?? 'Dieses Foto ließ sich nicht rendern. Versuch eine Aufnahme vom ganzen Bike.',
      )
      setState('error')
    }
  }, [render])

  // Save = download the rendered collectible to the device. The extension is
  // read off the data URL's own mime (renders are WebP; PNG is the fallback),
  // so the saved file isn't mislabelled and refused by the OS previewer.
  const onSave = useCallback(() => {
    if (!imageUrl) return
    const ext = /^data:image\/([a-z]+)/.exec(imageUrl)?.[1] ?? 'png'
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `w3-bike-collectible.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [imageUrl])

  return (
    <>
      {/* No `capture` attr → the picker offers the photo library / files, not
          just the camera. accept limits to images. */}
      <input ref={fileRef} type="file" accept="image/*" style={HIDDEN_FILE_INPUT}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <W3BikeStudioView
        state={garageLoading && state === 'intro' ? 'loading' : state}
        photoUrl={photoUrl} description={description} imageUrl={imageUrl} bikeName={name ?? undefined}
        renderStatus={renderStatus} prompt={prompt} error={error}
        // The reveal's primary action lands on Today, where the bike they just
        // made is now the hero — the payoff, not a dead-end back-stack pop.
        onBack={() => navigate('/e/w3-today')}
        onPick={() => fileRef.current?.click()}
        celebrate={celebrate}
        onReset={reset}
        onSave={onSave} />
    </>
  )
}
