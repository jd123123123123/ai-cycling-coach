import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useGrantOnboarding, useWallet } from '../../hooks/useWallet'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { updateUser } from '../../api/auth'
import { apiClient } from '../../api/client'
import { SHOWCASE_RIDER } from './showcaseRider'
import { HIDDEN_FILE_INPUT } from './w3tokens'
import W3AvatarOnboardView, { type AvatarStage, type AvatarReveal, type AvatarInsight } from './W3AvatarOnboardView'

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
  // The intro hero is the SHOWCASE rider — never `user.avatar_url`. This screen
  // is only ever reached by someone who has no digitalised rider, and their
  // avatar_url at that point is a leftover: a raw photo from an older
  // onboarding or from a render that ran with no image model. Showing it back
  // to them presents an old snapshot as the thing they're being asked to make.
  const [hero, setHero] = useState<string | null>(SHOWCASE_RIDER)

  const onPick = () => inputRef.current?.click()
  const handle = user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider')

  // Real lifetime stats for the "AVATAR UNLOCKED" reveal (pen lQimK).
  const seasonsAgo = useMemo(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 6); return d }, [])
  const { data: acts } = useActivitiesRange(seasonsAgo, new Date())
  const { data: wallet } = useWallet()
  const reveal = useMemo<AvatarReveal>(() => {
    const cyc = (acts?.activities ?? []).filter((a) => a.sport === 'cycling')
    const rides = cyc.length
    const distKm = cyc.reduce((s, a) => s + (a.distance_meters ?? 0), 0) / 1000
    const saddleH = cyc.reduce((s, a) => s + (a.duration_seconds ?? 0), 0) / 3600
    const elevM = cyc.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0)
    const longestKm = cyc.length ? Math.max(0, ...cyc.map((a) => (a.distance_meters ?? 0) / 1000)) : 0
    const kcal = cyc.reduce((s, a) => s + (a.calories ?? 0), 0)
    const avgSpeed = saddleH > 0 ? distKm / saddleH : 0
    const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)))

    // ── Level — IN-APP progression only (RideCoin earned in the app). Everyone
    //    starts at LEVEL 1; lifetime riding fills the STATS, never the level. ──
    const rc = Math.max(0, wallet?.balance ?? 0)
    const XP_PER = 500
    const level = 1 + Math.floor(rc / XP_PER)
    const intoLevel = rc % XP_PER
    const levelPct = intoLevel / XP_PER
    const xpNote = `${XP_PER - intoLevel} RC bis Level ${level + 1}`

    // Role from riding character (real): lots of vertical → Climber, fast → Rouleur.
    const elevPerKm = distKm > 0 ? elevM / distKm : 0
    const role = rides === 0 ? 'Rookie' : elevPerKm >= 12 ? 'Climber' : avgSpeed >= 30 ? 'Rouleur' : 'Rider'

    // Headline insight — the distance, made human (fraction of the Earth).
    const earthPct = (distKm / 40075) * 100
    const headline = distKm <= 0 ? 'Deine erste Fahrt schreibt hier deine Zahlen.'
      : distKm >= 40075 ? `${Math.round(distKm).toLocaleString('de-DE')} km — ${(distKm / 40075).toFixed(1)}× um die Erde`
        : `${Math.round(distKm).toLocaleString('de-DE')} km — ${earthPct < 1 ? earthPct.toFixed(1) : Math.round(earthPct)} % um die Erde`

    // Dopamine insight tiles — each raw number made meaningful.
    const everest = elevM / 8849
    const pizzas = Math.round(kcal / 850)
    const secondary: AvatarInsight[] = [
      { key: 'elevation', label: 'ELEVATION', value: elevM > 0 ? `${(elevM / 1000).toFixed(1)} km` : '—', caption: elevM > 0 ? `≈ ${everest.toFixed(everest < 10 ? 1 : 0)}× Mount Everest` : 'noch offen' },
      { key: 'longest', label: 'LONGEST', value: rides ? `${Math.round(longestKm)} km` : '—', caption: rides ? 'dein größter Tag im Sattel' : 'noch offen' },
      { key: 'speed', label: 'AVG SPEED', value: avgSpeed > 0 ? avgSpeed.toFixed(1) : '—', caption: 'km/h über alle Fahrten' },
      { key: 'burned', label: 'BURNED', value: kcal > 0 ? fmtK(kcal) : '—', caption: kcal > 0 ? `kcal · ≈ ${pizzas} Pizzen` : 'kcal' },
    ]

    const earliest = cyc.reduce<number | null>((m, a) => { const t = new Date(a.started_at).getTime(); return m == null || t < m ? t : m }, null)
    const years = earliest ? Math.max(1, Math.floor((Date.now() - earliest) / (365.25 * 864e5))) : 0
    const garmin = cyc.some((a) => (a.source ?? '').toLowerCase().includes('garmin'))
    const syncNote = years > 0
      ? `${garmin ? 'Garmin synced · ' : ''}${years} ${years === 1 ? 'year' : 'years'} of riding`
      : (garmin ? 'Garmin synced' : '')

    return {
      avatarUrl: hero,
      handle,
      role, level, levelPct, xpNote, headline,
      primary: {
        totalDistance: rides ? `${Math.round(distKm).toLocaleString('en-US')} km` : '—',
        totalRides: rides ? String(rides) : '—',
        saddleTime: rides ? `${Math.round(saddleH)} h` : '—',
      },
      secondary,
      syncNote,
    }
  }, [acts, hero, handle, wallet])

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
      <input ref={inputRef} type="file" accept="image/*" style={HIDDEN_FILE_INPUT} onChange={onFile} />
      <W3AvatarOnboardView
        heroImageUrl={hero}
        stage={stage}
        reveal={reveal}
        onPick={onPick}
        onSkip={() => navigate(NEXT)}
        onTake={() => navigate(NEXT)}
      />
    </>
  )
}
