import { apiClient } from './client'

export type Verdict = 'progress' | 'fatigue' | 'steady'
export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

export interface Marker { label: string; value: string; baseline: string | null; tone: Tone }
export interface Signal { text: string; tone: Tone }

export interface FormProgress {
  activity_id: number
  activity_title: string
  activity_date: string
  verdict: Verdict
  headline: string
  ctl: number
  ctl_7d_delta: number
  tsb: number
  markers: Marker[]
  signals: Signal[]
  lang: string
}

export async function fetchFormProgress(locale = 'en'): Promise<FormProgress | null> {
  const res = await apiClient.get<FormProgress>('/analytics/form-progress', { params: { lang: locale } })
  if (res.status === 204 || !res.data) return null
  return res.data
}
