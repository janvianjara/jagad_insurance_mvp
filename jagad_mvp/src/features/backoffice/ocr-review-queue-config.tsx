/**
 * The OCR review queue, as configuration — FR-08.1's sixth ops queue, FR-16,
 * plan §6 and §14.1.
 *
 * Not a table. `<WorkQueue>` was built once, so this file says what a review row
 * is and nothing about how a list behaves.
 *
 * Four decisions worth reading:
 *
 *   **The queue is `documents.awaitingReview`, exactly.** That is the same read
 *   the navigation rail's own count uses, so the lime number beside "OCR review"
 *   and the number in this queue's header are the same read of the same set. A
 *   rail saying five over a list of four is the defect that catches a walkthrough
 *   in its first minute.
 *
 *   **The list is metadata.** Not one column reads a `document-content` field —
 *   no file name, no MIME type, no extracted text, and no extracted VALUE. What
 *   the columns carry is how many values were read and how many still want a
 *   person; what they say is shown one click in, masked, inside `<OcrField>`,
 *   where FR-16's rule holds.
 *
 *   **A row with nothing extracted is a real row.** Three of the documents on
 *   this queue had no extraction run over them, and the column says so rather
 *   than printing a zero that reads like a finished job.
 *
 *   **No bulk action.** Confirming an extraction is a person vouching for what a
 *   machine read off a piece of paper. A ticked-forty-and-confirm affordance over
 *   that is precisely the silent commit FR-16 exists to forbid, and it would be
 *   worse here than anywhere else in the product because the values in question
 *   are identity numbers and premiums.
 */

import type { ListQuery, Page } from '../../data/repo'
import { DOCUMENT_TYPES } from '../../data/repo'
import type { QueueConfig } from '../../components/WorkQueue'
import type { User } from '../../domain/permissions'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { RecordId, RelativeTime } from '../../ui/type'
import { DOC_TYPE_LABEL, REVIEW_LABEL, REVIEW_TONE } from '../documents/document-view'
import { subjectOf } from '../documents/data/vault'
import type { VaultSubjects } from '../documents/data/vault'
import { OcrReviewDrawer } from './OcrReviewDrawer'
import { REVIEW_PROGRESS_FILTER, stillWaiting } from './data/ocr-review-desk'
import type { OcrReviewDesk, OcrReviewRow } from './data/ocr-review-desk'
import {
  REVIEW_PROGRESS,
  REVIEW_PROGRESS_LABEL,
  lowestConfidence,
  ocrReviewSeverity,
} from './ocr-review-view'
import styles from './OcrReview.module.css'

export type OcrReviewQueueDeps = {
  readonly desk: OcrReviewDesk
  /** Resolved once for the whole queue, so a row can name the record it is about. */
  readonly subjects: VaultSubjects
  /** Who is signed in. A verdict is recorded as theirs. */
  readonly actor: User
  /** Injected: a row and the drawer it opens must never disagree about now. */
  readonly now: Date
}

const column = dataTableColumns<OcrReviewRow>()

const PERCENT = 100

export function ocrReviewQueueConfig(deps: OcrReviewQueueDeps): QueueConfig<OcrReviewRow> {
  const { desk, subjects, actor, now } = deps

  const columns = column.columns([
    column.accessor((row) => row.document.systemNo, {
      id: 'systemNo',
      header: 'Reference',
      enableSorting: false,
      cell: ({ row }) => <RecordId systemNo={row.original.document.systemNo} showInsurer={false} />,
    }),
    column.accessor((row) => row.document.docType, {
      id: 'docType',
      header: 'Kind',
      enableSorting: false,
      cell: ({ row }) => <Badge caps>{DOC_TYPE_LABEL[row.original.document.docType]}</Badge>,
    }),
    column.accessor((row) => row.document.subjectId, {
      id: 'subject',
      header: 'About',
      enableSorting: false,
      cell: ({ row }) => {
        const subject = subjectOf(subjects, row.original.document)
        return (
          <span className={styles.subjectCell}>
            <span>{subject?.label ?? row.original.document.subjectId}</span>
            <span className={styles.subjectKind}>{row.original.document.subjectEntity}</span>
          </span>
        )
      },
    }),
    // How many values, not what they say. The values themselves are
    // `document-content` and are shown one click in, masked, inside `<OcrField>`.
    column.accessor((row) => row.extractions.length, {
      id: 'extracted',
      header: 'Extracted',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.extractions.length === 0 ? (
          <span className={styles.noneExtracted}>none</span>
        ) : (
          <span className={styles.countCell}>{row.original.extractions.length}</span>
        ),
    }),
    column.accessor((row) => stillWaiting(row), {
      id: 'waiting',
      header: 'Needs a person',
      enableSorting: false,
      cell: ({ row }) => {
        const waiting = stillWaiting(row.original)
        if (row.original.extractions.length === 0) return <span className={styles.noneExtracted}>—</span>
        return waiting === 0 ? (
          <Badge tone="ok" icon="check">
            All confirmed
          </Badge>
        ) : (
          <Badge tone="attn">{waiting} unconfirmed</Badge>
        )
      },
    }),
    // The lowest figure the extractor reported, shown and acted on by nothing.
    // There is deliberately no threshold: a rule that hid or waved through a
    // reading by confidence would be the silent commit FR-16 forbids.
    column.accessor((row) => lowestConfidence(row.extractions), {
      id: 'confidence',
      header: 'Lowest confidence',
      enableSorting: false,
      cell: ({ row }) => {
        const lowest = lowestConfidence(row.original.extractions)
        return lowest === null ? (
          <span className={styles.noneExtracted}>not reported</span>
        ) : (
          <span className={styles.countCell}>{Math.round(lowest * PERCENT)}%</span>
        )
      },
    }),
    column.accessor((row) => row.document.reviewState, {
      id: 'reviewState',
      header: 'Document',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={REVIEW_TONE[row.original.document.reviewState]} size="sm">
          {REVIEW_LABEL[row.original.document.reviewState]}
        </StatusPill>
      ),
    }),
    column.accessor((row) => row.document.submittedAt, {
      id: 'submittedAt',
      header: 'Waiting since',
      cell: ({ row }) => (
        <RelativeTime
          value={row.original.document.submittedAt}
          now={now}
          addSuffix
          absentText="not submitted"
        />
      ),
    }),
  ])

  return {
    key: 'ocr-review',
    title: 'OCR review',
    noun: 'document',
    nounPlural: 'documents',
    getRowId: (row) => row.document.id,
    columns,

    filters: [
      {
        key: 'docType',
        label: 'Kind',
        options: Object.values(DOCUMENT_TYPES).map((value) => ({
          value,
          label: DOC_TYPE_LABEL[value],
        })),
      },
      {
        key: REVIEW_PROGRESS_FILTER,
        label: 'Extractions',
        anyLabel: 'Every row on this desk',
        options: Object.values(REVIEW_PROGRESS).map((value) => ({
          value,
          label: REVIEW_PROGRESS_LABEL[value],
        })),
      },
    ],

    sortable: ['submittedAt'],
    // Oldest first. This is a chase list, and the reading at the top has been
    // sitting in front of a record it has not entered for the longest.
    defaultSort: { field: 'submittedAt', direction: 'asc' },
    searchPlaceholder: 'Reference or kind',
    stripeMapping: (row) => ocrReviewSeverity(row.document, row.extractions, now),

    load: (query: ListQuery): Promise<Page<OcrReviewRow>> => desk.awaitingReview(query),

    // §4 reserves no `/back-office/ocr-review/:id`, and it should not: reviewing
    // an extraction happens beside the row, and the record it belongs to is one
    // link away from inside the drawer.
    rowTarget: 'drawer',
    drawerTitle: (row) =>
      `${DOC_TYPE_LABEL[row.document.docType]} · ${row.document.systemNo}`,
    drawerSubtitle: (row) => subjectOf(subjects, row.document)?.label,
    renderDrawer: (row, queue) => (
      <OcrReviewDrawer
        row={row}
        desk={desk}
        subject={subjectOf(subjects, row.document)}
        actor={actor}
        now={now}
        queue={queue}
      />
    ),

    empty: {
      title: 'Nothing is waiting on a reviewer',
      explanation:
        'A document lands here the moment it is uploaded against a customer, policy, quotation or claim. Where an extractor has read values off it, every one of them stays unconfirmed — and off the record — until a person has vouched for it.',
    },
  }
}
