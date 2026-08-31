import { describe, expect, it } from 'vitest'
import { readLadder } from './ladder'
import type { Ladder } from './ladder'
import { dueTicks } from './ticks'
import type { DueRecord, DueTick } from './ticks'

const LADDER: Ladder = (() => {
  const result = readLadder({ offsetsDays: '45,30,15,7,1', graceOffsetsDays: '3,10', maxReminders: 3 })
  if (!result.ok) throw new Error(result.reason)
  return result.ladder
})()

/** POL-4437 as the story cast seeds it: cover ends on 28 August 2026. */
const POL_4437: DueRecord = { id: 'rnw-4437', anchorDate: '2026-08-28', sentCount: 0, open: true }

const RECIPE = { recipeKey: 'renewal.reminder', recipeVersion: 2 }

function ticksAt(day: string, records: readonly DueRecord[], fired: ReadonlySet<string> = new Set()) {
  return dueTicks({ records, ladder: LADDER, ...RECIPE, now: new Date(`${day}T09:00:00.000Z`), fired })
}

function keysOf(ticks: readonly DueTick[]): readonly string[] {
  return ticks.flatMap((tick) => [tick.firedFor, ...tick.supersedes.map((rung) => rung.firedFor)])
}

describe('the tick answers what should have fired by now', () => {
  it('fires nothing before the first rung is reached', () => {
    // 45 days before 28 August is 14 July. On the 13th nothing is due yet.
    expect(ticksAt('2026-07-13', [POL_4437])).toEqual([])
  })

  it('fires the 45-day rung on the day it is reached', () => {
    const ticks = ticksAt('2026-07-14', [POL_4437])
    expect(ticks).toHaveLength(1)
    expect(ticks[0]?.offsetDays).toBe(45)
    expect(ticks[0]?.supersedes).toEqual([])
  })

  it('walks the ladder down as the anchor approaches', () => {
    const fired = new Set<string>()
    const walked: number[] = []
    for (const day of ['2026-07-14', '2026-07-29', '2026-08-13', '2026-08-21', '2026-08-27']) {
      const ticks = ticksAt(day, [POL_4437], fired)
      for (const key of keysOf(ticks)) fired.add(key)
      if (ticks[0]) walked.push(ticks[0].offsetDays)
    }
    expect(walked).toEqual([45, 30, 15, 7, 1])
  })

  it('fires the grace rungs after the anchor, while win-back is still live', () => {
    // Three days past expiry: the most recent rung is the first grace one.
    const ticks = ticksAt('2026-08-31', [POL_4437])
    expect(ticks[0]?.offsetDays).toBe(-3)
  })
})

/**
 * The rule that stops this being a spam engine. A record whose rungs passed
 * unobserved gets one message, not five.
 */
describe('catch-up collapses to the most recent rung', () => {
  it('sends only the latest passed rung and supersedes the earlier ones', () => {
    // 21 August: the 45, 30, 15 and 7-day rungs have all passed unobserved.
    const ticks = ticksAt('2026-08-21', [POL_4437])
    expect(ticks).toHaveLength(1)
    expect(ticks[0]?.offsetDays).toBe(7)
    expect(ticks[0]?.supersedes.map((rung) => rung.offsetDays)).toEqual([15, 30, 45])
  })

  it('never walks the ladder backwards: a superseded rung does not fire later', () => {
    const first = ticksAt('2026-08-21', [POL_4437])
    const fired = new Set<string>(keysOf(first))

    // The very next evaluation, same day. Nothing is left to send.
    expect(ticksAt('2026-08-21', [POL_4437], fired)).toEqual([])

    // And the following rung is the 1-day one, not the 15 or 30 it skipped.
    const next = ticksAt('2026-08-27', [POL_4437], fired)
    expect(next[0]?.offsetDays).toBe(1)
  })
})

describe('the ledger makes the tick safe to run again', () => {
  it('is idempotent: ten evaluations of the same instant send once', () => {
    const fired = new Set<string>()
    let sends = 0
    for (let run = 0; run < 10; run += 1) {
      const ticks = ticksAt('2026-07-14', [POL_4437], fired)
      sends += ticks.length
      for (const key of keysOf(ticks)) fired.add(key)
    }
    expect(sends).toBe(1)
  })

  it('re-opens a rung when the recipe is edited, because the version is in the key', () => {
    const fired = new Set<string>(keysOf(ticksAt('2026-07-14', [POL_4437])))
    expect(ticksAt('2026-07-14', [POL_4437], fired)).toEqual([])

    const underV3 = dueTicks({
      records: [POL_4437],
      ladder: LADDER,
      recipeKey: 'renewal.reminder',
      recipeVersion: 3,
      now: new Date('2026-07-14T09:00:00.000Z'),
      fired,
    })
    expect(underV3[0]?.offsetDays).toBe(45)
  })
})

describe('what the ladder will not touch', () => {
  it('stops at the ceiling however many rungs are left', () => {
    const atCeiling: DueRecord = { ...POL_4437, sentCount: 3 }
    expect(ticksAt('2026-08-27', [atCeiling])).toEqual([])
  })

  it('leaves a closed record alone — renewed, lapsed or paid is not nudged', () => {
    expect(ticksAt('2026-08-27', [{ ...POL_4437, open: false }])).toEqual([])
  })

  it('throws on an unreadable anchor rather than silently skipping the record', () => {
    expect(() => ticksAt('2026-08-27', [{ ...POL_4437, anchorDate: '' }])).toThrow(/is not a date/)
  })

  it('handles many records independently, one rung each', () => {
    const ticks = ticksAt('2026-08-27', [
      POL_4437,
      { id: 'rnw-4441', anchorDate: '2026-08-31', sentCount: 0, open: true },
      { id: 'rnw-4402', anchorDate: '2027-02-23', sentCount: 0, open: true },
    ])
    expect(ticks.map((tick) => tick.recordId)).toEqual(['rnw-4437', 'rnw-4441'])
    expect(ticks.map((tick) => tick.offsetDays)).toEqual([1, 7])
  })
})
