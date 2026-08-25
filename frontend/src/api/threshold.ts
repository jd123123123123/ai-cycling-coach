import { apiClient } from './client'

// The threshold proposal — "your FTP looks like it moved, here's why, shall we?"
//
// FTP is the unit every other number in this app is measured in: zones, TSS,
// CTL, every prescribed interval. So the engine may NOTICE that it moved and
// must SHOW its working, but it never writes the number by itself. The only
// path that changes it is a rider pressing accept.
//
// Backend: app/api/athletes.py, decision in app/services/threshold_proposal.py.

export interface ThresholdEvidence {
  /** `test_effort` — a maximal 20-minute effort × 0.95, the classic field test.
   *  `model` — eFTP from the critical-power fit across many rides. */
  kind: 'test_effort' | 'model'
  watts: number
  /** Already in the rider's language, with the arithmetic stated. */
  text: string
}

export interface ThresholdProposal {
  /** False is the normal answer and carries nothing else. */
  available: boolean
  current_watts?: number
  proposed_watts?: number
  delta_watts?: number
  delta_pct?: number
  /** `up` is an achievement; `down` is a zones-are-wrong correction and must
   *  never be dressed as a failure. */
  direction?: 'up' | 'down'
  /** `high` means BOTH estimators spoke and agreed. */
  confidence?: 'high' | 'moderate'
  headline?: string
  body?: string
  evidence?: ThresholdEvidence[]
}

export async function fetchThresholdProposal(locale = 'de'): Promise<ThresholdProposal> {
  const res = await apiClient.get<ThresholdProposal>('/athletes/me/threshold-proposal', {
    params: { locale },
  })
  return res.data
}

/** Yes. The one call in the app that writes `ftp_watts` from the model — and it
 *  runs because a human pressed it. The watts are re-derived server-side, so a
 *  stale proposal is refused rather than applied. */
export async function acceptThresholdProposal(watts: number): Promise<unknown> {
  const res = await apiClient.post('/athletes/me/threshold-proposal/accept', { watts })
  return res.data
}

/** Not now. Remembered, so the same number is not raised again tomorrow — a
 *  genuinely different one still will be. */
export async function dismissThresholdProposal(watts: number): Promise<unknown> {
  const res = await apiClient.post('/athletes/me/threshold-proposal/dismiss', { watts })
  return res.data
}
