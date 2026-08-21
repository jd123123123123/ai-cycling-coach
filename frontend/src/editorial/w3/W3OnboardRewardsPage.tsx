import { useNavigate } from 'react-router-dom'
import { ONBOARDING_TOTAL_RC } from '../../api/rewards'
import { useWallet } from '../../hooks/useWallet'
import { markW3OnboardingSeen } from './w3Onboarding'
import W3OnboardRewardsView, { type W3RewardTile } from './W3OnboardRewardsView'

/**
 * W3 · Onboarding 03, wired. Route /e/w3-onboard-rewards.
 *
 * Explains the real RideCoin economy. Tile 1 is the rider's live wallet
 * balance (real, or "—" until it loads); tiles 2–3 are the real backend
 * constants: the equal 400 RC head start (125 photo + 125 device + 150 bike,
 * mirrored in api/rewards.ts) and the ~1 RC-per-TSS earn rate
 * (backend/app/services/rewards.py).
 */
export default function W3OnboardRewardsPage() {
  const navigate = useNavigate()
  const { data: wallet } = useWallet()

  const skip = () => {
    markW3OnboardingSeen()
    navigate('/e/w3-today', { replace: true })
  }

  const tiles: [W3RewardTile, W3RewardTile, W3RewardTile] = [
    { value: wallet ? wallet.balance.toLocaleString('de-DE') : '—', label: 'Dein Guthaben · RC' },
    { value: String(ONBOARDING_TOTAL_RC), label: 'Startbonus' },
    { value: '~1', label: 'RC pro TSS' },
  ]

  return (
    <W3OnboardRewardsView
      tiles={tiles}
      onNext={() => navigate('/e/w3-bike-studio?next=' + encodeURIComponent('/e/w3-today'))}
      onSkip={skip}
    />
  )
}
