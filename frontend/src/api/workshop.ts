import { apiClient } from './client'

// The workshop — the bike's condition and its unharvested Service Bonus.
// Backend: app/api/garage.py (`/garage/workshop`), model in
// app/services/bike_wear.py.
//
// Note what is NOT in these types: there is no penalty, no lockout and no
// "broken" status. Riding banks a bonus into each component and servicing
// withdraws it; neglect only ever leaves money unharvested. Any field added
// here that could reduce a rider's earn belongs to a different design.

/** Never a failure state, and never blocking.
 *
 *  `unknown` is not a fourth severity — it is the ABSENCE of a claim. An
 *  optional part we have never asked about (sealant on a bike that may run
 *  tubes, fluid on a bike that may run rim brakes) is neither fresh nor due,
 *  and saying either would be inventing a fact about someone's bicycle. */
export type ComponentStatus = 'fresh' | 'due' | 'overdue' | 'unknown'

export interface WorkshopComponent {
  id: string
  name_de: string
  /** What servicing it is called, in the rider's language. */
  action_de: string
  km_since: number
  /** Null for a part kilometres do not wear. Sealant dries out in a cellar. */
  interval_km: number | null
  /** Lifetime km — survives every service. The number riders brag about. */
  km_total: number
  /** The CALENDAR clock, for parts that age on one. Null until we are told. */
  days_since: number | null
  interval_days: number | null
  /** Which clock is driving `status`, and therefore which unit the meter must
   *  be labelled with. Rendering a sealant top-up in kilometres is the exact
   *  confusion the two-clock model exists to remove. */
  clock: 'km' | 'days'
  /** True while this is an optional part we have not asked about. Render a
   *  QUESTION, never a job. */
  /** How the rider maintains it, where that changes the job — today only the
   *  chain. Null means the default (oil). */
  method: string | null
  dormant: boolean
  /** Confirmed, but we were never told its age — and it has no kilometre clock
   *  to fall back on. Zero is not a reading here, it is a MISSING reading, so
   *  the screen asks instead of reporting `fresh`. */
  undated: boolean
  optional: boolean
  /** Unharvested RideCoin sitting on this component right now. */
  bonus_rc: number
  status: ComponentStatus
  /** 0..1 through the interval, already clamped by the server. */
  progress: number
  /** True once the pile stopped growing. It has NOT shrunk. */
  accrual_stopped: boolean
}

/** The chain's SECOND clock, and the expensive one.
 *
 *  `km_since` on the chain component says when it needs CLEANING. This says
 *  when the chain itself is finished: past ~0,5 % elongation it stops matching
 *  the cassette's tooth spacing and starts cutting new spacing into it, which
 *  turns a chain purchase into a chain-plus-cassette purchase.
 *
 *  `calibrated` is false while `limit_km` is still an industry prior. The
 *  screen must say "geschätzt" until the rider has measured with a gauge —
 *  quoting somebody else's chain life as if it were theirs is the thing this
 *  whole surface exists to stop doing. */
export interface ChainLife {
  /** Weighted kilometres since this chain was fitted. A service never resets it. */
  life_km: number
  /** Where 0,5 % falls for THIS rider — prior until measured, theirs after. */
  limit_km: number
  pct: number
  /** Kilometres to the line. Negative once past it. */
  km_left: number
  /** 'fresh' | 'due' | 'ruinous' — the last one means the cassette is at risk. */
  status: 'fresh' | 'due' | 'ruinous'
  progress: number
  measurements: number
  confidence: number
  calibrated: boolean
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
  chain_life: ChainLife
  balance: number
  /** The next part to ask the rider about, or null. One at a time and only
   *  when the workshop is already open: six questions up front is a form, and
   *  forms get abandoned. */
  open_question: WorkshopComponent | null
  /** "Wax tonight, rain tomorrow" — one German sentence when tomorrow has a
   *  planned ride, likely rain, and a drivetrain worth cleaning first. Null
   *  on most days; see backend services/maintenance_forecast. */
  weather_ahead?: string | null
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
  /** Of `paid_rc`, how much the photo added. Zero without one. */
  proof_rc: number
  /** What the check saw, in one German sentence. Never accusatory, and null
   *  when no photo was sent. */
  proof_note: string | null
  proof_confirmed: boolean
  /** The refreshed workshop, so the screen redraws with no second round trip. */
  workshop: Workshop
}

export interface SeedResult {
  component_id: string
  name_de: string
  km_since: number
  /** How many real rides were replayed. This is what makes the number
   *  believable — a claim the rider can check against their own feed. */
  rides: number
  days_since: number
  workshop: Workshop
}

export async function fetchWorkshop(): Promise<Workshop> {
  const res = await apiClient.get<Workshop>('/garage/workshop')
  return res.data
}

/** Service a component, optionally with a photo of the job.
 *
 *  The photo is OPTIONAL and can only ever add. The Service Bonus is paid in
 *  full without one — a flat phone or a dark garage must never withhold
 *  RideCoin that riding earned. See `services/service_proof` on the server. */
export async function serviceComponent(
  componentId: string, proofImage?: string | null,
): Promise<ServiceResult> {
  const res = await apiClient.post<ServiceResult>(
    `/garage/workshop/service/${componentId}`,
    { proof_image: proofImage ?? null },
  )
  return res.data
}

/** Answer "wann zuletzt?" — the server replays every ride since that date
 *  rather than estimating from it. */
export async function seedComponent(
  componentId: string, lastServiceOn: string,
): Promise<SeedResult> {
  const res = await apiClient.post<SeedResult>(
    `/garage/workshop/seed/${componentId}`, { last_service_on: lastServiceOn },
  )
  return res.data
}

/** Say whether the bike has an optional part. "No" is permanent until changed:
 *  a rim-brake rider is never asked about brake fluid again. */
export interface MethodOption {
  id: string
  name_de: string
  /** The interval this method actually carries. Served rather than hardcoded:
   *  a client stating "alle 300 km" beside a server that grades on 250 is the
   *  precise drift `bike_wear.spec_of` exists to prevent. */
  interval_km: number
  action_de: string
}

/** How this component can be maintained. Empty for everything but the chain. */
export async function fetchMethods(componentId: string): Promise<MethodOption[]> {
  const res = await apiClient.get<MethodOption[]>(`/garage/workshop/methods/${componentId}`)
  return res.data
}

/** Switch between oiling and waxing. The kilometres do NOT reset — switching
 *  lube does not clean a chain, it changes the interval they are measured
 *  against. */
export async function setMethod(componentId: string, method: string): Promise<Workshop> {
  const res = await apiClient.post<Workshop>(
    `/garage/workshop/method/${componentId}`, { method },
  )
  return res.data
}

export async function declareComponent(
  componentId: string, owned: boolean,
): Promise<Workshop> {
  const res = await apiClient.post<Workshop>(
    `/garage/workshop/have/${componentId}`, { owned },
  )
  return res.data
}


/** A chain-checker reading. Pays nothing on purpose: the moment a measurement
 *  earns RideCoin there is a reason to lie to the gauge, and this number is
 *  the one thing in the workshop that comes from outside the model. */
export interface MeasureResult {
  component_id: string
  measured_pct: number
  life_km_at: number
  /** True when the reading actually moved the estimate — the payoff for owning
   *  a €10 gauge, and the only thing worth celebrating here. */
  moved_estimate: boolean
  workshop: Workshop
}

export async function measureComponent(
  componentId: string,
  measuredPct: number,
): Promise<MeasureResult> {
  const res = await apiClient.post<MeasureResult>(
    `/garage/workshop/measure/${componentId}`,
    { measured_pct: measuredPct },
  )
  return res.data
}

/** A NEW physical part: every clock on it starts again. Distinct from a
 *  service, which cleans what is there and pays the banked bonus. */
export interface ReplaceResult {
  component_id: string
  name_de: string
  retired_life_km: number
  retired_km_total: number
  rides_replayed: number
  workshop: Workshop
}

export async function replaceComponent(
  componentId: string,
  fittedAt?: string,
): Promise<ReplaceResult> {
  const res = await apiClient.post<ReplaceResult>(
    `/garage/workshop/replace/${componentId}`,
    fittedAt ? { fitted_at: fittedAt } : {},
  )
  return res.data
}
