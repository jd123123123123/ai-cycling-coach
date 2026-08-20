import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGarage, useRenderAsset } from '../../hooks/useGarage'
import { useGrantOnboarding } from '../../hooks/useWallet'
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
 *
 * A kept render also PAYS: `POST /rewards/onboarding/bike` credits the one-time
 * 150 RC bike grant (`backend/app/services/rewards.py` → ONBOARDING_GRANT_RC),
 * the same idempotent mechanism the photo and device grants use. It is fired
 * once, only for a render that actually landed in the garage, and the screen
 * shows what the SERVER says it credited — `granted: 0` on a rider who already
 * claimed it says exactly that instead of promising RideCoin twice.
 */

export default function W3BikeStudioPage() {
  const navigate = useNavigate()
  // `?next=` — set when this screen is a step in onboarding rather than a
  // place the rider chose to visit. Defaults to Today, which is what it always
  // did before the photo step joined the chain.
  const [search] = useSearchParams()
  const nextRoute = search.get('next') || '/e/w3-today'
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: garage, isLoading: garageLoading } = useGarage()
  const render = useRenderAsset()
  const grant = useGrantOnboarding()
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
  // What the grant actually paid, straight from the server. `null` until it
  // answers (or if it fails) — the reveal then shows no RideCoin at all.
  const [reward, setReward] = useState<{ granted: number; balance: number } | null>(null)
  const [rewardPending, setRewardPending] = useState(false)

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
    setCelebrate(false); setReward(null); setRewardPending(false)
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

      // The reward rides on the RENDER THAT LANDED. A studio that couldn't
      // produce an image saved no bike, so there is nothing to pay for — and
      // the server refuses it anyway (`no_bike_yet`). Fired exactly once per
      // successful render, and never awaited into the reveal: the moment must
      // not wait on the wallet, and a failing grant must not cost the unlock.
      if (result.status === 'ok' && result.image_base64) {
        setRewardPending(true)
        grant.mutateAsync('bike')
          // `granted: 0` means "already claimed" — but ONLY when the server
          // actually looked at the grant. `no_bike_yet` is a different zero
          // (it found no garage bike), and must not be read back to the rider
          // as "you've had this reward before"; that shows no RideCoin at all.
          .then((r) => setReward(r.reason === 'no_bike_yet'
            ? null
            : { granted: r.granted, balance: r.balance }))
          .catch(() => setReward(null))
          .finally(() => setRewardPending(false))
      }
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
  }, [render, grant])

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
        reward={reward} rewardPending={rewardPending}
        // The reveal's primary action lands on Today, where the bike they just
        // made is now the hero — the payoff, not a dead-end back-stack pop.
        // Where "done" leads depends on why the rider is here. Reached from the
        // menu it lands on Today, where the bike they just made is the hero.
        // Reached as a step in onboarding it carries `?next=`, and continues
        // the chain instead of dropping them into the app half-set-up.
        onBack={() => navigate(nextRoute)}
        onPick={() => fileRef.current?.click()}
        celebrate={celebrate}
        onReset={reset}
        onSave={onSave} />
    </>
  )
}
