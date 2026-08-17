import { useMemo } from 'react'
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

  const share = async () => {
    const code = data?.code
    if (!code) return
    const text = `Fahr mit mir — mit meinem Code ${code} geht's los.`
    try {
      if (navigator.share) await navigator.share({ text })
      else await navigator.clipboard.writeText(code)
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
