import { apiClient } from './client'

export type DirectiveKind = 'escalate' | 'push' | 'hold' | 'deload' | 'rest'
export type Tone = 'good' | 'warn' | 'bad' | 'neutral'
export type Evidence = 'RCT' | 'expert' | 'guardrail'

export interface AdaptiveSignal { text: string; tone: Tone; evidence: Evidence }
export interface AdaptiveDirective {
  directive: DirectiveKind
  intensity_ceiling: string
  volume_modifier: number
  hrv_state: 'below' | 'in' | 'above' | 'unknown'
  headline: string
  signals: AdaptiveSignal[]
  confidence: string
  lang: string
}

export async function fetchAdaptive(locale = 'en'): Promise<AdaptiveDirective> {
  const res = await apiClient.get<AdaptiveDirective>('/coach/adaptive', { params: { lang: locale } })
  return res.data
}
