import W3AvatarOnboardView from './W3AvatarOnboardView'
import { SHOWCASE_RIDER } from './showcaseRider'

/** TEMP preview — the "AVATAR UNLOCKED" reveal (pen lQimK, reworked).
 *  /e/w3-avatar-onboard-preview is unguarded. */
export default function W3AvatarOnboardPreview() {
  return (
    <W3AvatarOnboardView
      heroImageUrl={SHOWCASE_RIDER}
      stage="revealed"
      reveal={{
        avatarUrl: SHOWCASE_RIDER,
        handle: '@jannis',
        role: 'Climber',
        level: 1,
        levelPct: 0.25,
        xpNote: '375 RC bis Level 2',
        headline: '',
        primary: { totalDistance: '4.812 km', totalRides: '318', saddleTime: '214 h' },
        secondary: [
          { key: 'elevation', label: 'HÖHENMETER', value: '61,4 km', caption: '≈ 7× Mount Everest' },
          { key: 'longest', label: 'LÄNGSTE', value: '187 km', caption: 'dein größter Tag im Sattel' },
          { key: 'speed', label: 'Ø TEMPO', value: '27,4', caption: 'km/h über alle Fahrten' },
          { key: 'burned', label: 'VERBRANNT', value: '142,6K', caption: 'kcal · ≈ 168 Pizzen' },
        ],
        syncNote: 'Garmin synchronisiert · 4 Jahre im Sattel',
      }}
      onPick={() => {}}
      onSkip={() => {}}
      onTake={() => {}}
    />
  )
}
