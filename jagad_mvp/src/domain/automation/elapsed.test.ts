import { describe, expect, it } from 'vitest'

import { breachKey, elapsedTicks } from './elapsed'

const NOW = new Date('2026-08-26T10:00:00.000Z')

const sweep = (records: Parameters<typeof elapsedTicks>[0]['records']) =>
  elapsedTicks({ records, recipeKey: 'inquiry.tatBreach', recipeVersion: 1, now: NOW })

describe('records past a deadline they carry themselves', () => {
  it('finds the one that is late and leaves the one that is not', () => {
    const ticks = sweep([
      { id: 'inq-1', dueAt: '2026-08-26T09:00:00.000Z', open: true },
      { id: 'inq-2', dueAt: '2026-08-26T11:00:00.000Z', open: true },
    ])

    expect(ticks.map((tick) => tick.recordId)).toEqual(['inq-1'])
    expect(ticks[0].lateByMinutes).toBe(60)
  })

  it('treats the deadline instant itself as passed', () => {
    expect(sweep([{ id: 'inq-1', dueAt: NOW.toISOString(), open: true }])).toHaveLength(1)
  })

  it('leaves closed records alone — a finished task is not late', () => {
    expect(sweep([{ id: 'inq-1', dueAt: '2026-08-01T09:00:00.000Z', open: false }])).toHaveLength(0)
  })

  it('leaves a record that promised nothing alone', () => {
    expect(sweep([{ id: 'inq-1', dueAt: null, open: true }])).toHaveLength(0)
  })

  it('skips one unreadable date rather than losing the whole sweep', () => {
    const ticks = sweep([
      { id: 'inq-bad', dueAt: 'the fifteenth', open: true },
      { id: 'inq-1', dueAt: '2026-08-26T09:00:00.000Z', open: true },
    ])
    expect(ticks.map((tick) => tick.recordId)).toEqual(['inq-1'])
  })
})

describe('the breach key', () => {
  it('carries no instant of execution, so a second evaluation computes the same key', () => {
    const first = sweep([{ id: 'inq-1', dueAt: '2026-08-26T09:00:00.000Z', open: true }])
    const later = elapsedTicks({
      records: [{ id: 'inq-1', dueAt: '2026-08-26T09:00:00.000Z', open: true }],
      recipeKey: 'inquiry.tatBreach',
      recipeVersion: 1,
      now: new Date('2026-08-27T10:00:00.000Z'),
    })

    expect(first[0].firedFor).toBe(later[0].firedFor)
    // Only the lateness moved, which is the number the sentence reports.
    expect(later[0].lateByMinutes).toBeGreaterThan(first[0].lateByMinutes)
  })

  it('moves when the deadline moves, so an extended TAT breaches again', () => {
    expect(
      breachKey({
        recordId: 'inq-1',
        recipeKey: 'inquiry.tatBreach',
        recipeVersion: 1,
        dueAt: '2026-08-26T09:00:00.000Z',
      }),
    ).not.toBe(
      breachKey({
        recordId: 'inq-1',
        recipeKey: 'inquiry.tatBreach',
        recipeVersion: 1,
        dueAt: '2026-08-26T17:00:00.000Z',
      }),
    )
  })

  it('separates two records that share a deadline', () => {
    const ticks = sweep([
      { id: 'inq-1', dueAt: '2026-08-26T09:00:00.000Z', open: true },
      { id: 'inq-2', dueAt: '2026-08-26T09:00:00.000Z', open: true },
    ])
    expect(new Set(ticks.map((tick) => tick.firedFor)).size).toBe(2)
  })
})
