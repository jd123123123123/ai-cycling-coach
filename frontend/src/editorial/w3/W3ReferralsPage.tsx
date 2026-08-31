import { useMemo } from 'react'
import { inviteUrl } from './w3invite'
import { useNavigate } from 'react-router-dom'
import { useMyReferrals } from '../../hooks/useReferrals'
import type { ReferralCard } from '../../api/referral'
import W3ReferralsView, { type W3ReferralsVm, type W3ReferralRow } from './W3ReferralsView'

/**
 * W3 · Referral overview, wired. Route /e/w3-referrals. Real code + referred
 * riders' stats + accrued 10% cut from /referrals/mine. Share copies the code.
 */

const compact = (n: number) => n >= 1000 ? `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}K` : String(Math.round(n))
const timeLabel = (c: ReferralCard) => c.time_left.ended ? 'Beendet' : `${c.time_left.days}T ${String(c.time_left.hours).padStart(2, '0')}h`

function toRow(c: ReferralCard): W3ReferralRow {
  return {
    id: c.id, referredId: c.referred_id, handle: `@${c.handle}`, avatarUrl: c.avatar_url,
    timeLeftLabel: timeLabel(c), accruedLabel: `+${compact(c.accrued_rc)}`, claimable: c.claimable,
  }
}

export default function W3ReferralsPage() {
  const navigate = useNavigate()
  const { data } = useMyReferrals()

  const vm = useMemo<W3ReferralsVm>(() => ({
    code: data?.code ?? '—',
    blurb: 'Hol neue Fahrer dazu und verdiene 30 Tage lang 10 % Bonus auf jede Fahrt, die sie nach der Anmeldung einlösen.',
    activeCount: data?.active_count ?? 0,
    active: (data?.active ?? []).map(toRow),
    completedCount: data?.completed_count ?? 0,
    completed: (data?.completed ?? []).map(toRow),
    howItWorks: 'Dein gesamter Bonus steht dir am Ende der 30 Tage zum Einlösen bereit.',
  }), [data])

  // ── A LINK, NOT A CODE ────────────────────────────────────────────────
  // This shared the six characters and nothing else, which asks the person
  // receiving it to find the app, find the sign-up screen, and remember a
  // string on the way. The register screen has always read `?ref=` off the
  // URL — nothing anywhere ever built that URL. Now it does, from the app's
  // own origin, so the link works wherever the app is served from.
  //
  // The URL itself now comes from `w3invite`, which is also what every shared
  // CARD prints. Two builders of the same link is one builder too many: the
  // day the app gets a short domain, only that module should have to know.
  const share = async () => {
    const code = data?.code
    if (!code) return
    const url = inviteUrl(code)
    const text = `Fahr mit mir — hier geht's los, mein Code ${code} ist schon drin.`
    try {
      // `url` as its own field, not glued into the text: share sheets render a
      // real link preview for it and messengers make it tappable.
      if (navigator.share) await navigator.share({ text, url })
      else await navigator.clipboard.writeText(`${text} ${url}`)
    } catch { /* user dismissed share sheet — no-op */ }
  }

  return (
    <W3ReferralsView
      vm={vm}
      onBack={() => navigate('/e/w3-biker')}
      onShare={share}
      onOpenUser={(id) => navigate(`/e/w3-referral-user/${id}`)}
    />
  )
}
