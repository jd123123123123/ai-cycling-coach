import W3OnboardRewardsView, { type W3RewardTile } from './W3OnboardRewardsView'

/** TEMP preview — /e/w3-onboard-rewards-preview (unguarded). */
export default function W3OnboardRewardsPreview() {
  // fixture: sample balance; the wired Page reads the real wallet.
  const tiles: [W3RewardTile, W3RewardTile, W3RewardTile] = [
    { value: '400', label: 'Dein Guthaben · RC' },
    { value: '400', label: 'Startbonus' },
    { value: '~1', label: 'RC pro TSS' },
  ]
  return <W3OnboardRewardsView tiles={tiles} onNext={() => {}} onSkip={() => {}} />
}
