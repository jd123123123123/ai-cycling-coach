import W3OnboardRewardsView, { type W3RewardTile } from './W3OnboardRewardsView'

/** TEMP preview — /e/w3-onboard-rewards-preview (unguarded). */
export default function W3OnboardRewardsPreview() {
  // fixture: sample balance; the wired Page reads the real wallet.
  const tiles: [W3RewardTile, W3RewardTile, W3RewardTile] = [
    { value: '250', label: 'Your balance · RC' },
    { value: '250', label: 'Head start grant' },
    { value: '~1', label: 'RC per TSS' },
  ]
  return <W3OnboardRewardsView tiles={tiles} onNext={() => {}} onSkip={() => {}} />
}
