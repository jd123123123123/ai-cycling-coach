import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { syncTimezone } from '../api/athletes'
import type { AthleteProfile } from '../types/athlete'

export type { AthleteProfile }

// P0-2 timezone handshake — fire AT MOST once per browser session, and only
// when the browser timezone actually differs from the stored profile value.
// The flag is set before the request goes out so concurrent consumers of this
// hook can never double-fire, and a failed attempt is not retried (the backend
// field may not have landed yet — it will this wave).
let tzSyncAttempted = false

export function useAthleteProfile() {
  const qc = useQueryClient()
  const query = useQuery<AthleteProfile>({
    queryKey: ['athlete', 'me'],
    queryFn: async () => (await apiClient.get<AthleteProfile>('/athletes/me')).data,
  })

  const profile = query.data
  useEffect(() => {
    if (tzSyncAttempted || !profile) return
    let browserTz: string | undefined
    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return
    }
    if (!browserTz || profile.timezone === browserTz) return
    tzSyncAttempted = true
    syncTimezone(browserTz)
      .then(() => {
        // Reflect the accepted value locally so no second PATCH is considered.
        qc.setQueryData<AthleteProfile>(['athlete', 'me'], (old) =>
          old ? { ...old, timezone: browserTz } : old,
        )
      })
      .catch(() => {
        // Backend timezone support not landed yet (e.g. 422) — swallow silently.
      })
  }, [profile, qc])

  return query
}
