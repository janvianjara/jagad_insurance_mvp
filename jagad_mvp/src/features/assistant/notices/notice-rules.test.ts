import { describe, expect, it } from 'vitest'
import { NOTICE_RULES, evaluateNotices, reasonFor } from './notice-rules'
import { loadQueueSnapshot } from '../briefing/snapshot'
import type { QueueSnapshot } from '../briefing/snapshot'
import { aClaim, aTask, anInquiry, stubAssistantRepository } from '../stub-repository'
import type { StubRows } from '../stub-repository'

const NOW = new Date('2026-08-26T09:30:00.000Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

function snapshot(rows: StubRows): Promise<QueueSnapshot> {
  return loadQueueSnapshot(stubAssistantRepository(rows), NOW)
}

const AT_RISK = anInquiry({ id: 'inq-a', systemNo: 'INQ-1036', assignedAt: at(-HOUR), tatDueAt: at(2 * HOUR) })
const COMFORTABLE = anInquiry({ id: 'inq-b', systemNo: 'INQ-1039', assignedAt: at(-HOUR), tatDueAt: at(9 * HOUR) })
const AGED_CLAIM = aClaim({ id: 'clm-a', systemNo: 'CLM-0398', raisedAt: at(-34 * DAY) })
const OLDER_CLAIM = aClaim({ id: 'clm-b', systemNo: 'CLM-0402', raisedAt: at(-31 * DAY) })
const MANDATE = aTask({
  id: 'tsk-a',
  systemNo: 'TSK-0001',
  kind: 'mandate_failure',
  title: 'Jayesh Kapadia - mandate failed',
  dueAt: at(-2 * DAY),
})

describe('the thresholds are the ones the playbook names', () => {
  it('raises an inquiry inside three hours and leaves one at nine alone', async () => {
    const notices = evaluateNotices(await snapshot({ inquiries: [AT_RISK, COMFORTABLE] }))

    expect(notices).toHaveLength(1)
    expect(notices[0].rule).toBe(NOTICE_RULES.tatWindow)
    expect(notices[0].headline).toContain('INQ-1036')
  })

  it('does not raise a turnaround that has already lapsed as one still inside the window', async () => {
    const lapsed = anInquiry({ id: 'inq-c', assignedAt: at(-9 * HOUR), tatDueAt: at(-HOUR) })
    expect(evaluateNotices(await snapshot({ inquiries: [lapsed] }))).toHaveLength(0)
  })

  it('raises an open claim past thirty days and leaves a closed one alone', async () => {
    const closed = aClaim({ id: 'clm-old', state: 'closed', raisedAt: at(-120 * DAY) })
    const notices = evaluateNotices(await snapshot({ claims: [AGED_CLAIM, closed] }))

    expect(notices).toHaveLength(1)
    expect(notices[0].rule).toBe(NOTICE_RULES.claimAging)
  })

  it('leaves a claim one day short of thirty alone', async () => {
    const young = aClaim({ id: 'clm-y', raisedAt: at(-29 * DAY) })
    expect(evaluateNotices(await snapshot({ claims: [young] }))).toHaveLength(0)
  })

  it('raises a failed mandate whose follow-up is still open, and not one that is done', async () => {
    const done = aTask({ id: 'tsk-done', kind: 'mandate_failure', state: 'done' })
    const notices = evaluateNotices(await snapshot({ tasks: [MANDATE, done] }))

    expect(notices).toHaveLength(1)
    expect(notices[0].rule).toBe(NOTICE_RULES.mandateFailed)
    expect(notices[0].count).toBe(1)
  })

  it('raises nothing for an account with no Assistant grant', async () => {
    const repo = stubAssistantRepository({ inquiries: [AT_RISK], claims: [AGED_CLAIM] }, { enabled: false })
    expect(evaluateNotices(await loadQueueSnapshot(repo, NOW))).toHaveLength(0)
  })
})

describe('every notice states why it fired — FR-22.8', () => {
  it('carries a reason on every rule, naming its threshold', async () => {
    const notices = evaluateNotices(
      await snapshot({
        inquiries: [AT_RISK],
        claims: [AGED_CLAIM, OLDER_CLAIM],
        tasks: [MANDATE],
      }),
    )

    expect(notices).toHaveLength(3)
    for (const notice of notices) {
      expect(notice.reason).toMatch(/^Raised because /)
      expect(notice.reason).toMatch(/not because anyone asked\.$/)
      // The reason is also on screen, as the note block under the records.
      const note = notice.blocks.find((block) => block.kind === 'note')
      expect(note?.kind === 'note' && note.text).toBe(notice.reason)
    }
  })

  it('says "both" when two records crossed the line, as the requirement does', async () => {
    const notices = evaluateNotices(await snapshot({ claims: [AGED_CLAIM, OLDER_CLAIM] }))

    expect(notices[0].reason).toBe(
      'Raised because both passed the thirty-day aging threshold, not because anyone asked.',
    )
  })

  it('agrees with itself about number', () => {
    expect(reasonFor(1, 'falls inside', 'fall inside', 'the window')).toContain('it falls inside')
    expect(reasonFor(2, 'falls inside', 'fall inside', 'the window')).toContain('both fall inside')
    expect(reasonFor(5, 'falls inside', 'fall inside', 'the window')).toContain('all 5 fall inside')
  })
})

describe('dedupe is by rule and subject, so a dismissal can stick', () => {
  it('gives the same facts the same id on every evaluation', async () => {
    const rows = { claims: [AGED_CLAIM, OLDER_CLAIM] }
    const first = evaluateNotices(await snapshot(rows))
    const second = evaluateNotices(await snapshot(rows))

    expect(first[0].id).toBe(second[0].id)
    // Order of the rows must not change the identity of the fact.
    const reversed = evaluateNotices(await snapshot({ claims: [OLDER_CLAIM, AGED_CLAIM] }))
    expect(reversed[0].id).toBe(first[0].id)
  })

  it('gives a genuinely new subject a genuinely new id', async () => {
    const one = evaluateNotices(await snapshot({ claims: [AGED_CLAIM] }))
    const two = evaluateNotices(await snapshot({ claims: [AGED_CLAIM, OLDER_CLAIM] }))

    expect(two[0].id).not.toBe(one[0].id)
  })

  it('raises one notice per rule however many records matched', async () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      aClaim({ id: `clm-${index}`, systemNo: `CLM-04${index}`, raisedAt: at(-45 * DAY) }),
    )
    const notices = evaluateNotices(await snapshot({ claims: many }))

    expect(notices).toHaveLength(1)
    expect(notices[0].count).toBe(6)
  })
})

describe('a notice never predicts and never prices', () => {
  it('carries no settlement figure and no outcome for an aged claim', async () => {
    const notices = evaluateNotices(await snapshot({ claims: [AGED_CLAIM] }))
    const text = JSON.stringify(notices)

    expect(text).not.toMatch(/₹|likely|expect(ed)? to settle|approx/i)
    expect(notices[0].blocks.some((block) => block.kind === 'para' && block.text.includes('The insurer decides'))).toBe(true)
  })
})
