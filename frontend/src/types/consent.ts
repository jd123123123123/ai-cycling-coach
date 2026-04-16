export interface ConsentRecord {
  id: number
  consent_type: string
  consent_version: string
  granted: boolean
  granted_at: string | null
  withdrawn_at: string | null
  created_at: string
}

export interface ConsentRequest {
  consent_type: string
  consent_version: string
  granted: boolean
  consent_text: string
}

export const CONSENT_TYPES = [
  {
    type: 'health_data',
    title: 'Health Data Processing',
    description:
      'We process your health data including heart rate, HRV, sleep patterns, and body composition to provide personalized training recommendations. This data is classified as special category data under GDPR Article 9.',
    required: true,
  },
  {
    type: 'coaching_ai',
    title: 'AI Coaching',
    description:
      'We use your training history, body metrics, and performance data to generate AI-powered coaching advice and workout recommendations.',
    required: false,
  },
  {
    type: 'data_analytics',
    title: 'Platform Analytics',
    description:
      'We use aggregated, anonymized data to improve our training algorithms and platform features. Your individual data is never shared.',
    required: false,
  },
] as const
