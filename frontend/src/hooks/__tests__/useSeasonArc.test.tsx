import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../contexts/LanguageContext'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { COACH_BRIEF_KEY_ROOT } from '../useCoachBrief'
import { WEEK_CURRENT_KEY_ROOT } from '../useCurrentWeek'
import type { CoachBriefResponse } from '../../api/coach'
import type { WeekResponse } from '../../api/weeks'
import type { AthleteProfile } from '../../types/athlete'
import { useSeasonArc } from '../useSeasonArc'

afterEach(cleanup)

/**
 * The whole-branch review's "must fix": before useSeasonArc existed, each of
 * the four tabs built its own SeasonArc inline, and TWO of them (Recovery,
 * History) hard-coded `goalEventDate: null` — never reading the brief's
 * evidence at all. For an athlete whose event date lives in the backend's
 * legacy `goals` JSONB rather than the profile's `target_event_date` column
 * (a real, documented divergence — see backend/app/services/coach_service.py
 * ~line 578), that meant Today/Plan showed a real countdown while
 * Recovery/History showed "no event booked" — permanently, for the same
 * moment in time, on the one component whose entire job is to be identical
 * everywhere.
 *
 * This test proves the invariant the fix creates: two independent call
 * sites of useSeasonArc(), reading the SAME React-Query cache, always
 * produce the identical SeasonArc — not because seasonArc() itself is
 * correct (utils/seasonArc.test.ts already covers that), but because there
 * is now exactly ONE derivation, not four. It seeds the cache with exactly
 * the legacy-JSONB scenario (profile has no target_event_date; the brief
 * evidence carries goal_event_date) so a regression that reintroduces a
 * `goalEventDate: null` fork would fail this test by returning `synthesized:
 * true` for the second call site while the first still resolves the event.
 */
function Probe({ testId }: { testId: string }) {
  const arc = useSeasonArc()
  return <pre data-testid={testId}>{JSON.stringify(arc)}</pre>
}

describe('useSeasonArc — cross-call-site invariant', () => {
  it('every call site reading the same cache resolves to the identical, non-synthesized arc', () => {
    const qc = new QueryClient()

    // Legacy-JSONB athlete: no target_event_date on the profile, but the
    // brief evidence carries a real goal_event_date.
    qc.setQueryData<AthleteProfile>(['athlete', 'me'], {
      target_event_date: null,
    } as unknown as AthleteProfile)
    qc.setQueryData<CoachBriefResponse>([...COACH_BRIEF_KEY_ROOT, 'simple', 'en'], {
      evidence: { athlete: { goal_event_date: '2026-12-05' } },
    } as unknown as CoachBriefResponse)
    qc.setQueryData<WeekResponse>([...WEEK_CURRENT_KEY_ROOT, 'simple', 'en', 0], {
      meso_block: {
        phase: 'build2',
        block_index_in_meso: 2,
        progression: { horizon_weeks: 6 },
      },
    } as unknown as WeekResponse)

    render(
      <QueryClientProvider client={qc}>
        <LanguageProvider>
          <LocaleProvider>
            {/* Stand-ins for four different tabs' ChapterBar call sites. */}
            <Probe testId="today" />
            <Probe testId="plan" />
            <Probe testId="body" />
            <Probe testId="history" />
          </LocaleProvider>
        </LanguageProvider>
      </QueryClientProvider>,
    )

    const today = screen.getByTestId('today').textContent
    const plan = screen.getByTestId('plan').textContent
    const body = screen.getByTestId('body').textContent
    const history = screen.getByTestId('history').textContent

    // All four call sites agree, bit for bit.
    expect(plan).toBe(today)
    expect(body).toBe(today)
    expect(history).toBe(today)

    // And the agreement is on the REAL answer, not a vacuous null==null: the
    // legacy-JSONB event date resolved for every call site, so nobody shows
    // "no event booked" while another shows a countdown.
    expect(today).toContain('"synthesized":false')
    expect(today).not.toContain('"daysToEvent":null')
  })
})
