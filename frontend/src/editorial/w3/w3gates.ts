/**
 * ONE INTERRUPTION PER APP OPEN.
 *
 * Three watchers can decide to take the screen on the same launch: the morning
 * briefing (daily), the week review (Monday-ish), and the setup gate (until the
 * garage is finished). On the first Monday morning of a rider who has not made
 * a bike, all three are eligible at once — and each was written not knowing the
 * others exist, so the rider would get a sheet on top of a sheet on top of a
 * navigation.
 *
 * A claim fixes that without any of them having to know what the others are.
 * The first to ask wins the launch; the rest stay silent and try again next
 * time. Nothing is lost: every one of them is idempotent and re-fires on its
 * own schedule.
 *
 * WHY MODULE STATE AND NOT STORAGE. The claim is about THIS app open, not about
 * this rider. It must reset when the app does — a claim written to storage
 * would silence tomorrow's briefing because today's already ran.
 *
 * ORDERING IS BY DELAY, DELIBERATELY. Each watcher waits a beat before opening
 * so the screen underneath can settle. Those beats are the priority: the
 * briefing's is the shortest, so on a morning where several are eligible the
 * one about TODAY wins and the housekeeping waits.
 */

let holder: string | null = null

/** Take the launch if it is still free. Returns false when someone else has it
 *  — the caller must then stay silent rather than queue. */
export function claimGate(id: string): boolean {
  if (holder !== null && holder !== id) return false
  holder = id
  return true
}

/**
 * TAKE THE LAUNCH WHETHER OR NOT IT IS FREE.
 *
 * `claimGate` implements a courtesy between INVITATIONS: three watchers that
 * each have something nice to offer, and only one of them gets to say it. A
 * REQUIRED step is not in that conversation. If a rider cannot use the app
 * until they have made their rider, then losing the race to the morning
 * briefing does not mean "ask again tomorrow", it means the app silently does
 * not work today.
 *
 * So this exists for the one caller that must always open, and it is
 * deliberately harder to reach for than `claimGate`: seizing means whatever
 * else was about to be shown is not shown, and that is only ever the right
 * trade when the thing seizing is a gate the rider has to pass anyway.
 */
export function seizeGate(id: string): void {
  holder = id
}

/** Give it back — a gate that decided NOT to open after claiming, or one whose
 *  sheet the rider has dismissed, should not hold the launch for the rest of
 *  the session. */
export function releaseGate(id: string): void {
  if (holder === id) holder = null
}

/** Who holds it, for tests. */
export function gateHolder(): string | null {
  return holder
}

/** Tests only — a module-level claim would otherwise leak between cases. */
export function resetGates(): void {
  holder = null
}
