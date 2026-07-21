import { describe, it, expect, beforeEach } from 'vitest'
import {
  STREAK_MILESTONES,
  streakMilestone,
  bestPrEffort,
  prCount,
  durationLabel,
  pbDedupKey,
  streakDedupKey,
  weeklyDedupKey,
  isoWeekKey,
  hasCelebrated,
  markCelebrated,
  STREAK_BREAK_MIN,
  detectStreakBreak,
  hasGenuineBreakDay,
  streakLastKey,
  streakBreakDedupKey,
  localDateKey,
  readStoredStreak,
  writeStoredStreak,
  type PrEffortLike,
} from '../celebration'

describe('streakMilestone', () => {
  it('returns the milestone only on an exact milestone day', () => {
    for (const m of STREAK_MILESTONES) expect(streakMilestone(m)).toBe(m)
  })
  it('returns null for non-milestone streaks (incl. day after)', () => {
    expect(streakMilestone(0)).toBeNull()
    expect(streakMilestone(1)).toBeNull()
    expect(streakMilestone(8)).toBeNull() // day after the 7 milestone
    expect(streakMilestone(29)).toBeNull()
    expect(streakMilestone(31)).toBeNull()
  })
  it('is tolerant of null/NaN input', () => {
    expect(streakMilestone(null)).toBeNull()
    expect(streakMilestone(undefined)).toBeNull()
    expect(streakMilestone(NaN)).toBeNull()
  })
})

describe('bestPrEffort', () => {
  const mk = (duration_s: number, ride_watts: number, is_pr: boolean): PrEffortLike => ({
    duration_s,
    ride_watts,
    is_pr,
  })
  it('returns the highest-wattage is_pr effort', () => {
    const efforts = [mk(5, 900, true), mk(60, 480, true), mk(1200, 305, true)]
    expect(bestPrEffort(efforts)?.ride_watts).toBe(900)
  })
  it('ignores non-PR efforts even if higher wattage', () => {
    const efforts = [mk(5, 1200, false), mk(1200, 305, true)]
    expect(bestPrEffort(efforts)?.ride_watts).toBe(305)
  })
  it('returns null when there is no real PB', () => {
    expect(bestPrEffort([mk(5, 900, false)])).toBeNull()
    expect(bestPrEffort([])).toBeNull()
    expect(bestPrEffort(null)).toBeNull()
    expect(bestPrEffort([mk(5, 0, true)])).toBeNull() // zero watts is not real
  })
  it('prCount counts season-best efforts', () => {
    expect(prCount([mk(5, 900, true), mk(60, 480, true), mk(1200, 305, false)])).toBe(2)
    expect(prCount(null)).toBe(0)
  })
})

describe('durationLabel', () => {
  it('formats seconds, minutes and hours', () => {
    expect(durationLabel(20)).toBe('20s')
    expect(durationLabel(300)).toBe('5min')
    expect(durationLabel(3600)).toBe('1h')
  })
})

describe('dedup keys', () => {
  it('are stable, namespaced, and instance-scoped', () => {
    expect(pbDedupKey(42)).toBe('celebrate:pb:42')
    expect(streakDedupKey(7)).toBe('celebrate:streak:7')
    expect(weeklyDedupKey('2026-W30')).toBe('celebrate:weekly:2026-W30')
  })
})

describe('isoWeekKey', () => {
  it('produces YYYY-Www and is stable across a week', () => {
    // Local-constructed to mirror real use (athlete-local `new Date()`).
    // 2026-07-20 is a Monday, 2026-07-26 a Sunday — same ISO week.
    expect(isoWeekKey(new Date(2026, 6, 20, 9))).toBe(isoWeekKey(new Date(2026, 6, 26, 23)))
    expect(isoWeekKey(new Date(2026, 6, 20))).toMatch(/^2026-W\d{2}$/)
  })
  it('rolls to a new key the next week', () => {
    const a = isoWeekKey(new Date(2026, 6, 20)) // Mon
    const b = isoWeekKey(new Date(2026, 6, 27)) // next Mon
    expect(a).not.toBe(b)
  })
})

function mockLocalStorage() {
  const store: Record<string, string> = {}
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage
}

describe('hasCelebrated / markCelebrated (dedup gate)', () => {
  beforeEach(mockLocalStorage)
  it('is false until marked, true after — fires once', () => {
    const key = pbDedupKey(1001)
    expect(hasCelebrated(key)).toBe(false)
    markCelebrated(key)
    expect(hasCelebrated(key)).toBe(true)
    // A second "instance" of the same achievement stays gated.
    expect(hasCelebrated(key)).toBe(true)
  })
})

describe('detectStreakBreak', () => {
  it('fires when a meaningful streak collapses back to 0 or 1', () => {
    expect(detectStreakBreak(7, 0)).toEqual({ broke: true, brokenLength: 7 })
    expect(detectStreakBreak(12, 1)).toEqual({ broke: true, brokenLength: 12 })
    // Exactly at the threshold.
    expect(detectStreakBreak(STREAK_BREAK_MIN, 0)).toEqual({
      broke: true,
      brokenLength: STREAK_BREAK_MIN,
    })
  })
  it('never fires on first load with no history (prev == null)', () => {
    expect(detectStreakBreak(null, 0)).toEqual({ broke: false, brokenLength: 0 })
    expect(detectStreakBreak(undefined, 0)).toEqual({ broke: false, brokenLength: 0 })
  })
  it('never fires on a continuing or growing streak', () => {
    expect(detectStreakBreak(7, 8).broke).toBe(false) // grew
    expect(detectStreakBreak(7, 7).broke).toBe(false) // held
    expect(detectStreakBreak(7, 5).broke).toBe(false) // dipped but still going (>1)
  })
  it('never fires for a short streak (below the meaningful threshold)', () => {
    expect(detectStreakBreak(2, 0).broke).toBe(false)
    expect(detectStreakBreak(1, 0).broke).toBe(false)
  })
  it('is tolerant of non-finite input', () => {
    expect(detectStreakBreak(NaN, 0).broke).toBe(false)
    expect(detectStreakBreak(7, NaN).broke).toBe(false)
    expect(detectStreakBreak(7, undefined).broke).toBe(false)
  })
})

describe('hasGenuineBreakDay (rest protection)', () => {
  it('true only when a break-causing day is present', () => {
    expect(hasGenuineBreakDay([{ state: 'trained' }, { state: 'missed' }])).toBe(true)
    expect(hasGenuineBreakDay([{ state: 'unplanned' }])).toBe(true)
  })
  it('false when every recent gap was a protected rest or paused day', () => {
    // A planned Ruhetag or a sick/injured pause must never trip a break.
    expect(hasGenuineBreakDay([{ state: 'trained' }, { state: 'rest' }, { state: 'today' }])).toBe(
      false,
    )
    expect(hasGenuineBreakDay([{ state: 'paused' }, { state: 'rest' }])).toBe(false)
    expect(hasGenuineBreakDay([{ state: 'upcoming' }])).toBe(false)
  })
  it('is tolerant of empty/null week', () => {
    expect(hasGenuineBreakDay(null)).toBe(false)
    expect(hasGenuineBreakDay([])).toBe(false)
  })
})

describe('streak-break dedup + store keys', () => {
  beforeEach(mockLocalStorage)
  it('namespaces the per-user last-streak store', () => {
    expect(streakLastKey(8)).toBe('streak:last:8')
  })
  it('scopes the dedup key to user, broken length, and detection day', () => {
    expect(streakBreakDedupKey(8, 7, '2026-07-21')).toBe('streakbreak:8:7:2026-07-21')
  })
  it('localDateKey is a stable local YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 6, 5, 23, 30))).toBe('2026-07-05')
  })
  it('round-trips the stored streak, tolerating a missing/garbage value', () => {
    expect(readStoredStreak(8)).toBeNull()
    writeStoredStreak(8, 7)
    expect(readStoredStreak(8)).toBe(7)
    writeStoredStreak(8, 0)
    expect(readStoredStreak(8)).toBe(0)
  })
  it('a real break end-to-end: fires once, then the store reflects the collapse', () => {
    // Seed a peak, observe the collapse, dedup, then confirm the store moved.
    writeStoredStreak(8, 7)
    const prev = readStoredStreak(8)
    const { broke, brokenLength } = detectStreakBreak(prev, 0)
    expect(broke).toBe(true)
    const key = streakBreakDedupKey(8, brokenLength, '2026-07-21')
    expect(hasCelebrated(key)).toBe(false)
    markCelebrated(key)
    writeStoredStreak(8, 0)
    expect(hasCelebrated(key)).toBe(true) // a re-render the same day no-ops
    expect(readStoredStreak(8)).toBe(0)
  })
})

// ── Sequential celebration queue ────────────────────────────────────────────
import {
  celebrationPriority,
  emptyQueue,
  enqueueCelebration,
  advanceCelebration,
  type QueueEntry,
} from '../celebration'

interface TestCard extends QueueEntry {
  label: string
}

let seqCounter = 0
function card(kind: string, label: string): TestCard {
  return { seq: seqCounter++, priority: celebrationPriority(kind), label }
}

describe('celebration queue', () => {
  beforeEach(() => {
    seqCounter = 0
  })

  it('empty queue has no head and no run', () => {
    const q = emptyQueue<TestCard>()
    expect(q.head).toBeNull()
    expect(q.pending).toEqual([])
    expect(q.index).toBe(0)
    expect(q.total).toBe(0)
  })

  it('first enqueue becomes the head and starts a 1/1 run', () => {
    const q = enqueueCelebration(emptyQueue<TestCard>(), card('pb', 'PB'))
    expect(q.head?.label).toBe('PB')
    expect(q.index).toBe(1)
    expect(q.total).toBe(1)
    expect(q.pending).toEqual([])
  })

  it('enqueues in the same tick queue behind the head, biggest-first', () => {
    // Weekly fires first, then a PB and a streak land while weekly is showing.
    let q = enqueueCelebration(emptyQueue<TestCard>(), card('weekly', 'weekly'))
    q = enqueueCelebration(q, card('streak', 'streak'))
    q = enqueueCelebration(q, card('pb', 'pb'))
    // Head stays the one already on screen (never reordered out from under the user).
    expect(q.head?.label).toBe('weekly')
    expect(q.total).toBe(3)
    // Pending is priority-ordered: pb (5) before streak (3).
    expect(q.pending.map((c) => c.label)).toEqual(['pb', 'streak'])
  })

  it('advances sequentially through the whole run, then drains to empty', () => {
    let q = enqueueCelebration(emptyQueue<TestCard>(), card('weekly', 'weekly'))
    q = enqueueCelebration(q, card('streak', 'streak'))
    q = enqueueCelebration(q, card('pb', 'pb'))

    // 1/3: weekly (was already playing)
    expect(q.head?.label).toBe('weekly')
    expect(q.index).toBe(1)
    expect(q.total).toBe(3)

    // 2/3: highest-priority pending → pb
    q = advanceCelebration(q)
    expect(q.head?.label).toBe('pb')
    expect(q.index).toBe(2)
    expect(q.total).toBe(3)

    // 3/3: streak
    q = advanceCelebration(q)
    expect(q.head?.label).toBe('streak')
    expect(q.index).toBe(3)
    expect(q.total).toBe(3)

    // drain → empty, run resets so the next burst starts clean
    q = advanceCelebration(q)
    expect(q.head).toBeNull()
    expect(q.index).toBe(0)
    expect(q.total).toBe(0)
  })

  it('within equal priority, FIFO (seq) order is preserved (stable sort)', () => {
    let q = enqueueCelebration(emptyQueue<TestCard>(), card('pb', 'head'))
    // three generics enqueued in order a, b, c — all priority 1
    q = enqueueCelebration(q, card('generic', 'a'))
    q = enqueueCelebration(q, card('generic', 'b'))
    q = enqueueCelebration(q, card('generic', 'c'))
    expect(q.pending.map((c) => c.label)).toEqual(['a', 'b', 'c'])
  })

  it('a break card sorts after any happy card in the same burst', () => {
    let q = enqueueCelebration(emptyQueue<TestCard>(), card('pb', 'pb'))
    q = enqueueCelebration(q, card('break', 'break'))
    q = enqueueCelebration(q, card('streak', 'streak'))
    // pb already on screen; pending ordered streak (3) before break (0)
    expect(q.head?.label).toBe('pb')
    expect(q.pending.map((c) => c.label)).toEqual(['streak', 'break'])
  })

  it('advancing an empty queue is a no-op (stays empty)', () => {
    const q = advanceCelebration(emptyQueue<TestCard>())
    expect(q.head).toBeNull()
    expect(q.total).toBe(0)
  })

  it('a card enqueued mid-run grows the total and still plays', () => {
    let q = enqueueCelebration(emptyQueue<TestCard>(), card('pb', 'pb'))
    // one card shown so far
    q = advanceCelebration(q) // drains to empty (nothing pending)
    expect(q.head).toBeNull()
    // a fresh, separate burst starts a new 1/1 run
    q = enqueueCelebration(q, card('streak', 'streak'))
    expect(q.head?.label).toBe('streak')
    expect(q.total).toBe(1)
    expect(q.index).toBe(1)
  })
})

describe('celebrationPriority', () => {
  it('orders pb > ftp > streak > weekly > generic > break', () => {
    expect(celebrationPriority('pb')).toBeGreaterThan(celebrationPriority('ftp'))
    expect(celebrationPriority('ftp')).toBeGreaterThan(celebrationPriority('streak'))
    expect(celebrationPriority('streak')).toBeGreaterThan(celebrationPriority('weekly'))
    expect(celebrationPriority('weekly')).toBeGreaterThan(celebrationPriority('generic'))
    expect(celebrationPriority('generic')).toBeGreaterThan(celebrationPriority('break'))
  })
  it('unknown kinds fall back to the generic weight', () => {
    expect(celebrationPriority('mystery')).toBe(celebrationPriority('generic'))
  })
})
