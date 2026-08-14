import { UserRound } from 'lucide-react'
import { T } from './w3tokens'
import { useGarage } from '../../hooks/useGarage'

/**
 * The rider's avatar, wherever the shell shows it.
 *
 * One rule, and it is the same rule the bike hero follows: show the collectible
 * the rider actually made, or an empty seat that says so. Nothing in between.
 *
 * `users.avatar_url` is deliberately NOT read here. That column also holds the
 * raw-photo fallback from older onboarding runs and from renders that ran with
 * no image model, so it can contain a snapshot the rider never chose as their
 * rider — which is exactly what they asked to stop seeing. The garage is the
 * source of truth; the moment they generate a rider it appears here, and until
 * then this is a placeholder that invites rather than a stale photo that lies.
 */
export default function W3RiderAvatar({ size = 34, dim = false }: { size?: number; dim?: boolean }) {
  const { data: garage } = useGarage()
  const rider = garage?.rider?.image_base64 ?? null

  if (rider) {
    return (
      <div style={{ width: size, height: size, borderRadius: 100, overflow: 'hidden', background: T.surface2, flex: 'none' }}>
        <img src={rider} alt="Dein Rider" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    )
  }

  // The empty seat: a dashed acid ring around a quiet figure — the same
  // "something belongs here" language as the empty bike stand.
  return (
    <div aria-label="Noch kein Rider" style={{
      width: size, height: size, borderRadius: 100, flex: 'none',
      display: 'grid', placeItems: 'center', background: T.surface,
      border: `1.5px dashed ${dim ? T.d2 : `${T.acid}59`}`,
    }}>
      <UserRound size={Math.round(size * 0.5)} strokeWidth={1.6} color={dim ? T.quiet : T.acid} />
    </div>
  )
}
