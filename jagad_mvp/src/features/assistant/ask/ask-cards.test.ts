import { describe, expect, it } from 'vitest'
import { ASK_CARDS, askCardById, chipsFor } from './ask-cards'
import type { Block } from '../blocks/blocks'
import { aClaim, aQuotation, aRenewal, aTask, anInquiry, stubAssistantRepository } from '../stub-repository'

const NOW = new Date('2026-08-26T09:30:00.000Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

const ROLES = ['admin', 'salesManager', 'agent', 'backOffice', 'claims', 'renewals'] as const

function textOf(blocks: readonly Block[]): string {
  return blocks
    .map((block) => (block.kind === 'para' || block.kind === 'note' ? block.text : ''))
    .join(' ')
}

function tableOf(blocks: readonly Block[]) {
  const table = blocks.find((block) => block.kind === 'table')
  return table?.kind === 'table' ? table : null
}

describe('the chips differ per role', () => {
  it('gives every role a set, and no two roles the same set', () => {
    const sets = ROLES.map((role) => chipsFor(role).map((card) => card.id).join('|'))
    expect(new Set(sets).size).toBe(ROLES.length)
  })

  it('puts the role’s own queue first, as §3 asks', () => {
    expect(chipsFor('agent')[0].id).toBe('my-leads')
    expect(chipsFor('salesManager')[0].id).toBe('open-inquiries')
    expect(chipsFor('backOffice')[0].id).toBe('my-queue')
    expect(chipsFor('claims')[0].id).toBe('my-claims')
    expect(chipsFor('renewals')[0].id).toBe('renewals-due')
  })

  it('offers a renewals officer nothing about unassigned inquiries', () => {
    const ids = chipsFor('renewals').map((card) => card.id)
    expect(ids).not.toContain('unassigned')
    expect(ids).not.toContain('my-leads')
  })

  it('names the five the playbook asks for', () => {
    const ids = ASK_CARDS.map((card) => card.id)
    for (const id of ['my-leads', 'unassigned', 'tat-at-risk', 'my-drafts', 'due-this-week']) {
      expect(ids).toContain(id)
    }
  })

  it('answers an unknown template with the queues everyone has', () => {
    expect(chipsFor('someRoleInventedInP1').map((card) => card.id)).toEqual([
      'my-queue',
      'due-this-week',
      'past-due',
    ])
  })

  it('tags every M0 card as an Ask — nothing here writes', () => {
    for (const card of ASK_CARDS) expect(card.kind).toBe('Ask')
  })
})

describe('a card is a query over the projection, run as the person asking', () => {
  it('returns exactly the rows the repository gave it, and no others', async () => {
    const mine = anInquiry({ id: 'inq-mine', systemNo: 'INQ-1041' })
    const repo = stubAssistantRepository({ inquiries: [mine] })

    const blocks = await askCardById('my-leads')!.run(repo, NOW)
    const table = tableOf(blocks)

    expect(table?.rows).toHaveLength(1)
    expect(table?.rows[0].id).toBe('inq-mine')
    expect(textOf(blocks)).toContain('1 open lead')
  })

  it('gives nothing back — and says so — when the scope holds nothing', async () => {
    // What an agent asking about a customer they did not source actually gets:
    // the facade returned no rows, so the card has nothing to answer with.
    const blocks = await askCardById('my-leads')!.run(stubAssistantRepository({}), NOW)

    expect(tableOf(blocks)).toBeNull()
    expect(textOf(blocks)).toContain('Nothing in your book matches that')
    expect(textOf(blocks)).toContain('it was never in the query')
  })

  it('gives an account with no Assistant grant nothing from any card', async () => {
    const repo = stubAssistantRepository(
      { inquiries: [anInquiry()], tasks: [aTask()], claims: [aClaim()] },
      { enabled: false },
    )

    for (const card of ASK_CARDS) {
      expect(tableOf(await card.run(repo, NOW))).toBeNull()
    }
  })

  it('narrows to the three-hour window for TAT at risk', async () => {
    const repo = stubAssistantRepository({
      inquiries: [
        anInquiry({ id: 'close', assignedAt: at(-HOUR), tatDueAt: at(2 * HOUR) }),
        anInquiry({ id: 'far', assignedAt: at(-HOUR), tatDueAt: at(9 * HOUR) }),
      ],
    })

    const table = tableOf(await askCardById('tat-at-risk')!.run(repo, NOW))
    expect(table?.rows.map((row) => row.id)).toEqual(['close'])
  })

  it('finds the drafts a person has not sent, and not the ones they have', async () => {
    const repo = stubAssistantRepository({
      quotations: [
        aQuotation({ id: 'draft', status: 'composed' }),
        aQuotation({ id: 'shared', status: 'shared', sharedAt: at(-DAY) }),
      ],
    })

    const table = tableOf(await askCardById('my-drafts')!.run(repo, NOW))
    expect(table?.rows.map((row) => row.id)).toEqual(['draft'])
  })

  it('reads a recorded amount and never fills one in', async () => {
    const repo = stubAssistantRepository({ quotations: [aQuotation({ id: 'draft' })] })
    const table = tableOf(await askCardById('my-drafts')!.run(repo, NOW))
    const money = table?.rows[0].cells.find((cell) => cell.cell === 'money')

    // The fixture recorded no figure, so the card carries none. Not zero.
    expect(money?.cell === 'money' && money.paise).toBeNull()
  })

  it('counts due-this-week from the next seven days, not the calendar week', async () => {
    const repo = stubAssistantRepository({
      tasks: [
        aTask({ id: 'in', dueAt: at(6 * DAY) }),
        aTask({ id: 'out', dueAt: at(8 * DAY) }),
        aTask({ id: 'past', dueAt: at(-DAY) }),
      ],
    })

    const table = tableOf(await askCardById('due-this-week')!.run(repo, NOW))
    expect(table?.rows.map((row) => row.id)).toEqual(['in'])
  })

  it('answers the renewal pool from renewal state, not from a task', async () => {
    const repo = stubAssistantRepository({
      renewals: [aRenewal({ id: 'soon', dueOn: at(2 * DAY) }), aRenewal({ id: 'later', dueOn: at(20 * DAY) })],
    })

    const table = tableOf(await askCardById('renewals-due')!.run(repo, NOW))
    expect(table?.rows.map((row) => row.id)).toEqual(['soon'])
  })

  it('states the total when it shows only the first page of an answer', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      anInquiry({ id: `inq-${index}`, systemNo: `INQ-11${index}` }),
    )
    const blocks = await askCardById('open-inquiries')!.run(stubAssistantRepository({ inquiries: many }), NOW)

    expect(tableOf(blocks)?.rows).toHaveLength(8)
    expect(textOf(blocks)).toContain('Showing the first 8 of 12')
  })
})
