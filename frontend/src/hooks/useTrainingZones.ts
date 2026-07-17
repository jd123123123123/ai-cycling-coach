import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

// Seiler running zone — speeds in m/s. Open-ended zones omit a bound:
// zone1 (easy) has only max_speed_ms; zone3 (hard) has only min_speed_ms.
export interface SpeedZone {
  name: string
  min_speed_ms?: number
  max_speed_ms?: number
}

// GET /training-load/zones — power_zones present only when FTP is set;
// pace_zones (zone1/zone2/zone3) present only when a running threshold is set.
export interface TrainingZones {
  power_zones?: Record<string, unknown>
  pace_zones?: Record<string, SpeedZone>
}

export function useTrainingZones() {
  return useQuery<TrainingZones>({
    queryKey: ['training-zones'],
    queryFn: async () => (await apiClient.get<TrainingZones>('/training-load/zones')).data,
    staleTime: 60 * 60 * 1000,
  })
}
