import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptIncomingInvite,
  connectToUser,
  declineIncomingInvite,
  discoverPeople,
  fetchIncomingInvites,
  type DiscoverResult,
  type IncomingInvite,
} from '../api/connections'

// Hooks for the "find & connect with people" flow. On any mutation success we
// invalidate the whole `['crew', ...]` tree (me / standings / duel) plus the
// incoming-invites feed so the leaderboard and notifications refresh.

const CREW_KEY = ['crew'] as const
const DISCOVER_KEY = ['connections', 'discover'] as const
const INCOMING_KEY = ['connections', 'invites', 'incoming'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noRetryOnAuth = (failureCount: number, error: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (error as any)?.response?.status
  if (status === 401 || status === 403) return false
  return failureCount < 1
}

// Search app users by handle/email. An empty query intentionally returns
// everyone (up to the backend limit) so the finder is browsable — you can
// scan suggestions before typing. Callers debounce keystrokes.
export function useDiscover(q: string) {
  const query = q.trim()
  return useQuery<DiscoverResult[]>({
    queryKey: [...DISCOVER_KEY, query],
    queryFn: () => discoverPeople(query || undefined),
    staleTime: 30 * 1000,
    retry: noRetryOnAuth,
  })
}

// Pending invites addressed to me — polled every ~30s for the notification feed.
export function useIncomingInvites() {
  return useQuery<IncomingInvite[]>({
    queryKey: INCOMING_KEY,
    queryFn: fetchIncomingInvites,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 10 * 1000,
    retry: noRetryOnAuth,
  })
}

export function useConnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => connectToUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CREW_KEY })
      qc.invalidateQueries({ queryKey: DISCOVER_KEY })
      qc.invalidateQueries({ queryKey: INCOMING_KEY })
    },
  })
}

export function useAcceptInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: number) => acceptIncomingInvite(inviteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CREW_KEY })
      qc.invalidateQueries({ queryKey: INCOMING_KEY })
      qc.invalidateQueries({ queryKey: DISCOVER_KEY })
    },
  })
}

export function useDeclineInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: number) => declineIncomingInvite(inviteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INCOMING_KEY })
    },
  })
}
