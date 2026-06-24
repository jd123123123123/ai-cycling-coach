import { apiClient } from './client'
import type { CardPref } from '../components/dashboard/cardRegistry'

export interface TabLayouts {
  layouts: Record<string, CardPref[]>
}

export async function getTabLayouts(): Promise<TabLayouts> {
  const res = await apiClient.get<TabLayouts>('/tab-layouts')
  return res.data
}

export async function putTabLayouts(payload: TabLayouts): Promise<TabLayouts> {
  const res = await apiClient.put<TabLayouts>('/tab-layouts', payload)
  return res.data
}
