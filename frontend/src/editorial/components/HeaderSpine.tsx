import { Flame } from 'lucide-react'
import DayMark from './DayMark'
import DayRail from './DayRail'
import ProfileAvatar from './ProfileAvatar'
import { isPresent, type Value } from '../data/value'
import { useCopy } from '../i18n/useCopy'
import type { DayState } from '../state/dayState'
import type { DayStateControl, ProfileHeaderData } from '../pages/TodayView'

/**
 * The one header spine. Every Today screen opens identically — Cover plate,
 * date · streak · avatar, Day Rail — at the same heights, insets and type,
 * with no per-screen variants (design pass, 2026-08-06, rule 6).
 *
 * Extracted from TodayView verbatim when the Trainingstag rebuild gave the
 * spine a second caller. Nothing here is new: every value is the one that
 * was inline, and the parity of the move is what Task 1's own step 4 checks.
 */
export interface HeaderSpineProps {
  state: DayState
  dateLabel: Value<string>
  streakDays: Value<number>
  profile?: ProfileHeaderData
  control?: DayStateControl
  switchable: boolean
}

/** Day Mark's absolute `top` offset — pen-verified per state (`K8WxOh` Rest
 *  186, `LRIzl` Training 158, `F6851` Trained 150, `RzWNl` Resting 170,
 *  task 11's own fresh read of `h54Rs`), previously hardcoded to 150 for
 *  every state. No `evening` entry: `cx4zJ`'s Cover has no Day Mark node at
 *  all (task 14 rebuild, owner ruling — see `DayMark.tsx`'s own doc comment
 *  and the render site above, which skips this component entirely for
 *  `state === 'evening'`). An earlier pass kept a transcribed-from-`KYS6e`
 *  offset (137) "for cross-state parity" — that was exactly the kind of
 *  invented-not-specified reasoning the owner has now overruled; removed. */
const DAY_MARK_TOP: Partial<Record<DayState, number>> & { trained: number } = {
  rest: 186, training: 158, trained: 150, resting: 170,
}

export default function HeaderSpine({ state, dateLabel, streakDays, profile, control, switchable }: HeaderSpineProps) {
  const { t } = useCopy()
  const isWinStreak = isPresent(streakDays) && streakDays.value >= 3

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%' }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 'var(--t-label)',
                fontWeight: 800,
                letterSpacing: 1.4,
                color: state === 'training' ? 'var(--e-lo)' : 'var(--e-mid)',
                textShadow: 'var(--e-label-shadow)',
              }}
            >
              {isPresent(dateLabel) ? dateLabel.value : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {/* Find the win (design pass, 2026-08-06): a streak is the
                one true, almost-always-present "good thing" this screen
                can point to without inventing anything — it's already
                real data (`model.streakDays`), just rendered as small
                grey chrome. A streak worth noticing (≥3 days) gets the
                day's own accent colour and a bolder weight instead of
                the neutral header tone; a short or absent streak stays
                quiet rather than being dressed up into something it
                isn't. */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <Flame
                size={14}
                color={isWinStreak ? 'var(--st-active)' : 'var(--e-mid)'}
                aria-hidden="true"
                fill={isWinStreak ? 'var(--st-active)' : 'none'}
              />
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 'var(--t-label)',
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  color: isWinStreak ? 'var(--st-active)' : 'var(--e-mid)',
                  textShadow: 'var(--e-label-shadow)',
                }}
              >
                {isPresent(streakDays) ? t('heroStreakDays', { n: streakDays.value }) : '—'}
              </span>
            </div>
            {profile && <ProfileAvatar avatarUrl={profile.avatarUrl} initial={profile.initial} />}
          </div>
        </div>

        <DayRail
          state={state}
          derived={control?.derived ?? state}
          showSwitchAction={control != null && switchable}
          onSwapDayType={control?.onSwapDayType}
          onStepSelect={control ? control.onPreview : undefined}
          isPreviewing={control?.isPreviewing ?? false}
          onExitPreview={control ? () => control.onPreview(null) : undefined}
        />
      </div>

      {/* cx4zJ's Cover carries no Day Mark node at all — verified by a
          fresh full-subtree read of `TEpsw` (task 14 rebuild, owner
          ruling): Evening's Cover ends at `Foot` (Statement + Value,
          no RC line either — see the headline slot below) followed by
          `Bars`/`BarLabels` (the hypnogram, itself permanently missing —
          same "no bedtime-target source" reason as the numeral, so not
          rendered). No Day Mark renders for Evening; every other state
          still gets one at its own pen-verified offset. */}
      {state !== 'evening' && (
        <div style={{ position: 'absolute', top: DAY_MARK_TOP[state] ?? DAY_MARK_TOP.trained, right: 32 }}>
          <DayMark state={state} />
        </div>
      )}
    </>
  )
}
