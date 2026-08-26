import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { reasonOf } from './machine'
import {
  NOTICE_BATCH_STATES,
  NOTICE_ROW_STATES,
  noticeBatchMachine,
  noticeRowMachine,
  rowsInSend,
  unmatchedRowCannotBeIncludedInBulkSend,
} from './noticeBatch'
import type { NoticeBatchContext, NoticeRow, NoticeRowContext } from './noticeBatch'

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => new Date('2026-08-26T09:00:00.000Z') })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function matched(id: string, noticePolicyNo: string): NoticeRow {
  return { id, state: NOTICE_ROW_STATES.matched, noticePolicyNo, matchedPolicyId: `pol-${id}` }
}

function unmatched(id: string, noticePolicyNo: string): NoticeRow {
  return { id, state: NOTICE_ROW_STATES.unmatched, noticePolicyNo }
}

function context(overrides: Partial<NoticeBatchContext> = {}): NoticeBatchContext {
  return {
    rows: [matched('r1', 'HDF/2023/44120'), matched('r2', 'HDF/2023/44121')],
    ocrCompletedAt: '2026-08-26T08:55:00.000Z',
    ...overrides,
  }
}

function rowContext(overrides: Partial<NoticeRowContext> = {}): NoticeRowContext {
  return { ...overrides }
}

describe('notice batch extraction', () => {
  it('moves through extraction before anything is reviewable', () => {
    const { bus, seen } = recordingBus()

    const started = noticeBatchMachine.transition(
      NOTICE_BATCH_STATES.uploaded,
      NOTICE_BATCH_STATES.ocrRunning,
      context(),
      { bus },
    )
    expect(started.ok).toBe(true)

    const stillRunning = noticeBatchMachine.canTransition(
      NOTICE_BATCH_STATES.ocrRunning,
      NOTICE_BATCH_STATES.review,
      context({ ocrCompletedAt: undefined }),
    )
    expect(stillRunning.ok).toBe(false)

    const ready = noticeBatchMachine.transition(
      NOTICE_BATCH_STATES.ocrRunning,
      NOTICE_BATCH_STATES.review,
      context(),
      { bus },
    )
    expect(ready.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['notice.ocr_started', 'notice.ocr_completed'])
  })
})

describe('unmatched notice rows', () => {
  it('cannot be included in a bulk send, as a hard block rather than a warning', () => {
    const withUnmatched = context({
      rows: [matched('r1', 'HDF/2023/44120'), unmatched('r2', 'HDF/2023/99999')],
    })

    const verdict = unmatchedRowCannotBeIncludedInBulkSend(withUnmatched)
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('HDF/2023/99999')
    expect(reasonOf(verdict)).toContain('cannot go out in a bulk send')

    const blocked = noticeBatchMachine.canTransition(
      NOTICE_BATCH_STATES.review,
      NOTICE_BATCH_STATES.sent,
      withUnmatched,
    )
    expect(blocked.ok).toBe(false)
    expect(blocked.ok === false && blocked.guard).toBe('unmatchedRowCannotBeIncludedInBulkSend')
  })

  it('blocks the send even when the unmatched row was not ticked but is still in scope', () => {
    const rows = [matched('r1', 'HDF/2023/44120'), unmatched('r2', 'HDF/2023/99999')]

    expect(rowsInSend({ rows })).toHaveLength(2)
    expect(unmatchedRowCannotBeIncludedInBulkSend({ rows }).ok).toBe(false)
  })

  it('sends once every selected row is matched to a policy the agency holds', () => {
    const { bus, seen } = recordingBus()
    const rows = [matched('r1', 'HDF/2023/44120'), unmatched('r2', 'HDF/2023/99999')]

    const selectedOnlyMatched = { rows, selectedRowIds: ['r1'], ocrCompletedAt: '2026-08-26T08:55:00.000Z' }
    const outcome = noticeBatchMachine.transition(
      NOTICE_BATCH_STATES.review,
      NOTICE_BATCH_STATES.sent,
      selectedOnlyMatched,
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['notice.sent', 'message.sent'])
  })

  it('refuses a row marked matched that carries no policy', () => {
    const hollow = context({
      rows: [{ id: 'r1', state: NOTICE_ROW_STATES.matched, noticePolicyNo: 'HDF/2023/44120' }],
    })

    const verdict = unmatchedRowCannotBeIncludedInBulkSend(hollow)
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('carry no policy')
  })

  it('refuses a send with nothing in it', () => {
    expect(unmatchedRowCannotBeIncludedInBulkSend({ rows: [] }).ok).toBe(false)
  })
})

describe('notice row', () => {
  it('leaves unmatched by a manual link that records who made it, or by a reasoned rejection', () => {
    const linked = rowContext({ matchedPolicyId: 'pol-99', manuallyLinkedBy: 'u-backoffice-priya' })

    expect(noticeRowMachine.canTransition(NOTICE_ROW_STATES.unmatched, NOTICE_ROW_STATES.matched, linked).ok).toBe(true)
    expect(
      noticeRowMachine.canTransition(
        NOTICE_ROW_STATES.unmatched,
        NOTICE_ROW_STATES.matched,
        rowContext({ matchedPolicyId: 'pol-99' }),
      ).ok,
    ).toBe(false)

    expect(
      noticeRowMachine.canTransition(NOTICE_ROW_STATES.unmatched, NOTICE_ROW_STATES.rejected, rowContext()).ok,
    ).toBe(false)
    expect(
      noticeRowMachine.canTransition(
        NOTICE_ROW_STATES.unmatched,
        NOTICE_ROW_STATES.rejected,
        rowContext({ rejectReason: 'Policy belongs to another agency' }),
      ).ok,
    ).toBe(true)
  })

  it('marks a row unmatched only when nothing matched it', () => {
    expect(noticeRowMachine.canTransition(NOTICE_ROW_STATES.pending, NOTICE_ROW_STATES.unmatched, rowContext()).ok).toBe(true)
    expect(
      noticeRowMachine.canTransition(
        NOTICE_ROW_STATES.pending,
        NOTICE_ROW_STATES.unmatched,
        rowContext({ matchedPolicyId: 'pol-1' }),
      ).ok,
    ).toBe(false)
  })
})
