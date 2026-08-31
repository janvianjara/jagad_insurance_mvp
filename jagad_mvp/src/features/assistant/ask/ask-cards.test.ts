import { describe, expect, it } from 'vitest'
import { ALL_CARDS, ASK_CARDS, askCardById, chipsFor, followUpsFor } from './ask-cards'

import type { CardAnswer } from './card-kit'
import { aClaim, aQuotation, aRenewal, aTask, anInquiry, stubAssistantRepository } from '../stub-repository'

const NOW = new Date('2026-08-26T09:30:00.000Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

const ROLES = ['admin', 'salesManager', 'agent', 'backOffice', 'claims', 'renewals'] as const

function textOf(answer: CardAnswer): string {
  return answer.blocks
    .map((block) => (block.kind === 'para' || block.kind === 'note' ? block.text : ''))
    .join(' ')
}

function tableOf(answer: CardAnswer) {
  const table = answer.blocks.find((block) => block.kind === 'table')
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

  it('splits the registry by the four request kinds FR-22.2 names', () => {
    for (const card of ASK_CARDS) expect(card.kind).toBe('Ask')
    expect(new Set(ALL_CARDS.map((card) => card.kind))).toEqual(
      new Set(['Ask', 'Analyse', 'Act', 'Produce']),
    )
  })

  it('gives every role more than one kind of request to make', () => {
    for (const role of ROLES) {
      expect(new Set(chipsFor(role).map((card) => card.kind)).size).toBeGreaterThan(1)
    }
  })
})

describe('an answer proposes what follows it', () => {
  it('offers something other than the role’s own chips after an answer', () => {
    const role = chipsFor('claims').map((card) => card.id)
    const after = followUpsFor('aged-claims', 'claims').map((card) => card.id)

    expect(after.length).toBeGreaterThan(0)
    expect(after).not.toEqual(role)
  })

  it('never offers a card whose subject this role has no work in', () => {
    // The repository would return an empty answer anyway, so this is not a leak
    // — it is the difference between a chip that is useless and one that is
    // absent. A renewals officer must not be offered claim work.
    for (const card of followUpsFor('renewals-lapsed', 'renewals')) {
      expect(card.id).not.toContain('claim')
    }
  })

  it('falls back to the role’s own chips rather than leaving a dead end', () => {
    const role = chipsFor('agent').map((card) => card.id)
    expect(followUpsFor('a-card-that-does-not-exist', 'agent').map((card) => card.id)).toEqual(role)
  })

  it('never names a follow-up that is not in the registry', () => {
    for (const role of ROLES) {
      for (const card of chipsFor(role)) {
        for (const next of followUpsFor(card.id, role)) {
          expect(ALL_CARDS.map((known) => known.id)).toContain(next.id)
        }
      }
    }
  })
})

describe('a card is a query over the projection, run as the person asking', () => {
  it('returns exactly the rows the repository gave it, and no others', async () => {
    const mine = anInquiry({ id: 'inq-mine', systemNo: 'INQ-1041' })
    const repo = stubAssistantRepository({ inquiries: [mine] })

    const answer = await askCardById('my-leads')!.run(repo, NOW)
    const table = tableOf(answer)

    expect(table?.rows).toHaveLength(1)
    expect(table?.rows[0].id).toBe('inq-mine')
    expect(textOf(answer)).toContain('1 open lead')
  })

  it('gives nothing back — and says so — when the scope holds nothing', async () => {
    // What an agent asking about a customer they did not source actually gets:
    // the facade returned no rows, so the card has nothing to answer with.
    const answer = await askCardById('my-leads')!.run(stubAssistantRepository({}), NOW)

    expect(tableOf(answer)).toBeNull()
    expect(textOf(answer)).toContain('Nothing in your book matches that')
    expect(textOf(answer)).toContain('it was never in the query')
  })

  it('gives an account with no Assistant grant nothing from any card', async () => {
    const repo = stubAssistantRepository(
      { inquiries: [anInquiry()], tasks: [aTask()], claims: [aClaim()] },
      { enabled: false },
    )

    // Every card of every kind, not only the reads: an account with no grant
    // gets an empty answer from Analyse, Act and Produce too.
    for (const card of ALL_CARDS) {
      expect(tableOf(await card.run(repo, NOW))).toBeNull()
    }
  })

  /**
   * FR-06.19 — the question the prototype has been promising and the model could
   * not answer.
   *
   * Both of these leads are `accepted` with a stopped clock, so nothing else in
   * the product tells them apart. The engagement fields do.
   */
  it('separates a lead that went quiet from one being worked, and never reads the note', async () => {
    const repo = stubAssistantRepository({
      inquiries: [
        anInquiry({
          id: 'quiet',
          systemNo: 'INQ-2001',
          status: 'accepted',
          stageKey: 'contacted',
          lastActivityAt: at(-12 * 24 * HOUR),
          nextActionAt: at(-2 * 24 * HOUR),
        }),
        anInquiry({
          id: 'never',
          systemNo: 'INQ-2002',
          status: 'accepted',
          stageKey: null,
          lastActivityAt: null,
          nextActionAt: null,
        }),
        anInquiry({
          id: 'worked',
          systemNo: 'INQ-2003',
          status: 'accepted',
          stageKey: 'follow_up_scheduled',
          lastActivityAt: at(-HOUR),
          nextActionAt: at(24 * HOUR),
        }),
      ],
    })

    const answer = await askCardById('quiet-leads')!.run(repo, NOW)
    expect(textOf(answer)).toContain('2 leads have')

    const rows = answer.blocks.flatMap((block) => (block.kind === 'rows' ? block.rows : []))
    const primaries = rows.map((row) => row.primary)
    expect(primaries).toContain('A next action that came and went')
    expect(primaries).toContain('No next action ever set')

    // The one with a date still to come is not quiet, and is not named.
    expect(primaries).not.toContain('INQ-2003')
    // The quietest first, and the one nobody rang says exactly that.
    expect(primaries).toContain('INQ-2002')
    expect(rows.map((row) => row.secondary).join(' ')).toContain(
      'Nobody has logged a contact against this one at all',
    )
  })

  it('says so plainly when nothing has gone quiet', async () => {
    const repo = stubAssistantRepository({
      inquiries: [
        anInquiry({ id: 'ok', status: 'accepted', nextActionAt: at(24 * HOUR) }),
      ],
    })

    const text = textOf(await askCardById('quiet-leads')!.run(repo, NOW))
    expect(text).toContain('Nothing has gone quiet')
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
    const answer = await askCardById('open-inquiries')!.run(
      stubAssistantRepository({ inquiries: many }),
      NOW,
    )

    expect(tableOf(answer)?.rows).toHaveLength(8)
    expect(textOf(answer)).toContain('Showing the first 8 of 12')
  })
})
