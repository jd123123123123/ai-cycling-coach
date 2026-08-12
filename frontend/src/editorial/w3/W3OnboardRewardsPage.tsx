import { useNavigate } from 'react-router-dom'
import { useWallet } from '../../hooks/useWallet'
import { markW3OnboardingSeen } from './w3Onboarding'
import W3OnboardRewardsView, { type W3RewardTile } from './W3OnboardRewardsView'

/**
 * W3 · Onboarding 03, wired. Route /e/w3-onboard-rewards.
 *
 * Explains the real RideCoin economy. Tile 1 is the rider's live wallet
 * balance (real, or "—" until it loads); tiles 2–3 are the real backend
 * constants: the equal 250 RC head start and the ~1 RC-per-TSS earn rate
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
    { value: wallet ? wallet.balance.toLocaleString('en-US') : '—', label: 'Your balance · RC' },
    { value: '250', label: 'Head start grant' },
    { value: '~1', label: 'RC per TSS' },
  ]

  return (
    <W3OnboardRewardsView
      tiles={tiles}
      onNext={() => navigate('/e/w3-onboard-garage')}
      onSkip={skip}
    />
  )
}
