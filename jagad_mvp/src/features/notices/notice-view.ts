/**
 * How a renewal notice batch reads on screen — plan §5 ("Notice bulk ingest"),
 * §9, FR-12, canvas n32–n36.
 *
 * The function that carries a rule rather than a wording choice is
 * `rowsBlockingSend`. §9 is unambiguous: "An unmatched row cannot be included in
 * a bulk send. Hard block, not a warning." So the screen does not decide whether
 * to warn — it asks this, and where the answer is not empty the send has no
 * preview to show and therefore nothing to confirm. The machine refuses the same
 * move independently; this is what stops a person reaching the refusal by
 * pressing a button that looked live.
 */

import type { NoticeBatchState, NoticeRowState } from '../../domain/workflows'
import type { NoticeBatch, NoticeMatch } from '../../data/repo'
import type { Severity, Tone } from '../../ui/tone'

export const BATCH_LABEL: Readonly<Record<NoticeBatchState, string>> = {
  uploaded: 'Uploaded',
  ocr_running: 'Extraction running',
  review: 'In review',
  sent: 'Sent',
}

export const BATCH_TONE: Readonly<Record<NoticeBatchState, Tone>> = {
  uploaded: 'attn',
  ocr_running: 'info',
  review: 'attn',
  sent: 'ok',
}

export const ROW_LABEL: Readonly<Record<NoticeRowState, string>> = {
  pending: 'Not reviewed',
  matched: 'Matched',
  unmatched: 'Unmatched',
  rejected: 'Rejected',
}

export const ROW_TONE: Readonly<Record<NoticeRowState, Tone>> = {
  pending: 'attn',
  matched: 'ok',
  unmatched: 'attn',
  rejected: 'idle',
}

/** What one extracted value is called on screen, per the OCR template's own keys. */
export const NOTICE_FIELD_LABEL: Readonly<Record<string, string>> = {
  noticePolicyNo: 'Policy number, as printed',
  noticeCustomerName: 'Insured name, as printed',
  noticeExpiryDate: 'Expiry date, as printed',
  noticePremium: 'Renewal premium, as printed',
}

/**
 * How sure the extractor says it was, per field.
 *
 * Shown by `<OcrField>` and acted on by nothing. There is deliberately no
 * threshold here and none anywhere downstream: a rule that waves a reading
 * through above some confidence is the silent commit FR-16 forbids, wearing a
 * convenience for a disguise. A printed date reads lower than a policy number
 * because insurers print dates half a dozen ways.
 */
export const NOTICE_CONFIDENCE: Readonly<Record<string, number>> = {
  noticePolicyNo: 0.96,
  noticeCustomerName: 0.89,
  noticeExpiryDate: 0.84,
  noticePremium: 0.87,
}

const DEFAULT_CONFIDENCE = 0.9

export function confidenceFor(name: string): number {
  return NOTICE_CONFIDENCE[name] ?? DEFAULT_CONFIDENCE
}

/** The extracted values on a row that nobody has checked against the notice yet. */
export function unconfirmedFields(row: NoticeMatch): readonly string[] {
  return row.ocrFields.filter((field) => !field.confirmed).map((field) => field.name)
}

export function rowIsReadyToSend(row: NoticeMatch): boolean {
  return row.state === 'matched' && row.matchedPolicyId !== null && unconfirmedFields(row).length === 0
}

export type SendBlocker = {
  readonly row: NoticeMatch
  /** Why this row cannot go out, in the words the person needs. */
  readonly reason: string
}

/**
 * §9's hard block, as a question a screen can ask before it offers anything.
 *
 * Two things keep a row out of a send, and both are refusals rather than
 * cautions. A row that is not matched to a policy this agency holds would be a
 * letter with somebody else's premium on it. A row still holding an extracted
 * value nobody has checked would be a letter with a figure nobody has read.
 */
export function rowsBlockingSend(rows: readonly NoticeMatch[]): readonly SendBlocker[] {
  return rows.flatMap((row) => {
    if (row.state === 'unmatched') {
      return [{ row, reason: 'not matched to any policy this agency holds' }]
    }
    if (row.state === 'pending') {
      return [{ row, reason: 'not reviewed yet' }]
    }
    if (row.state === 'rejected') {
      return [{ row, reason: 'rejected, so it is not ours to renew' }]
    }
    if (row.matchedPolicyId === null) {
      return [{ row, reason: 'marked matched but carrying no policy' }]
    }
    const waiting = unconfirmedFields(row)
    if (waiting.length > 0) {
      return [{ row, reason: 'still holding an extracted value nobody has confirmed' }]
    }
    return []
  })
}

const NAMED = 3

/** The refusal sentence, naming the rows rather than counting them. */
export function sendBlockNote(blockers: readonly SendBlocker[]): string {
  if (blockers.length === 0) return ''
  const named = blockers
    .slice(0, NAMED)
    .map((blocker) => `${blocker.row.noticePolicyNo} — ${blocker.reason}`)
    .join('; ')
  const rest = blockers.length > NAMED ? `, and ${blockers.length - NAMED} more` : ''
  return `${blockers.length} of the selected rows cannot go out: ${named}${rest}. Link or reject an unmatched row, and confirm every extracted value, before sending. Unmatched rows cannot go out in a bulk send.`
}

/** How much trouble a batch is in, as the queue stripe expresses it. */
export function batchSeverity(batch: NoticeBatch): Severity | undefined {
  if (batch.state === 'sent') return 'good'
  if (batch.state === 'ocr_running') return 'cool'
  return 'attn'
}
