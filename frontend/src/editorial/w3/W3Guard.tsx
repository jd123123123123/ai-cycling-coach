import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import W3Loading from './W3Loading'
import { hasSeenW3Onboarding } from './w3Onboarding'
import { useGarageCollection } from '../../hooks/useShop'

/**
 * W3 · The front door. Nothing in the app renders until the rider has been
 * through onboarding AND owns a bike.
 *
 * TWO SIGNALS, DELIBERATELY DIFFERENT IN KIND:
 *
 *  1. `hasSeenW3Onboarding()` — localStorage. Whether this browser has been
 *     shown the intro. Local is the right scope: the intro is a one-time
 *     explanation, and re-showing it on a new device is a small cost.
 *
 *  2. `loadout.bike` — the SERVER. Whether the rider actually owns a bike. This
 *     one must not be local: the bike is real property, and a rider who claimed
 *     it on their phone must not be asked to claim it again on a laptop, nor be
 *     able to skip the claim by clearing storage. It is also the signal that
 *     survives the localStorage flag being set by any of the older chain steps.
 *
 * FAILING OPEN IS INTENTIONAL. The bike redirect fires only when the garage
 * request actually SUCCEEDED and came back with no bike. If the request failed
 * we let the rider through to the app, where the surfaces have their own honest
 * error states — bouncing someone into onboarding because the network blinked
 * would be a far worse lie than a screen that admits it could not load.
 */
export default function W3Guard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useGarageCollection()

  // The intro first — it needs no network, so a cold start never waits on one.
  if (!hasSeenW3Onboarding()) {
    return <Navigate to="/e/w3-onboard-welcome" replace />
  }

  // Hold only on the very first read; a background refetch must never blank a
  // screen the rider is already looking at.
  if (isLoading && !data) return <W3Loading label="Einen Moment…" />

  if (!isError && data && data.loadout.bike == null) {
    return <Navigate to="/e/w3-first-bike" replace />
  }

  return <>{children}</>
}
