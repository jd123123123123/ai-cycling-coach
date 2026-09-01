import { useQuery } from '@tanstack/react-query'
import { useLocale } from '../contexts/LocaleContext'
import { apiClient } from '../api/client'

/**
 * GET /analytics/power-profile-view — the V3 · Power Profile screen model
 * (pencil frame QLszB), card-for-card: hero mean-max curve + recent-PR flags,
 * canonical FTP + W/kg + monthly progression, Coggan power zones, rider-type
 * phenotype (+ consequence line), cohort benchmark bands, sprint/pedaling.
 *
 * Distinct from usePowerProfile() (the dense /power-profile endpoint other
 * surfaces share): this one is built from the stored per-ride MMP curves (fast)
 * and shaped for THIS screen. Every number is the athlete's own; honest null →
 * "—" in the UI, never a fabricated value.
 */
export interface HeroPoint {
  seconds: number
  label_en: string
  label_de: string
  watts: number | null
  wkg: number | null
  is_pr: boolean
  /** Best at this duration in the trailing 90 days. Null where the rider has
   *  not ridden that hard that recently. Always <= `watts` by construction —
   *  the all-time envelope contains the recent one — so a screen can draw the
   *  pair as a fill inside a track and never overflow it. */
  recent_watts: number | null
}

export interface PowerZone {
  code: string
  color_idx: number
  name_en: string
  name_de: string
  low: number | null
  high: number | null
}

export interface PhenotypeTrait {
  key: string
  label_en: string
  label_de: string
  word_en: string
  word_de: string
  pct: number
}

export interface BenchmarkBand {
  key: string
  label_en: string
  label_de: string
  low_wkg: number
  high_wkg: number
}

export interface PowerProfileView {
  available: boolean
  lang?: string
  rides_with_power?: number
  weight_kg?: number | null
  curve?: HeroPoint[]
  pr_note?: { count: number; labels_en: string[]; labels_de: string[] } | null
  threshold_watts?: number | null
  threshold_source?: 'manual' | 'model' | null
  threshold_wkg?: number | null
  model_valid?: boolean
  cp_watts?: number | null
  w_prime_j?: number | null
  eftp_watts?: number | null
  r_squared?: number | null
  cp_wkg?: number | null
  confidence?: number
  ftp_progression?: Array<{ month_en: string; month_de: string; watts: number; is_current: boolean }>
  zones?: PowerZone[]
  phenotype?: {
    key: string
    type: string
    note: string
    traits: PhenotypeTrait[]
    consequence_en: string | null
    consequence_de: string | null
  } | null
  benchmark?: {
    you_wkg: number
    category_key: string
    position_pct: number
    to_pro_wkg: number | null
    bands: BenchmarkBand[]
  } | null
  sprint_pedal?: {
    stamina_pct: number | null
    durability_best_pct: number | null
    avg_decoupling_pct: number | null
    sprint_wkg: number | null
    balance_left_pct: number | null
    balance_right_pct: number | null
  }
}

export function usePowerProfileView() {
  const { locale } = useLocale()
  return useQuery<PowerProfileView>({
    queryKey: ['analytics', 'power-profile-view', locale],
    queryFn: async () =>
      (await apiClient.get<PowerProfileView>(`/analytics/power-profile-view?lang=${locale}`)).data,
  })
}
