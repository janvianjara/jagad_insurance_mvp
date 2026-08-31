/**
 * The OCR review desk — the seam `/back-office/ocr-review` reads and writes
 * through.
 *
 * `DocumentRepository` is read-only, deliberately and by design (plan §7, §14.1):
 * it reads metadata and serves no file. `awaitingReview` is the queue's read and
 * is used exactly as the navigation rail's own count uses it, so the number
 * beside "OCR review" in the rail and the number in this queue's header are the
 * same read of the same set and cannot drift.
 *
 * What the repository does not have is any way to record that a person looked.
 * There is no `confirmExtraction`, no `verifyDocument`, no write of any kind. So
 * this desk supplies exactly three things, and each was checked against the
 * repositories before it was written rather than after:
 *
 *   **The verdicts.** A person's decision about one extracted value is not a
 *   field on `DocumentRecord`, and FR-16 needs it recorded all the same: when a
 *   policy number is later disputed, the question asked is what the document
 *   actually said and who vouched for it. So a verdict is held here, append-only,
 *   with the original read kept beside whatever the person typed. The same shape
 *   `policyDesk.recordReview` and `customerDesk.recordReview` already hold, and
 *   it collapses to one repository edge the day the documents cluster gains a
 *   write API.
 *
 *   **The refusal.** `accept` runs the domain's own guards —
 *   `everyExtractionConfirmed` and `aadhaarMaskedToLast4` — rather than a second
 *   copy of those rules written here. A refusal therefore comes back in the
 *   domain's own words, which is the same sentence the KYC machine would refuse
 *   a completion with. There is no rule in this file the domain does not hold.
 *
 *   **The row's progress as a filter.** Whether a document's extractions are
 *   still waiting is not something `DocumentRepository` can be asked, because it
 *   depends on verdicts that live here. So the narrowing is applied on this desk,
 *   after the repository's own read — the move `documentVault` makes for
 *   retention class.
 *
 * What this desk does NOT do is change a document's `reviewState`. It cannot,
 * and it does not pretend to: the screen says so where a person would look for
 * the effect, rather than showing a receipt for a write that never happened.
 */

import { aadhaarMaskedToLast4, everyExtractionConfirmed } from '../../../domain/workflows'
import type { ExtractedField } from '../../../domain/workflows'
import type { DocumentRecord, ListQuery, Page, Repositories } from '../../../data/repo'
import { DEFAULT_PAGE_SIZE } from '../../../data/repo'
import {
  REVIEW_PROGRESS,
  extractionsOf,
  reviewProgressOf,
  unconfirmed,
} from '../ocr-review-view'
import type { ExtractionVerdict, ReviewExtraction, ReviewProgress } from '../ocr-review-view'

/** Big enough to hold the whole in-memory set; the progress pass needs every row. */
const SCAN_SIZE = 10_000

/**
 * The filter key the repository does not declare, applied on this desk instead.
 *
 * Checked against `RESERVED_QUEUE_PARAMS` by `<WorkQueue>` at mount, so a
 * collision with a URL parameter fails loudly rather than silently shadowing one.
 */
export const REVIEW_PROGRESS_FILTER = 'progress'

/** One row: the document's metadata, and its extractions as a reviewer sees them. */
export type OcrReviewRow = {
  readonly document: DocumentRecord
  /** Masked, labelled, and carrying whatever verdict a person has given each one. */
  readonly extractions: readonly ReviewExtraction[]
  readonly progress: ReviewProgress
}

/** What `accept` gives back: a receipt, or the domain's own refusal sentence. */
export type ReviewOutcome =
  | { readonly ok: true; readonly recorded: number }
  | { readonly ok: false; readonly reason: string }

export type AcceptReviewInput = {
  readonly documentId: string
  /** Every extraction on the document, as the reviewer left it. */
  readonly verdicts: readonly Omit<ExtractionVerdict, 'documentId' | 'reviewedAt'>[]
  readonly now: Date
}

export type OcrReviewDesk = {
  /** The queue: documents somebody has yet to look at. The rail counts this set. */
  awaitingReview(query?: ListQuery): Promise<Page<OcrReviewRow>>
  /** Every verdict recorded against one document in this session, newest last. */
  verdictsFor(documentId: string): readonly ExtractionVerdict[]
  /**
   * Records a reviewer's verdicts. Refuses — writing nothing — while any
   * extraction is unconfirmed, or if a full Aadhaar somehow reached this seam.
   */
  accept(input: AcceptReviewInput): ReviewOutcome
}

const CACHE = new WeakMap<Repositories, OcrReviewDesk>()

/** One desk per repository set, so the queue and its drawer share one ledger. */
export function ocrReviewDesk(repositories: Repositories): OcrReviewDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories, built)
  return built
}

/** Splits the progress question out of the query the repository will see. */
function splitProgressFilter(query: ListQuery): {
  readonly wanted: readonly string[]
  readonly rest: ListQuery
} {
  const filters = { ...(query.filters ?? {}) }
  const wanted = filters[REVIEW_PROGRESS_FILTER] ?? []
  delete filters[REVIEW_PROGRESS_FILTER]
  return { wanted, rest: { ...query, filters } }
}

/**
 * Free-text search over the queue.
 *
 * `awaitingReview` declares no search of its own, so it is applied here — over
 * the reference and the document type, which are `operational` fields. It is
 * deliberately not applied over the extracted values: a search box that matched
 * a document's contents would turn this screen into a content search surface,
 * which is exactly what §14.1 keeps the vault from being.
 */
function matchesSearch(document: DocumentRecord, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (needle === '') return true
  return (
    document.systemNo.toLowerCase().includes(needle) ||
    document.docType.toLowerCase().includes(needle) ||
    document.subjectEntity.toLowerCase().includes(needle)
  )
}

function buildDesk(repositories: Repositories): OcrReviewDesk {
  /**
   * Append-only. There is no method here that removes, edits or clears an
   * entry, and `verdictsFor` returns a copy, so a caller cannot mutate the
   * ledger through the array it is handed.
   */
  const ledger: ExtractionVerdict[] = []

  function verdictsFor(documentId: string): readonly ExtractionVerdict[] {
    return ledger.filter((verdict) => verdict.documentId === documentId)
  }

  return {
    verdictsFor,

    async awaitingReview(query = {}) {
      const { wanted, rest } = splitProgressFilter(query)

      // Wide, because both the progress pass and the search have to see every
      // row before the page is cut. The repository still applies its own
      // `docType` filter and its own sort on the way past.
      const wide = await repositories.documents.awaitingReview({
        ...rest,
        page: 1,
        pageSize: SCAN_SIZE,
      })

      const rows = wide.rows
        .filter((document) => matchesSearch(document, rest.search ?? ''))
        .map((document): OcrReviewRow => {
          const extractions = extractionsOf(document, verdictsFor(document.id))
          return { document, extractions, progress: reviewProgressOf(extractions) }
        })
        .filter((row) => wanted.length === 0 || wanted.includes(row.progress))

      const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
      const pageCount = Math.ceil(rows.length / pageSize)
      const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
      const start = (page - 1) * pageSize

      return {
        rows: rows.slice(start, start + pageSize),
        total: rows.length,
        page,
        pageSize,
        pageCount,
      }
    },

    accept(input) {
      const extractedFields: readonly ExtractedField[] = input.verdicts.map((verdict) => ({
        name: verdict.name,
        value: verdict.value,
        confirmed: verdict.confirmed,
      }))

      // The domain's own guards, in the domain's own words. A second wording
      // here would be a second rule, and the two would drift.
      const confirmed = everyExtractionConfirmed({ now: input.now, extractedFields })
      if (!confirmed.ok) return { ok: false, reason: confirmed.reason }

      const masked = aadhaarMaskedToLast4({ now: input.now, extractedFields })
      if (!masked.ok) return { ok: false, reason: masked.reason }

      const reviewedAt = input.now.toISOString()
      for (const verdict of input.verdicts) {
        ledger.push({ ...verdict, documentId: input.documentId, reviewedAt })
      }

      return { ok: true, recorded: input.verdicts.length }
    },
  }
}

/**
 * How many extractions on this row are still waiting on a person.
 *
 * Exported because the queue prints it, the drawer prints it, and the submit
 * control refuses on it — three surfaces that must agree, so they ask one
 * function.
 */
export function stillWaiting(row: OcrReviewRow): number {
  return unconfirmed(row.extractions).length
}

/** Whether this row has nothing for a reviewer to vouch for. A real answer. */
export function nothingExtracted(row: OcrReviewRow): boolean {
  return row.progress === REVIEW_PROGRESS.none
}
