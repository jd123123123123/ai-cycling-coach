import { apiClient } from './client'
import type { ConsentRecord, ConsentRequest } from '../types/consent'

export async function getConsents(): Promise<ConsentRecord[]> {
  const { data } = await apiClient.get<ConsentRecord[]>('/consent')
  return data
}

export async function grantConsent(data: ConsentRequest): Promise<ConsentRecord> {
  const { data: record } = await apiClient.post<ConsentRecord>('/consent', data)
  return record
}

export async function withdrawConsent(type: string): Promise<void> {
  await apiClient.post(`/consent/${type}/withdraw`)
}
