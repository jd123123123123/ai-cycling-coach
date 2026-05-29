import { apiClient } from './client'
import type { ChartSpec } from '../types/chartSpec'

export interface GridLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export interface UserDashboardListItem {
  id: number
  name: string
  description: string | null
  chart_count: number
  updated_at: string | null
  created_at: string
}

export interface UserDashboard {
  id: number
  name: string
  description: string | null
  layout: GridLayoutItem[]
  charts: ChartSpec[]
  created_at: string
  updated_at: string | null
}

export interface UserDashboardWrite {
  name: string
  description?: string | null
  layout: GridLayoutItem[]
  charts: ChartSpec[]
}

export async function listDashboards(): Promise<UserDashboardListItem[]> {
  const res = await apiClient.get<UserDashboardListItem[]>('/dashboards')
  return res.data
}

export async function getDashboard(id: number): Promise<UserDashboard> {
  const res = await apiClient.get<UserDashboard>(`/dashboards/${id}`)
  return res.data
}

export async function createDashboard(payload: UserDashboardWrite): Promise<UserDashboard> {
  const res = await apiClient.post<UserDashboard>('/dashboards', payload)
  return res.data
}

export async function updateDashboard(
  id: number,
  payload: UserDashboardWrite,
): Promise<UserDashboard> {
  const res = await apiClient.put<UserDashboard>(`/dashboards/${id}`, payload)
  return res.data
}

export async function deleteDashboard(id: number): Promise<void> {
  await apiClient.delete(`/dashboards/${id}`)
}
