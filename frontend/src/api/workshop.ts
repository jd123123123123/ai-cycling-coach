import { apiClient } from './client'

// The workshop — the bike's condition and its unharvested Service Bonus.
// Backend: app/api/garage.py (`/garage/workshop`), model in
// app/services/bike_wear.py.
//
// Note what is NOT in these types: there is no penalty, no lockout and no
// "broken" status. Riding banks a bonus into each component and servicing
// withdraws it; neglect only ever leaves money unharvested. Any field added
// here that could reduce a rider's earn belongs to a different design.

/** Never a failure state, and never blocking. */
export type ComponentStatus = 'fresh' | 'due' | 'overdue'

export interface WorkshopComponent {
  id: string
  name_de: string
  /** What servicing it is called, in the rider's language. */
  action_de: string
  km_since: number
  interval_km: number
  /** Lifetime km — survives every service. The number riders brag about. */
  km_total: number
  /** Unharvested RideCoin sitting on this component right now. */
  bonus_rc: number
  status: ComponentStatus
  /** 0..1 through the interval, already clamped by the server. */
  progress: number
  /** True once the pile stopped growing. It has NOT shrunk. */
  accrual_stopped: boolean
}

export interface Workshop {
  components: WorkshopComponent[]
  total_bonus_rc: number
  /** Whether the fresh-drivetrain earn bonus is currently live. */
  drivetrain_fresh: boolean
  /** The real drag of a dirty chain in watts, or null while fresh. Null means
   *  there is nothing true to report — never render a 0 here. */
  drivetrain_watts: number | null
  chain_km_total: number
  chain_record_km: number
  balance: number
}

export interface ServiceResult {
  component_id: string
  name_de: string
  /** Zero is a legitimate outcome: servicing something cleaned yesterday pays
   *  nothing and says so, rather than being refused. */
  paid_rc: number
  balance: number
  km_serviced: number
  new_record: boolean
  record_km: number
  /** The refreshed workshop, so the screen redraws with no second round trip. */
  workshop: Workshop
}

export async function fetchWorkshop(): Promise<Workshop> {
  const res = await apiClient.get<Workshop>('/garage/workshop')
  return res.data
}

export async function serviceComponent(componentId: string): Promise<ServiceResult> {
  const res = await apiClient.post<ServiceResult>(`/garage/workshop/service/${componentId}`)
  return res.data
}
