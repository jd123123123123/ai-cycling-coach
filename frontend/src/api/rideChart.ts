import { apiClient } from './client'
import type { RideSample, FTPEntry } from '../editorial/w3/atelierRideData'
import type { RideContributions } from '../editorial/w3/AtelierRideMeaning'
export interface RideChart {
 activity_id:number;samples:RideSample[];ftp_at_ride:number|null;hr_max:number|null;ftp_history:FTPEntry[]
 zone_seconds:(number|null)[];efforts:{seconds:number;watts:number;previous:number|null}[];contributions:RideContributions
}
export async function fetchRideChart(id:number):Promise<RideChart>{return (await apiClient.get<RideChart>(`/activities/${id}/ride-chart`)).data}
