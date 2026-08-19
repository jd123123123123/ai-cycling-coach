import W3AvatarOnboardView from './W3AvatarOnboardView'
import { SHOWCASE_RIDER } from './showcaseRider'

/** TEMP preview — the avatar onboarding, every stage.
 *  /e/w3-avatar-onboard-preview is unguarded.
 *
 *  `?stage=` picks which one: `intro` (the "Jetzt kommst du rein" invite),
 *  `generating`, `unavailable`, or `revealed` (default). The invite was
 *  unreachable here before, so its empty state — the frame that stands in for
 *  the photo it is asking for — could not be looked at without editing this
 *  file. `?photo=0` drops the hero image to see exactly that empty frame. */
export default function W3AvatarOnboardPreview() {
  const params = new URLSearchParams(window.location.search)
  const stage = (params.get('stage') ?? 'revealed') as 'intro' | 'generating' | 'unavailable' | 'revealed'
  const photo = params.get('photo') !== '0'
  return (
    <W3AvatarOnboardView
      heroImageUrl={photo ? SHOWCASE_RIDER : null}
      stage={stage}
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
