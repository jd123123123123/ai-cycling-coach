import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CROSS-TRAINING IS ACKNOWLEDGED, NOT DROPPED.
 *
 * A gym session or a run earns an honest hrTSS at ingestion — `_compute_tss`
 * scores every sport, down to padel and hiking — and that load reaches
 * CTL/ATL/TSB through the PMC total, which sums across sports deliberately.
 * The week strip therefore already drew such a day as trained and already
 * counted it against the week's TSS budget.
 *
 * What it did NOT do was say anything about it: the map feeding each day's
 * duration and heart rate filtered to `sport === 'cycling'`, so a rider saw a
 * day marked done, carrying load, with three dashes where the session should
 * be. The app had noticed their training everywhere except on the screen.
 *
 * These are source-level assertions rather than render assertions because the
 * thing that regressed is a FILTER, and a filter is invisible in a snapshot of
 * a week that happens to contain only rides.
 */
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('the week strip counts training that was not a ride', () => {
  it('does not filter the day map down to cycling', () => {
    const page = src('w3/W3TodayPage.tsx')
    const map = page.slice(page.indexOf('const actByDate'), page.indexOf('const todayPlan'))
    // The exact line this test exists to keep deleted.
    expect(map).not.toContain("if (a.sport !== 'cycling') continue")
    expect(map).toContain('sport: a.sport')
  })

  it('keeps a ride as the day when a brick day carries both', () => {
    const page = src('w3/W3TodayPage.tsx')
    // A ride outranks a heavier cross-training session on the same date: this
    // is a cycling app's strip and on a brick day the ride is what the plan
    // was about. Pinned because the obvious rewrite — biggest TSS wins — quietly
    // relabels a hard gym day as the day's session.
    //
    // ASSERTED ON THE RULE, NOT ON ONE SPELLING OF IT. This used to pin the
    // literal `isRide && cur.sport !== `, which the implementation stopped
    // matching the moment the comparison was lifted into a named boolean — a
    // readability change that broke a test about precedence. What must hold is
    // that a ride beats a non-ride, and that TSS only decides between two of
    // the same kind.
    expect(page).toMatch(/isRide && (!curIsRide|cur\.sport !== )/)
    expect(page).toContain('tss > cur.tss')
  })

  it('withholds power on a session that has no FTP to read it against', () => {
    const page = src('w3/W3TodayPage.tsx')
    expect(page).toContain('w: isRide ?')
    const sections = src('w3/W3Sections.tsx')
    // The column is dropped, not dashed: an empty cell under Ø LEISTUNG reads
    // as a ride whose power meter failed.
    expect(sections).toContain('day.actualSport ? [] : [')
  })

  it('names the sport so the day cannot pass as a ride', () => {
    const sections = src('w3/W3Sections.tsx')
    expect(sections).toContain('SPORT_DE')
    expect(sections).toContain('Krafttraining')
    // And it stays quiet on a ride, which needs no label here.
    expect(sections).toContain('{day.actualSport && (')
  })
})
