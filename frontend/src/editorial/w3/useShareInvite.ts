import { useEffect } from 'react'
import { useMyReferrals } from '../../hooks/useReferrals'
import { setShareInviteCode } from './w3share'

/**
 * Publish the rider's own invite code to the card renderer.
 *
 * Call this in any screen that can PRODUCE a shareable image. It is a hook and
 * not a one-off fetch because the code arrives asynchronously: a card rendered
 * before `/referrals/mine` resolves would go out without an invite, and these
 * screens render one the moment they mount.
 *
 * Deliberately NOT mounted app-wide. Every rider would then pay for a referral
 * fetch on every cold start to serve a line that only appears on an export — so
 * it is fetched where images are actually made, which is the four screens that
 * call the renderers. `useMyReferrals`' `staleTime` means they share one
 * request.
 *
 * IT LIVES IN `editorial/`, not in `hooks/`, and that is enforced: an
 * `editorial/__tests__/isolation` test asserts nothing outside this tree
 * imports from it (App.tsx excepted). Putting it in `hooks/` — where it looks
 * like it belongs — is what that test exists to catch, because it would make
 * the shared hook layer depend on one design system.
 */
export function useShareInvite(): void {
  const { data } = useMyReferrals()
  const code = data?.code ?? null
  useEffect(() => {
    setShareInviteCode(code)
  }, [code])
}
