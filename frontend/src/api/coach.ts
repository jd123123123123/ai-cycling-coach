import { apiClient, getAccessToken } from './client'

// ─── Types ───────────────────────────────────────────────────────────────────

export type BriefIntensity = 'rest' | 'easy' | 'moderate' | 'push'

export interface BriefOption {
  intensity: BriefIntensity
  title: string
  why: string
  tss_target: number
  blocked?: boolean
  block_reason?: string | null
}

export interface OutlookEntry {
  day_offset: number
  suggested_tss: number
  note: string
}

export interface CoachBriefResponse {
  id: number
  generated_at: string
  verdict: string
  rationale: string
  evidence: Record<string, unknown>
  options: BriefOption[]
  outlook_7d: OutlookEntry[] | null
  frameworks_cited: string[]
  model_used: string
  from_cache: boolean
}

export interface CauseEntry {
  label: string
  severity: 'low' | 'med' | 'high'
  evidence: string
}

export interface WhyTiredResponse {
  causes: CauseEntry[]
  snapshot: Record<string, unknown>
}

export interface TransparencyResponse {
  snapshot: Record<string, unknown>
  system_prompt: string
  model: string
  last_brief_id: number | null
  last_generated_at: string | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── Plain requests ──────────────────────────────────────────────────────────

export async function fetchCoachBrief(): Promise<CoachBriefResponse> {
  const res = await apiClient.get<CoachBriefResponse>('/coach/brief', {
    timeout: 30_000, // LLM generation can take a few seconds
  })
  return res.data
}

export async function refreshCoachBrief(): Promise<CoachBriefResponse> {
  const res = await apiClient.post<CoachBriefResponse>('/coach/brief/refresh', undefined, {
    timeout: 30_000,
  })
  return res.data
}

export async function fetchWhyTired(): Promise<WhyTiredResponse> {
  const res = await apiClient.get<WhyTiredResponse>('/coach/why')
  return res.data
}

export async function fetchTransparency(): Promise<TransparencyResponse> {
  const res = await apiClient.get<TransparencyResponse>('/coach/transparency')
  return res.data
}

// ─── Streaming chat ──────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'

export interface StreamChunk {
  type: 'delta' | 'replace' | 'done' | 'error'
  text?: string
  message?: string
}

/**
 * Streams a chat reply from /coach/chat (SSE, POST body).
 * Yields structured chunks — `delta` appends, `replace` wipes the buffer
 * and sets it to the safe redirect text.
 *
 * Throws a typed error with `status` when the endpoint returns a non-2xx
 * response — callers can check `err.status === 503` to render the disabled
 * state copy.
 */
export async function* streamCoachChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk, void, unknown> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}/coach/chat`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!res.ok || !res.body) {
    const err = new Error(`Coach chat failed with ${res.status}`) as Error & {
      status?: number
      detail?: string
    }
    err.status = res.status
    try {
      const payload = await res.json()
      err.detail = typeof payload?.detail === 'string' ? payload.detail : undefined
    } catch {
      // body wasn't JSON — fine, keep default message
    }
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE blocks are separated by a blank line
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        // Each block has one-or-more `data: <json>` lines. Concatenate them.
        const dataLines = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
        if (dataLines.length === 0) continue
        const dataStr = dataLines.join('\n')
        try {
          const parsed = JSON.parse(dataStr) as StreamChunk
          yield parsed
          if (parsed.type === 'done' || parsed.type === 'error') return
        } catch {
          // Not JSON — yield as a raw delta so we never lose a chunk
          yield { type: 'delta', text: dataStr }
        }
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* noop */ }
  }
}
