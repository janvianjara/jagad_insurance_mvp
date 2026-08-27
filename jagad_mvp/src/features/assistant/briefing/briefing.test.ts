import { describe, expect, it } from 'vitest'
import {
  BRIEFING_TEMPLATES,
  briefingClauses,
  briefingFor,
  briefingProse,
  briefingTemplateFor,
  snapshotCounts,
} from './briefing'
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

/** Every queue in the snapshot non-empty, so no template is tested half-asleep. */
function everything(): StubRows {
  return {
    ...pipeline(),
    quotations: [
      aQuotation({ id: 'q1' }),
      aQuotation({ id: 'q2', status: 'shared', sharedAt: at(-2 * DAY) }),
      aQuotation({ id: 'q3', status: 'shared', sharedAt: at(-9 * DAY) }),
    ],
    tasks: [
      aTask({ id: 't1', dueAt: at(2 * DAY) }),
      aTask({ id: 't2', dueAt: at(-DAY) }),
      aTask({ id: 't3', kind: 'mandate_failure', dueAt: at(-2 * DAY) }),
      aTask({ id: 't4', kind: 'policy_entry', dueAt: at(3 * DAY) }),
    ],
    claims: [
      aClaim({ id: 'c1' }),
      aClaim({ id: 'c2', state: 'query_open', raisedAt: at(-40 * DAY) }),
      aClaim({ id: 'c3', state: 'filed_with_insurer', raisedAt: at(-55 * DAY) }),
    ],
    renewals: [aRenewal({ id: 'n1' }), aRenewal({ id: 'n2', state: 'lapsed' })],
  }
}

describe('the briefing is counted, never written', () => {
  it('reproduces the plan’s worked example from the rows themselves', async () => {
    const blocks = briefingFor('salesManager', await snapshot(pipeline()))
    const text = paraText(blocks)

    // The prototype's own line, rebuilt: a framed count, then a second sentence
    // that says which part wants a person and what happens if nobody comes.
    expect(text).toContain('18 open inquiries across the team.')
    expect(text).toContain('4 still unassigned and 2 close to their TAT')
    expect(text).toContain('— if those lapse they reassign on their own and the customer waits longer.')
  })

  it.each(Object.keys(BRIEFING_TEMPLATES))(
    'gives %s only numbers that came off the snapshot',
    async (templateKey) => {
      const state = await snapshot(everything())

      const counts = Object.values(snapshotCounts(state))

      for (const entry of briefingClauses(templateKey, state)) {
        // The count is a real count of real rows...
        expect(counts).toContain(entry.count)
        // ...and it is the number the sentence prints, not one written beside it.
        expect(entry.lead.startsWith(String(entry.count))).toBe(true)
      }
    },
  )

  /**
   * The rule that lets the second sentence exist at all.
   *
   * Interpretation is where a briefing would start inventing, so the
   * interpretive material carries no figures: a `rest` and a `consequence` may
   * say "past thirty days", never "past 30 days". Every digit in a briefing is
   * therefore either a count on the clause that printed it or a record number
   * read off a snapshot row — and this walks the rendered paragraph to prove it
   * rather than trusting the templates.
   */
  it.each(Object.keys(BRIEFING_TEMPLATES))(
    'prints no digit in %s it did not count or read off a record',
    async (templateKey) => {
      const state = await snapshot(everything())
      const prose = briefingProse(templateKey, state)
      const counts = Object.values(snapshotCounts(state)).map(String)
      const names = prose.clauses.flatMap((entry) => entry.names ?? [])

      // A named record is the only other licensed source of digits, so take the
      // names out first — what is left must be countable.
      let remaining = prose.text
      for (const name of names) remaining = remaining.split(name).join(' ')

      for (const figure of remaining.match(/\d+/g) ?? []) {
        expect(counts).toContain(figure)
      }
    },
  )

  it.each(Object.keys(BRIEFING_TEMPLATES))(
    'keeps the interpretation of %s free of figures entirely',
    async (templateKey) => {
      const state = await snapshot(everything())

      for (const entry of briefingClauses(templateKey, state)) {
        expect(entry.rest.replace(/[A-Z]+-\d+/g, '')).not.toMatch(/\d/)
        expect(entry.consequence ?? '').not.toMatch(/\d/)
      }
    },
  )

  /**
   * A record named in the prose has to be a record. The clause declares which
   * ones it named; both the sentence and the snapshot have to agree.
   */
  it.each(Object.keys(BRIEFING_TEMPLATES))(
    'names only records %s actually holds, and names them in the sentence',
    async (templateKey) => {
      const state = await snapshot(everything())
      const prose = briefingProse(templateKey, state)
      const held = new Set(
        [
          ...state.inquiriesOpen,
          ...state.quotationsAwaitingReply,
          ...state.quotationsDraft,
          ...state.tasksOpen,
          ...state.claimsOpen,
        ].map((row) => row.systemNo),
      )

      for (const entry of prose.clauses) {
        for (const name of entry.names ?? []) {
          expect(held.has(name)).toBe(true)
          expect(prose.text).toContain(name)
          expect(prose.emphasis).toContain(name)
        }
      }
    },
  )

  it('drops a consequence rather than inventing one the data cannot carry', async () => {
    // Eighteen open inquiries, none unassigned, none near a turnaround: the
    // headline has something to say and the attention band has nothing.
    const state = await snapshot({
      inquiries: Array.from({ length: 3 }, (_, index) =>
        anInquiry({ id: `q${index}`, systemNo: `INQ-80${index}`, tatDueAt: at(30 * DAY), assignedAt: at(-HOUR) }),
      ),
    })
    const prose = briefingProse('salesManager', state)

    expect(prose.text).toBe('3 open inquiries across the team.')
    expect(prose.text).not.toContain('—')
  })

  it('drops the frame with the sentence it frames', async () => {
    // Back-office frames its counted sentence with "Your queue:". With nothing
    // in the headline band the frame would be describing an absence.
    const state = await snapshot({
      tasks: [aTask({ id: 'late', kind: 'mandate_failure', dueAt: at(-DAY) })],
    })
    const prose = briefingProse('backOffice', state)

    expect(briefingTemplateFor('backOffice').frame).toBe('Your queue:')
    expect(prose.text.startsWith('Your queue:')).toBe(true)

    const clear = briefingProse('claims', state)
    expect(clear.text).not.toContain('Your queue:')
  })

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
