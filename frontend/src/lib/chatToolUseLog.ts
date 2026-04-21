/**
 * chatToolUseLog — module-level snapshot of the current chat session's
 * tool-use log.
 *
 * Why a module singleton (not React context): the TransparencyDrawer is a
 * sibling of CoachChat, both mount directly under the dashboard shell.
 * Wiring a context up to the shell would force the shell to own chat state,
 * breaking the ephemeral-session invariant from 05-02 (chat state lives
 * inside CoachChat, not the shell). A plain module variable + subscribe
 * callback keeps chat state inside CoachChat while still letting the drawer
 * read the log on open.
 *
 * Session-local invariant: CoachChat wipes the snapshot on drawer close
 * (see reset flow). TransparencyDrawer reads the current snapshot on open
 * — empty array means "no tools used in this session yet".
 */
import type { ToolUseLogEntry } from '../hooks/useChatStream'

let _snapshot: ToolUseLogEntry[] = []
const _subscribers = new Set<(snap: ToolUseLogEntry[]) => void>()

export function setToolUseLogSnapshot(next: ToolUseLogEntry[]): void {
  _snapshot = next
  _subscribers.forEach((cb) => cb(_snapshot))
}

export function getToolUseLogSnapshot(): ToolUseLogEntry[] {
  return _snapshot
}

export function subscribeToolUseLog(
  cb: (snap: ToolUseLogEntry[]) => void,
): () => void {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}
