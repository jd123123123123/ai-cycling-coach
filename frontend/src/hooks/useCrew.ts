import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptCrewInvite,
  createCrew,
  disbandCrew,
  discoverMembers,
  fetchCrewStandings,
  fetchMyCrew,
  inviteMemberByUser,
  inviteToCrew,
  leaveCrew,
  revokeCrewInvite,
  type CrewMineResponse,
  type DiscoverMember,
  type StandingsResponse,
} from '../api/crew'

// Server-backed crew hooks. Phase 1 of the Crew backend.
// docs/superpowers/specs/2026-05-13-crew-backend-design.md

const MY_CREW_KEY = ['crew', 'me'] as const
const STANDINGS_KEY_BASE = ['crew', 'standings'] as const

// Re-export common types so callers don't have to dual-import. The
// `CrewMember` legacy alias is defined further down for back-compat with
// the old CrewTab; new code should prefer `CrewMemberRead` from api/crew.
export type {
  CrewMineResponse,
  CrewInviteRead,
  StandingsResponse,
  StandingRow,
} from '../api/crew'

export function useMyCrew() {
  return useQuery<CrewMineResponse>({
    queryKey: MY_CREW_KEY,
    queryFn: fetchMyCrew,
    staleTime: 60 * 1000,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}

export function useCrewStandings(week?: string) {
  return useQuery<StandingsResponse>({
    queryKey: [...STANDINGS_KEY_BASE, week ?? 'current'],
    queryFn: () => fetchCrewStandings(week),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      // 404 = "not in a crew" — no point retrying
      if (status === 401 || status === 403 || status === 404) return false
      return failureCount < 1
    },
  })
}

export function useCreateCrew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createCrew(name),
    onSuccess: (data) => qc.setQueryData(MY_CREW_KEY, data),
  })
}

export function useInviteToCrew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ crewId, email }: { crewId: number; email: string }) =>
      inviteToCrew(crewId, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_CREW_KEY }),
  })
}

export function useRevokeCrewInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: number) => revokeCrewInvite(inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_CREW_KEY }),
  })
}

export function useAcceptCrewInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => acceptCrewInvite(token),
    onSuccess: (data) => qc.setQueryData(MY_CREW_KEY, data),
  })
}

export function useLeaveCrew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => leaveCrew(),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_CREW_KEY }),
  })
}

export function useDisbandCrew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (crewId: number) => disbandCrew(crewId),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_CREW_KEY }),
  })
}

const DISCOVER_KEY = ['crew', 'discover'] as const

// Find other athletes on the app (handles only). `q` filters by handle.
export function useDiscoverMembers(q: string) {
  return useQuery<DiscoverMember[]>({
    queryKey: [...DISCOVER_KEY, q],
    queryFn: () => discoverMembers(q || undefined),
    staleTime: 30 * 1000,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}

export function useInviteMemberByUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ crewId, userId }: { crewId: number; userId: number }) =>
      inviteMemberByUser(crewId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_CREW_KEY })
      qc.invalidateQueries({ queryKey: DISCOVER_KEY })
    },
  })
}

// ──────────────────────────────────────────────────────────────────────
// Back-compat shim — the old CrewTab consumed `{ crew, invite, remove }`
// from `useCrew()`. We keep that signature alive while the tab gets fully
// integrated against the new server-backed shape. Mapping:
//   crew    : members (excluding you) + pending invites, both as
//             { id: string, handle: string, status: 'joined'|'pending' }
//   invite  : if input looks like an email AND we're in a crew, calls
//             the server. Otherwise no-op (the old localStorage path is
//             gone — handle-only invites no longer make sense).
//   remove  : if id starts with "inv-", calls revoke on the invite id.
//             Member removal is intentionally not supported yet.
// ──────────────────────────────────────────────────────────────────────

interface LegacyCrewMember {
  id: string
  handle: string
  invitedAt: string
  status: 'pending' | 'joined'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function useCrew() {
  const { data } = useMyCrew()
  const invite = useInviteToCrew()
  const revoke = useRevokeCrewInvite()

  const crewId = data?.crew?.id ?? null
  const members = data?.members ?? []
  const pendingInvites = data?.pending_invites ?? []

  const crew: LegacyCrewMember[] = [
    ...members
      .filter((m) => m.role !== 'owner' || members.length > 1)
      // Drop the caller — the old shape was "other members"; the caller is
      // 'You' in the standings.
      .filter((m) => !m.role || m.handle)
      .map((m) => ({
        id: `mbr-${m.user_id}`,
        handle: m.handle,
        invitedAt: m.joined_at,
        status: 'joined' as const,
      })),
    ...pendingInvites.map((i) => ({
      id: `inv-${i.id}`,
      handle: i.invitee_email,
      invitedAt: i.created_at,
      status: 'pending' as const,
    })),
  ]

  function inviteFn(handle: string) {
    const trimmed = handle.trim()
    if (!trimmed) return
    if (!crewId) {
      // Without a crew, the legacy hook can't send an invite. Users can
      // create the crew via the new flow.
      return
    }
    if (!EMAIL_RE.test(trimmed)) {
      // Server only accepts email addresses; silently ignore non-emails
      // until the CrewTab adopts the new email-only form.
      return
    }
    invite.mutate({ crewId, email: trimmed })
  }

  function removeFn(id: string) {
    if (!id.startsWith('inv-')) return  // only invites are revocable here
    const inviteId = Number(id.slice(4))
    if (!Number.isFinite(inviteId)) return
    revoke.mutate(inviteId)
  }

  return { crew, invite: inviteFn, remove: removeFn }
}

// Legacy alias for callers that imported CrewMember from this module.
export type CrewMember = LegacyCrewMember
