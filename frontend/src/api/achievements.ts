import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Achievements — training milestones detected SERVER-side from the athlete's
// own activities + PMC + streams (services/achievement_service). Earned by
// riding, never bought. GET /achievements/mine returns unlocked + in-progress
// with honest real numbers; a locked milestone carries real progress where a
// number exists. This is the real backend behind the W3 Wins badge grid.
// ──────────────────────────────────────────────────────────────────────

export interface UnlockedAchievement {
  key: string
  icon: string
  title: string
  detail: string
  unlocked_at: string        // ISO yyyy-mm-dd — date of the triggering ride/day
  value_label: string | null // "133,1 km" · "Cat 4" · "286 W"
  fresh: boolean
}

export interface AchievementProgress {
  key: string
  icon: string
  title: string
  detail: string
  progress: { current: number; target: number; label: string } | null
  pct: number | null
}

export interface AchievementsPayload {
  unlocked: UnlockedAchievement[]
  in_progress: AchievementProgress[]
  counts: { unlocked: number; total: number }
  latest: UnlockedAchievement | null
  all_time: {
    rides: number
    km: number | null
    hours: number | null
    kj: number | null
    ascent_m: number | null
  }
}

// GET /achievements/mine — detect + persist milestones, then return the grid.
export async function fetchAchievements(
  lang: 'en' | 'de' = 'en',
): Promise<AchievementsPayload> {
  const res = await apiClient.get<AchievementsPayload>('/achievements/mine', {
    params: { lang },
  })
  return res.data
}
