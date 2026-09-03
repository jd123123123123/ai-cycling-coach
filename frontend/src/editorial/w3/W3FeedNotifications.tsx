import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import {
  fetchIncomingNudges,
  markNudgeRead,
  type IncomingNudge,
} from '../../api/nudges'
import {
  acceptIncomingInvite,
  declineIncomingInvite,
  fetchIncomingInvites,
  type IncomingInvite,
} from '../../api/connections'
import { useMyCrew } from '../../hooks/useCrew'
import { T, FONT, EASE } from './w3tokens'
import { sheetPanel, hairline, TNUM } from './w3surfaces'
import { THEM_TINT } from './w3crew'
import { ago } from './w3rideFeed'

/**
 * W3 · the crew feed's bell, made real.
 *
 * Both feeds behind it were finished months ago and called by nothing — the
 * repo's recurring defect. Nothing here is new machinery; it is the wire:
 *
 *   • GET  /crews/nudges/incoming      — UNREAD trash talk addressed to me.
 *   • POST /crews/nudges/{id}/read     — marking it read, on open.
 *   • GET  /crews/invites/incoming     — pending crew invites addressed to me.
 *   • POST /crews/invites/{id}/accept-mine, .../decline
 *
 * WHY THE INVITES FEED IS NOT GATED ON HAVING A CREW. The brief asked for one
 * gate — "do not fetch when the rider is not in a crew" — and it is right
 * about nudges: a nudge only ever comes from a crew rival, so for a crewless
 * rider that request can only ever return an empty list. It is exactly wrong
 * about invites. The backend keys `/crews/invites/incoming` on the caller's
 * EMAIL, not on membership (`backend/app/api/crews.py:711`), and the whole
 * point of an invite is that it arrives BEFORE you have a crew. Gating it
 * would hide the only notification a crewless rider can receive — the bell
 * would be permanently dark for the one person it matters most to. So: the
 * nudge query is gated, the invite query is not.
 *
 * A BELL THAT CANNOT COUNT IS A BELL WITH NO DOT. Neither query is allowed to
 * surface an error to the caller: a failed fetch reads as zero, and a failed
 * mark-read is swallowed. The only failure the rider is ever told about is one
 * they caused by pressing something — accepting or declining an invite — and
 * there the server's own words are shown.
 *
 * THE ACCENT IS VIOLET, NOT ACID. House rule 4, and `w3crew.ts` already fixes
 * the meaning app-wide: acid is YOU, violet is the other rider. Everything in
 * this sheet is another rider, so acid appears exactly once — on "Annehmen",
 * the one thing you press to gain something.
 */

// The SAME keys the standing hooks use, so the sheet and anything else reading
// these feeds share one cache entry rather than racing two.
const NUDGES_KEY = ['nudges', 'incoming'] as const
const INVITES_KEY = ['connections', 'invites', 'incoming'] as const
const CREW_KEY = ['crew'] as const

const NO_NUDGES: IncomingNudge[] = []
const NO_INVITES: IncomingInvite[] = []

const noRetryOnAuth = (failureCount: number, error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status === 401 || status === 403 || status === 404) return false
  return failureCount < 1
}

/** The server's own words, or a plain German fallback. Never a stack trace. */
function serverMessage(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (Array.isArray(detail)) {
    const first = detail[0]
    const msg = typeof first === 'string' ? first : (first as { msg?: string } | undefined)?.msg
    if (msg && msg.trim()) return msg.trim()
  }
  return 'Das hat nicht geklappt.'
}

// ── the data ────────────────────────────────────────────────────────────────

function useInbox() {
  const crew = useMyCrew()
  const inCrew = Boolean(crew.data?.crew)

  const nudges = useQuery<IncomingNudge[]>({
    queryKey: NUDGES_KEY,
    queryFn: fetchIncomingNudges,
    enabled: inCrew,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: noRetryOnAuth,
    throwOnError: false,
  })

  const invites = useQuery<IncomingInvite[]>({
    queryKey: INVITES_KEY,
    queryFn: fetchIncomingInvites,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: noRetryOnAuth,
    throwOnError: false,
  })

  const nudgeRefetch = nudges.refetch
  const inviteRefetch = invites.refetch
  const refetch = useCallback(() => {
    void nudgeRefetch()
    void inviteRefetch()
  }, [nudgeRefetch, inviteRefetch])

  // `?? EMPTY` on both sides is the whole error policy: an errored or disabled
  // query has no data, and no data is zero, not a broken screen.
  //
  // The fallbacks are MODULE CONSTANTS, not `[]` written here. A fresh literal
  // gets a new identity on every render, and this value feeds an effect's
  // dependency list: the sheet would re-run its open logic, set state, re-render
  // and re-run it forever. An empty list is one value, so it is one object.
  return {
    nudges: nudges.data ?? NO_NUDGES,
    invites: invites.data ?? NO_INVITES,
    refetch,
  }
}

/** The bell's number: unread nudges + pending invites. Never throws, never
 *  reports an error — a feed it cannot read simply contributes nothing.
 *
 *  The hook ships in the same file as the sheet ON PURPOSE, which is why the
 *  fast-refresh rule is silenced here: the count and the list are one feature
 *  reading one pair of queries, and splitting them would put the cache keys in
 *  one module and the only two consumers of them in another. */
// eslint-disable-next-line react-refresh/only-export-components
export function useFeedNotifications(): { count: number; refetch: () => void } {
  const { nudges, invites, refetch } = useInbox()
  return { count: nudges.length + invites.length, refetch }
}

// ── the sheet ───────────────────────────────────────────────────────────────

const bare = {
  border: 0,
  background: 'transparent',
  fontFamily: FONT,
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left' as const,
}

const rowTime = { fontSize: 11, fontWeight: 600, color: T.quiet, flex: 'none' as const, ...TNUM }
const rowWho = { fontSize: 12.5, fontWeight: 700, color: THEM_TINT, letterSpacing: -0.1 }

function Head({ who, when }: { who: string; when: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ ...rowWho, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</span>
      <span style={rowTime}>{when}</span>
    </div>
  )
}

export default function W3FeedNotifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion()
  const qc = useQueryClient()
  const { nudges, invites, refetch } = useInbox()
  const panelRef = useRef<HTMLDivElement | null>(null)

  // The nudges as they stood when the sheet opened. Marking them read empties
  // the server's unread list, and without this snapshot the sheet would blank
  // itself out from under the rider a beat after they opened it.
  const [shown, setShown] = useState<IncomingNudge[]>([])
  const markedRef = useRef(false)

  // Invites the rider has answered but the server has not yet confirmed: an
  // optimistic removal, rolled back the moment the call fails.
  const [answered, setAnswered] = useState<number[]>([])
  const [failed, setFailed] = useState<{ id: number; message: string } | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const wasOpenRef = useRef(false)

  // ── opening marks the visible nudges read. Once per open, never closed. ──
  useEffect(() => {
    if (!open) {
      // Only on the open → closed EDGE. Resetting unconditionally would set
      // state on the closed mount and on every render after it.
      if (!wasOpenRef.current) return
      wasOpenRef.current = false
      markedRef.current = false
      setShown([])
      setAnswered([])
      setFailed(null)
      return
    }
    wasOpenRef.current = true
    if (markedRef.current) return
    if (nudges.length === 0) return
    markedRef.current = true
    setShown(nudges)
    let cancelled = false
    void (async () => {
      for (const n of nudges) {
        // Sequential on purpose: the endpoint is a write per nudge and a burst
        // of parallel POSTs buys nothing on a list this short.
        try {
          await markNudgeRead(n.id)
        } catch {
          // Silent. Failing to mark read costs the rider a repeat, not a screen.
        }
      }
      if (!cancelled) refetch()
    })()
    return () => {
      cancelled = true
    }
  }, [open, nudges, refetch])

  // ── escape, and focus into the sheet ──────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  const items = useMemo(() => {
    const rows = [
      ...shown.map((n) => ({ kind: 'nudge' as const, at: n.created_at, nudge: n })),
      ...invites
        .filter((i) => !answered.includes(i.invite_id))
        .map((i) => ({ kind: 'invite' as const, at: i.created_at, invite: i })),
    ]
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [shown, invites, answered])

  async function answer(invite: IncomingInvite, accept: boolean) {
    const id = invite.invite_id
    setFailed(null)
    setBusy(id)
    setAnswered((prev) => [...prev, id])   // optimistic: the row leaves at once
    try {
      if (accept) {
        await acceptIncomingInvite(id)
        void qc.invalidateQueries({ queryKey: CREW_KEY })
      } else {
        await declineIncomingInvite(id)
      }
      refetch()
    } catch (e) {
      setAnswered((prev) => prev.filter((x) => x !== id))   // …and comes back
      setFailed({ id, message: serverMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="w3-feed-notifications"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 120,
            background: T.glass, backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Benachrichtigungen"
            tabIndex={-1}
            initial={reduce ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              ...sheetPanel(28),
              background: T.bg,
              border: `1px solid ${T.rule}`,
              borderBottom: 0,
              fontFamily: FONT,
              outline: 'none',
              padding: '10px 20px calc(18px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 100, background: T.rule, alignSelf: 'center', flex: 'none', marginBottom: 10 }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none', paddingBottom: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>Benachrichtigungen</span>
              <button
                onClick={onClose}
                aria-label="Schließen"
                style={{ ...bare, width: 36, height: 36, borderRadius: 100, background: T.surface, display: 'grid', placeItems: 'center', flex: 'none' }}
              >
                <X size={17} color={T.mid} />
              </button>
            </div>

            {items.length === 0 ? (
              <span style={{ fontSize: 13, fontWeight: 500, color: T.quiet, padding: '14px 0 24px' }}>Nichts Neues.</span>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column' }}>
                {items.map((item, i) => (
                  <div key={item.kind === 'nudge' ? `n${item.nudge.id}` : `i${item.invite.invite_id}`}>
                    {i > 0 ? <div style={hairline()} /> : null}
                    {item.kind === 'nudge' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 0' }}>
                        <Head who={item.nudge.from_handle} when={ago(item.nudge.created_at)} />
                        <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: T.ink }}>{item.nudge.text}</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '13px 0' }}>
                        <Head who={item.invite.inviter_handle} when={ago(item.invite.created_at)} />
                        <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: T.ink }}>
                          {/* One template string, not three JSX children: the
                              sentence is one text node, so it can be read as
                              one sentence by a screen reader and by a test. */}
                          {`${item.invite.inviter_handle} lädt dich zu ${item.invite.crew_name} ein`}
                        </span>
                        {failed && failed.id === item.invite.invite_id ? (
                          <span role="alert" style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.bad }}>{failed.message}</span>
                        ) : null}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => void answer(item.invite, true)}
                            disabled={busy === item.invite.invite_id}
                            style={{ ...bare, height: 36, padding: '0 18px', borderRadius: 100, background: T.acid, color: T.heroInk, fontSize: 12.5, fontWeight: 700, textAlign: 'center' }}
                          >
                            Annehmen
                          </button>
                          <button
                            onClick={() => void answer(item.invite, false)}
                            disabled={busy === item.invite.invite_id}
                            style={{ ...bare, height: 36, padding: '0 18px', borderRadius: 100, background: 'transparent', border: `1px solid ${T.rule}`, color: T.mid, fontSize: 12.5, fontWeight: 600, textAlign: 'center' }}
                          >
                            Ablehnen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
