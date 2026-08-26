/**
 * Renewal notice batch — plan §9, FR-12, canvas n26-n36, P2.
 *
 *   Batch: uploaded -> ocr_running -> review -> sent (per-customer PDF + renewal request)
 *   Row:   pending -> matched | unmatched -> manual link (matched) | rejected
 *
 * Two machines, because a batch and its rows fail independently: an insurer sends
 * one PDF holding four hundred policies and a handful of them will not match
 * anything the agency holds. §9's rule is that those few are a hard block on the
 * bulk send, not a warning somebody clicks past at five in the evening.
 */

import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const NOTICE_BATCH_STATES = {
  uploaded: 'uploaded',
  ocrRunning: 'ocr_running',
  review: 'review',
  sent: 'sent',
} as const

export type NoticeBatchState = (typeof NOTICE_BATCH_STATES)[keyof typeof NOTICE_BATCH_STATES]

export const NOTICE_ROW_STATES = {
  pending: 'pending',
  matched: 'matched',
  unmatched: 'unmatched',
  rejected: 'rejected',
} as const

export type NoticeRowState = (typeof NOTICE_ROW_STATES)[keyof typeof NOTICE_ROW_STATES]

export type NoticeRow = {
  readonly id: string
  readonly state: NoticeRowState
  /** The policy number as printed on the insurer's notice. */
  readonly noticePolicyNo: string
  /** Filled once the row is matched to a policy this agency actually holds. */
  readonly matchedPolicyId?: string
}

export type NoticeBatchContext = {
  readonly rows: readonly NoticeRow[]
  /** The rows a person ticked for this send. Empty means everything in review. */
  readonly selectedRowIds?: readonly string[]
  readonly ocrCompletedAt?: string
}

export type NoticeRowContext = {
  readonly matchedPolicyId?: string
  /** Set when a person linked the row by hand after OCR could not. */
  readonly manuallyLinkedBy?: string
  readonly rejectReason?: string
}

/** The rows this send would actually cover. */
export function rowsInSend(ctx: NoticeBatchContext): readonly NoticeRow[] {
  const selected = ctx.selectedRowIds
  if (!selected || selected.length === 0) return ctx.rows
  const wanted = new Set(selected)
  return ctx.rows.filter((row) => wanted.has(row.id))
}

export function ocrHasFinished(ctx: NoticeBatchContext): TransitionResult {
  if (!ctx.ocrCompletedAt) {
    return refuse('Extraction is still running on this batch. The review list is not ready yet.')
  }
  if (ctx.rows.length === 0) {
    return refuse('Extraction produced no rows from this batch. Check the uploaded file.')
  }
  return allow()
}

/**
 * §9: "An unmatched row cannot be included in a bulk send. Hard block, not a
 * warning." Sending a renewal notice to the wrong customer is not a data-quality
 * issue, it is a letter with somebody else's premium on it.
 */
export function unmatchedRowCannotBeIncludedInBulkSend(ctx: NoticeBatchContext): TransitionResult {
  const rows = rowsInSend(ctx)
  if (rows.length === 0) {
    return refuse('No rows are selected for this send.')
  }

  const blocking = rows.filter((row) => row.state !== NOTICE_ROW_STATES.matched)
  if (blocking.length > 0) {
    const unmatched = blocking.filter((row) => row.state === NOTICE_ROW_STATES.unmatched)
    const detail = (unmatched.length > 0 ? unmatched : blocking)
      .slice(0, 5)
      .map((row) => row.noticePolicyNo)
      .join(', ')
    return refuse(
      `${blocking.length} of ${rows.length} rows are not matched to a policy (${detail}${blocking.length > 5 ? ', and more' : ''}). Link or reject them before sending. Unmatched rows cannot go out in a bulk send.`,
    )
  }

  const unlinked = rows.filter((row) => !row.matchedPolicyId)
  if (unlinked.length > 0) {
    return refuse(
      `${unlinked.length} rows are marked matched but carry no policy. A send needs the policy each notice belongs to.`,
    )
  }
  return allow()
}

export function rowHasPolicyMatch(ctx: NoticeRowContext): TransitionResult {
  if (!ctx.matchedPolicyId) {
    return refuse('This notice row is not linked to a policy the agency holds.')
  }
  return allow()
}

export function rowManuallyLinked(ctx: NoticeRowContext): TransitionResult {
  if (!ctx.matchedPolicyId) {
    return refuse('Pick the policy this notice row belongs to.')
  }
  if (!ctx.manuallyLinkedBy) {
    return refuse('A manual link records who made it, because automatic matching did not.')
  }
  return allow()
}

export function rowRejectRequiresReason(ctx: NoticeRowContext): TransitionResult {
  if (!ctx.rejectReason || ctx.rejectReason.trim().length === 0) {
    return refuse('Record why this notice row is being rejected.')
  }
  return allow()
}

export function rowHasNoPolicyMatch(ctx: NoticeRowContext): TransitionResult {
  if (ctx.matchedPolicyId) {
    return refuse('This row matched a policy, so it is not unmatched.')
  }
  return allow()
}

export const NOTICE_BATCH_TRANSITIONS = {
  uploaded: {
    ocr_running: { event: 'notice.ocr_started' },
  },
  ocr_running: {
    review: { event: 'notice.ocr_completed', guards: [ocrHasFinished] },
  },
  review: {
    sent: {
      event: 'notice.sent',
      alsoEmits: ['message.sent'],
      guards: [unmatchedRowCannotBeIncludedInBulkSend],
      note: '§9: per-customer PDF plus the renewal request, matched rows only.',
    },
  },
} as const satisfies TransitionTable<NoticeBatchState, NoticeBatchContext>

export const noticeBatchMachine = createMachine<NoticeBatchState, NoticeBatchContext>({
  name: 'noticeBatch',
  states: Object.values(NOTICE_BATCH_STATES),
  initial: NOTICE_BATCH_STATES.uploaded,
  transitions: NOTICE_BATCH_TRANSITIONS,
})

export const NOTICE_ROW_TRANSITIONS = {
  pending: {
    matched: { event: 'notice.row_matched', guards: [rowHasPolicyMatch] },
    unmatched: { event: 'notice.row_unmatched', guards: [rowHasNoPolicyMatch] },
  },
  unmatched: {
    matched: {
      event: 'notice.row_matched',
      guards: [rowManuallyLinked],
      note: '§9: manual link is the way out of unmatched.',
    },
    rejected: { event: 'notice.row_rejected', guards: [rowRejectRequiresReason] },
  },
} as const satisfies TransitionTable<NoticeRowState, NoticeRowContext>

export const noticeRowMachine = createMachine<NoticeRowState, NoticeRowContext>({
  name: 'noticeRow',
  states: Object.values(NOTICE_ROW_STATES),
  initial: NOTICE_ROW_STATES.pending,
  transitions: NOTICE_ROW_TRANSITIONS,
})
