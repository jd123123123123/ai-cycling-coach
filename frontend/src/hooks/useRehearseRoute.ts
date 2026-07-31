import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRehearsal, type SourceKind } from '../api/rehearsal'

/**
 * "Rehearse this route" — POST a route source, land on `/rehearse/:id`.
 *
 * Every entry point into Route Rehearsal does the same two things: create the
 * rehearsal from whatever the surface already knows (a crew event, a ride you
 * have already done, the target event) and then navigate to the one page that
 * renders it. Keeping that here means a new entry point costs a button, not a
 * second copy of the create-then-navigate dance — and it means the pending and
 * refusal states look the same everywhere.
 *
 * `pendingRef` is the source_ref currently in flight (or -1 for a source with
 * no ref), so a list can disable exactly the row that was tapped rather than
 * the whole list.
 */
export function useRehearseRoute() {
  const navigate = useNavigate()
  const [pendingRef, setPendingRef] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rehearse = useCallback(
    async (source_kind: SourceKind, source_ref?: number, name?: string) => {
      if (pendingRef !== null) return
      setPendingRef(source_ref ?? -1)
      setFailed(false)
      setError(null)
      try {
        const r = await createRehearsal({ source_kind, source_ref, name })
        navigate(`/rehearse/${r.id}`)
      } catch (err: unknown) {
        // The API writes its refusals for a human ("this ride has no GPS
        // track…"), so show that sentence rather than a status code. When
        // there is no such sentence, `failed` lets the caller supply its own
        // localised fallback instead of showing nothing at all.
        const detail = (err as { response?: { data?: { detail?: unknown } } })
          ?.response?.data?.detail
        setError(typeof detail === 'string' ? detail : null)
        setFailed(true)
      } finally {
        setPendingRef(null)
      }
    },
    [navigate, pendingRef],
  )

  return { rehearse, pendingRef, failed, error }
}
