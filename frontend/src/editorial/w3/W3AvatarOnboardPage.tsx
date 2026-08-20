import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useGrantOnboarding, useWallet } from '../../hooks/useWallet'
import { GARAGE_KEY } from '../../hooks/useGarage'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { updateUser } from '../../api/auth'
import { apiClient } from '../../api/client'
import { SHOWCASE_RIDER } from './showcaseRider'
import { HIDDEN_FILE_INPUT } from './w3tokens'
import { fileToDownscaledDataUrl } from './w3photo'
import W3AvatarOnboardView, { type AvatarStage, type AvatarReveal, type AvatarInsight } from './W3AvatarOnboardView'

/**
 * W3 · Avatar onboarding, wired to the LLM pipeline. Route /e/w3-avatar-onboard.
 *
 * The photo runs through `POST /garage/asset/render` (kind:'rider' → the
 * `services/cyclr_studio` analyse-then-render pipeline): the vision pass reads
 * the rider, the image model renders the collectible figurine. That generated
 * figurine becomes the avatar and reveals as "AVATAR UNLOCKED". If the image
 * model is not provisioned (`status !== "ok"`) the rider lands on an honest
 * "studio unavailable" stage with a retry — never silently skipped onward.
 */
// THE RIDER'S OWN BIKE JOINS THE CHAIN, 2026-08-20. Onboarding asked for a
// photo of the rider's FACE and then for a claim on a collectible bike, and
// never once asked for a photograph of the bicycle they actually own — so a
// rider finished onboarding with an avatar, a catalogue bike, and an empty
// garage slot where their real machine belongs. Every surface that shows "their
// bike" then had nothing to show.
//
// The photo step now sits between the two and carries the rest of the chain in
// `?next=`, so a rider who skips it still lands on the claim rather than being
// dropped into the app half-set-up. It is asked ONCE, here, because it is a
// step in a chain rather than a gate: `W3Guard` never forces it again, and the
// menu's "Dein Bike" entry is where a rider changes it later.
const NEXT = '/e/w3-bike-studio?next=' + encodeURIComponent('/e/w3-first-bike')

interface AssetRenderResponse { description: string | null; prompt: string; image_base64: string | null; status: string }



/** The default export stays prop-less because `lazyWithRetry` in App.tsx types
 *  routes as `ComponentType<unknown>`. The onboarding variant of this screen
 *  (same flow, different next step) uses the named export instead. */
export default function W3AvatarOnboardPage() {
  return <W3RiderOnboarding next={NEXT} />
}

export function W3RiderOnboarding({ next }: { next: string }) {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const grant = useGrantOnboarding()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<AvatarStage>('intro')
  // The intro hero is the SHOWCASE rider — never `user.avatar_url`. This screen
  // is only ever reached by someone who has no digitalised rider, and their
  // avatar_url at that point is a leftover: a raw photo from an older
  // onboarding or from a render that ran with no image model. Showing it back
  // to them presents an old snapshot as the thing they're being asked to make.
  const [hero, setHero] = useState<string | null>(SHOWCASE_RIDER)
  const [failure, setFailure] = useState<string | null>(null)

  const onPick = () => { setFailure(null); inputRef.current?.click() }
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
      { key: 'elevation', label: 'HÖHENMETER', value: elevM > 0 ? `${(elevM / 1000).toFixed(1)} km` : '—', caption: elevM > 0 ? `≈ ${everest.toFixed(everest < 10 ? 1 : 0)}× Mount Everest` : 'noch offen' },
      { key: 'longest', label: 'LÄNGSTE', value: rides ? `${Math.round(longestKm)} km` : '—', caption: rides ? 'dein größter Tag im Sattel' : 'noch offen' },
      { key: 'speed', label: 'Ø TEMPO', value: avgSpeed > 0 ? avgSpeed.toFixed(1) : '—', caption: 'km/h über alle Fahrten' },
      { key: 'burned', label: 'VERBRANNT', value: kcal > 0 ? fmtK(kcal) : '—', caption: kcal > 0 ? `kcal · ≈ ${pizzas} Pizzen` : 'kcal' },
    ]

    const earliest = cyc.reduce<number | null>((m, a) => { const t = new Date(a.started_at).getTime(); return m == null || t < m ? t : m }, null)
    const years = earliest ? Math.max(1, Math.floor((Date.now() - earliest) / (365.25 * 864e5))) : 0
    const garmin = cyc.some((a) => (a.source ?? '').toLowerCase().includes('garmin'))
    const syncNote = years > 0
      ? `${garmin ? 'Garmin synchronisiert · ' : ''}${years} ${years === 1 ? 'Jahr' : 'Jahre'} im Sattel`
      : (garmin ? 'Garmin synchronisiert' : '')

    return {
      avatarUrl: hero,
      handle,
      role, level, levelPct, xpNote, headline,
      primary: {
        totalDistance: rides ? `${Math.round(distKm).toLocaleString('de-DE')} km` : '—',
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
      // This call PERSISTS the result as the garage's rider asset, so from here
      // on the garage — not `users.avatar_url` — is what the app reads.
      const res = await apiClient.post<AssetRenderResponse>(
        '/garage/asset/render', { photo_base64: photo, kind: 'rider' },
        { timeout: 180_000 },
      )
      const rendered = res.data.status === 'ok' ? res.data.image_base64 : null
      if (!rendered) { setStage('unavailable'); return }

      // Mirror it into the legacy `avatar_url` for the non-W3 surfaces that
      // still read it — BEST EFFORT ONLY. This used to be awaited outside the
      // inner try, so a rejection here threw past the reveal and dumped the
      // rider on the first-bike screen having seen neither the generating
      // state nor their unlock. The collectible is already saved server-side;
      // failing to copy it into a legacy column must never cost them the
      // moment. (The old raw-photo fallback also blew the endpoint's 300 KB
      // avatar cap, which is what made that rejection routine rather than rare.)
      await updateUser({ avatar_url: rendered }).catch(() => {})
      await refreshUser().catch(() => {})
      await grant.mutateAsync('photo').catch(() => {})

      qc.invalidateQueries({ queryKey: GARAGE_KEY })
      setHero(rendered)
      setStage('revealed')
    } catch (e: unknown) {
      // Reading the file or reaching the studio failed. Say so and let them
      // retry — silently skipping to the next step looks like a broken app.
      // The REASON matters: "couldn't read this photo (image/heic)" and "the
      // studio didn't answer" need different things from the rider, and a
      // single generic message sent us hunting server-side for a failure that
      // never left the browser.
      const status = (e as { response?: { status?: number } })?.response?.status
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      const msg = (e as { message?: string })?.message
      setFailure(
        status === 401 ? 'Deine Sitzung ist abgelaufen. Lade die Seite neu und probier es nochmal.'
          : status ? `Das Studio antwortete mit ${status}.${detail ? ` ${detail}` : ''}`
            : msg || 'Unbekannter Fehler beim Lesen des Fotos.',
      )
      setStage('unavailable')
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" style={HIDDEN_FILE_INPUT} onChange={onFile} />
      <W3AvatarOnboardView
        heroImageUrl={hero}
        stage={stage}
        reveal={reveal}
        failure={failure}
        onPick={onPick}
        onSkip={() => navigate(next)}
        onTake={() => navigate(next)}
      />
    </>
  )
}
