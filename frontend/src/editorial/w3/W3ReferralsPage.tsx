import { useCallback, useMemo } from 'react'
import { inviteUrl } from './w3invite'
import { useNavigate } from 'react-router-dom'
import { useMyReferrals } from '../../hooks/useReferrals'
import { useAuth } from '../../contexts/AuthContext'
import { useGarage } from '../../hooks/useGarage'
import { useAchievements } from '../../hooks/useAchievements'
import { useWallet } from '../../hooks/useWallet'
import type { ReferralCard } from '../../api/referral'
import { renderInviteCard, sharePoster, shareTextOrCopy } from './w3share'
import { DASH } from './w3tokens'
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

  // ── A CARD, NOT A LINE OF TEXT ────────────────────────────────────────
  //
  // This shared six characters and a URL. That asks whoever receives it to
  // take a stranger's word for the app — and the rider doing the inviting,
  // who is the entire argument, was not in the message at all.
  //
  // It sends the pen's referral frame now (`Z2ryuL`): their own portrait, their
  // handle, three of their own numbers, and the code set large enough to read
  // off a screen and type into another one. `renderInviteCard` composes it on
  // a canvas, so there is no screenshot and nothing to crop.
  //
  // THE LINK STILL GOES WITH IT. An image cannot be tapped, and a code that
  // has to be typed is a code some people will not type — so the URL rides
  // along as its own share field, where sheets make it a real link. The card
  // is the persuasion; the link is the door.
  const { user } = useAuth()
  const { data: garage } = useGarage()
  const { data: ach } = useAchievements('de')
  const { data: wallet } = useWallet()

  // Same derivation the Biker screen and the avatar reveal use, so a rider's
  // handle is one thing across every card the app can produce.
  const handle = user?.display_name
    ? `@${user.display_name}`
    : (user?.email ? `@${user.email.split('@')[0]}` : '@rider')

  const share = useCallback(async () => {
    const code = data?.code
    if (!code) return
    const url = inviteUrl(code)
    const text = `Fahr mit mir — hier geht's los, mein Code ${code} ist schon drin.`

    // The same three facts the pen frame carries, in this app's units.
    const a = ach?.all_time
    const card = await renderInviteCard({
      avatarUrl: garage?.rider?.image_base64 ?? null,
      avatarInitial: handle.replace('@', '').charAt(0).toUpperCase() || '?',
      handle,
      code,
      offer: '30 TAGE · 10 % BONUS AUF JEDE FAHRT',
      stats: [
        { v: wallet ? compact(wallet.balance) : DASH, l: 'RIDECOINS' },
        { v: a?.km != null ? `${Math.round(a.km).toLocaleString('de-DE')} km` : DASH, l: 'GESAMT' },
        { v: a ? String(a.rides) : DASH, l: 'FAHRTEN' },
      ],
    }).catch(() => null)

    // A failed render must not cost the rider the invite — the old text path
    // is the fallback, not a worse version of the same thing.
    if (card?.blob) {
      const how = await sharePoster(card.blob, `${text} ${url}`, 'ridr-invite.png')
      if (how !== 'failed') return
    }
    await shareTextOrCopy(text, url)
  }, [data, garage, ach, wallet, handle])

  return (
    <W3ReferralsView
      vm={vm}
      onBack={() => navigate('/e/w3-biker')}
      onShare={share}
      onOpenUser={(id) => navigate(`/e/w3-referral-user/${id}`)}
    />
  )
}
