import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Rider studio — compose the rider's own W3 collectible from three real photos
// (themselves, their bike, their helmet) via the cyclr_studio pipeline.
// Backend: POST /garage/rider/compose. Honestly gated: status
// 'image_model_unavailable' when no image model is provisioned (no fake image).
// ──────────────────────────────────────────────────────────────────────

export interface RiderComposeResult {
  prompt: string
  image_base64: string | null   // data:image/png;base64,… or null
  status: 'ok' | 'image_model_unavailable' | string
}

export async function composeRider(input: {
  selfBase64: string
  bikeBase64: string
  helmetBase64: string
}): Promise<RiderComposeResult> {
  const res = await apiClient.post<RiderComposeResult>('/garage/rider/compose', {
    self_base64: input.selfBase64,
    bike_base64: input.bikeBase64,
    helmet_base64: input.helmetBase64,
  }, { timeout: 120_000 })
  return res.data
}
