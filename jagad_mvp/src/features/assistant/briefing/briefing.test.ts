import { describe, expect, it } from 'vitest'
import { BRIEFING_TEMPLATES, briefingClauses, briefingFor, snapshotCounts } from './briefing'
import { emptySnapshot, loadQueueSnapshot } from './snapshot'
import type { QueueSnapshot } from './snapshot'
import {
  aClaim,
  aQuotation,
  aRenewal,
  aTask,
  anInquiry,
  stubAssistantRepository,
} from '../stub-repository'
import type { StubRows } from '../stub-repository'
import type { Block } from '../blocks/blocks'

const NOW = new Date('2026-08-26T09:30:00.000Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

function snapshot(rows: StubRows): Promise<QueueSnapshot> {
  return loadQueueSnapshot(stubAssistantRepository(rows), NOW)
}

function paraText(blocks: readonly Block[]): string {
  return blocks
    .filter((block) => block.kind === 'para')
    .map((block) => block.text)
    .join(' ')
}

/**
 * The plan's own worked example, built out of rows: eighteen open, four of them
 * unassigned, two of them inside the turnaround window.
 */
function pipeline(): StubRows {
  const unassigned = Array.from({ length: 4 }, (_, index) =>
    anInquiry({ id: `u${index}`, systemNo: `INQ-90${index}`, status: 'new', ownerId: null, tatDueAt: null, assignedAt: null }),
  )
  const atRisk = Array.from({ length: 2 }, (_, index) =>
    anInquiry({
      id: `r${index}`,
      systemNo: `INQ-91${index}`,
      assignedAt: at(-HOUR),
      tatDueAt: at(2 * HOUR),
    }),
  )
  const comfortable = Array.from({ length: 12 }, (_, index) =>
    anInquiry({
      id: `c${index}`,
      systemNo: `INQ-92${index}`,
      assignedAt: at(-HOUR),
      tatDueAt: at(8 * HOUR),
    }),
  )
  const closed = [anInquiry({ id: 'won', status: 'converted' }), anInquiry({ id: 'lost', status: 'lost' })]

  return { inquiries: [...unassigned, ...atRisk, ...comfortable, ...closed] }
}

describe('the briefing is counted, never written', () => {
  it('reproduces the plan’s worked example from the rows themselves', async () => {
    const blocks = briefingFor('salesManager', await snapshot(pipeline()))
    const text = paraText(blocks)

    expect(text).toContain('18 open inquiries across the team.')
    expect(text).toContain('4 still unassigned.')
    expect(text).toContain('2 close to their TAT')
    expect(text).toContain('they reassign on their own and the customer waits longer')
  })

  it.each(Object.keys(BRIEFING_TEMPLATES))(
    'gives %s only numbers that came off the snapshot',
    async (templateKey) => {
      const state = await snapshot({
        ...pipeline(),
        quotations: [aQuotation({ id: 'q1' }), aQuotation({ id: 'q2', status: 'shared', sharedAt: at(-2 * DAY) })],
        tasks: [
          aTask({ id: 't1', dueAt: at(2 * DAY) }),
          aTask({ id: 't2', dueAt: at(-DAY) }),
          aTask({ id: 't3', kind: 'mandate_failure', dueAt: at(-2 * DAY) }),
          aTask({ id: 't4', kind: 'policy_entry', dueAt: at(3 * DAY) }),
        ],
        claims: [aClaim({ id: 'c1' }), aClaim({ id: 'c2', state: 'query_open', raisedAt: at(-40 * DAY) })],
        renewals: [aRenewal({ id: 'n1' }), aRenewal({ id: 'n2', state: 'lapsed' })],
      })

      const counts = Object.values(snapshotCounts(state))

      for (const entry of briefingClauses(templateKey, state)) {
        // The count is a real count of real rows...
        expect(counts).toContain(entry.count)
        // ...and it is the number the sentence prints, not one written beside it.
        expect(entry.lead.startsWith(String(entry.count))).toBe(true)
      }
    },
  )

  it.each(Object.keys(BRIEFING_TEMPLATES))('never prints a zero for %s', async (templateKey) => {
    const state = await snapshot({ inquiries: [anInquiry({ id: 'only', status: 'converted' })] })
    const text = paraText(briefingFor(templateKey, state))

    expect(text).not.toMatch(/(^|\s)0\s/)
    expect(text.length).toBeGreaterThan(0)
  })

  it.each(Object.keys(BRIEFING_TEMPLATES))(
    'says the queue is clear for %s rather than greeting anybody',
    async (templateKey) => {
      const text = paraText(briefingFor(templateKey, emptySnapshot(NOW, true)))

      expect(text).toContain('waiting on you right now')
      expect(text).not.toMatch(/\b(hello|hi|good morning|welcome|how can i help)\b/i)
    },
  )

  it('never greets anybody in a briefing that does have counts', async () => {
    const text = paraText(briefingFor('salesManager', await snapshot(pipeline())))
    expect(text).not.toMatch(/\b(hello|hi|good morning|welcome|how can i help)\b/i)
  })

  it('lists the records behind the counted phrase, soonest deadline first', async () => {
    const blocks = briefingFor('salesManager', await snapshot(pipeline()))
    const rows = blocks.find((block) => block.kind === 'rows')

    expect(rows).toBeDefined()
    expect(rows?.kind === 'rows' && rows.rows.length).toBe(2)
    expect(rows?.kind === 'rows' && rows.rows[0].primary).toContain('INQ-910')
  })

  it('refuses rather than improvising when the account holds no Assistant', () => {
    const blocks = briefingFor('subAgent', emptySnapshot(NOW, false))
    expect(paraText(blocks)).toContain('does not hold the Assistant')
  })

  it('answers a template it has never heard of with the queues everyone has', async () => {
    const text = paraText(briefingFor('someRoleInventedInP1', await snapshot(pipeline())))
    expect(text).toContain('18 open inquiries you can see.')
  })
})

describe('a briefing states no amount it was not given', () => {
  it('carries no currency anywhere in the opening turn', async () => {
    for (const templateKey of Object.keys(BRIEFING_TEMPLATES)) {
      const blocks = briefingFor(templateKey, await snapshot(pipeline()))
      expect(JSON.stringify(blocks)).not.toMatch(/₹|INR|premium/i)
    }
  })
})
