import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { ocrReviewDesk } from './data/ocr-review-desk'
import { maskExtractedValue, reviewProgressOf } from './ocr-review-view'
import {
  DOCS,
  FULL_AADHAAR,
  HYPHENATED_AADHAAR,
  SPACED_AADHAAR,
  WALKTHROUGH_NOW,
  WHO,
  freshRepositories,
  poisonedDocuments,
  renderOcrReview,
  signIn,
} from './ocr-review-harness'

/**
 * FR-08.1's sixth ops queue — `/back-office/ocr-review`, FR-16, charter U10.
 *
 * The human check on machine extraction, and the screen the product's strongest
 * guardrail is most visible on. Four promises, each of which can break on its
 * own:
 *
 *   - the queue is `documents.awaitingReview` and exactly that, so the lime count
 *     beside "OCR review" in the navigation rail and the number in this queue's
 *     header are the same read of the same set;
 *   - OCR never silent-commits. A form holding an unconfirmed extraction cannot
 *     submit, the count of what is outstanding is stated, and the desk refuses
 *     again on its own account in the domain's own words;
 *   - accepting is an outward act and goes through `<ConfirmGate>`. Cancel writes
 *     nothing;
 *   - Aadhaar: last-4 maximum, even when the data layer hands the screen twelve
 *     digits.
 *
 * Nothing here imports a fixture. Every expected value is read back through the
 * same repository the screen reads.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

/** Twelve or more digits in a row, however a document spaces them. */
const LONG_DIGIT_RUN = /\d(?:[\s-]?\d){11,}/g

function textAndAttributes(root: HTMLElement): readonly string[] {
  const found: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)

  for (let node = walker.currentNode; node !== null; node = walker.nextNode() as Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      found.push(node.textContent ?? '')
      continue
    }
    for (const attribute of Array.from((node as Element).attributes ?? [])) {
      found.push(attribute.value)
    }
  }
  return found
}

async function reference(documentId: string): Promise<string> {
  const record = await repositories.documents.get(documentId)
  if (!record) throw new Error(`The fixtures hold no document ${documentId}.`)
  return record.systemNo
}

async function openRow(systemNo: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('row', { name: new RegExp(systemNo) }))
  return user
}

describe('the queue is exactly what the rail counts', () => {
  it('holds every document awaiting review and nothing else in the vault', async () => {
    // The same read `documentsToReview` in the navigation rail performs. A rail
    // saying five over a list of four is the defect that catches a walkthrough
    // in its first minute.
    const rail = await repositories.documents.awaitingReview({ pageSize: 1 })
    const vault = await repositories.documents.list({ page: 1, pageSize: 10_000 })

    expect(vault.total).toBeGreaterThan(rail.total)
    expect(rail.total).toBeGreaterThan(0)

    const desk = ocrReviewDesk(repositories)
    const queue = await desk.awaitingReview({ page: 1, pageSize: 10_000 })

    expect(queue.total).toBe(rail.total)
    for (const row of queue.rows) {
      expect(['awaiting', 'submitted']).toContain(row.document.reviewState)
    }
  })

  it('renders one row per waiting document', async () => {
    const rail = await repositories.documents.awaitingReview({ pageSize: 1 })
    renderOcrReview(repositories)

    await screen.findByRole('row', { name: new RegExp(await reference(DOCS.policyPdf)) })
    const grid = screen.getByRole('grid')
    expect(within(grid).getAllByRole('row').slice(1)).toHaveLength(rail.total)
  })

  it('never offers a bulk action over an extraction', async () => {
    renderOcrReview(repositories)
    await screen.findByRole('grid')

    // Confirming a reading is a person vouching for what a machine read off a
    // piece of paper. A ticked-forty-and-confirm affordance over that is exactly
    // the silent commit FR-16 exists to forbid.
    expect(screen.queryByRole('checkbox', { name: /select all/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /confirm all/i })).toBeNull()
  })

  it('says so honestly when a document had nothing extracted', async () => {
    const systemNo = await reference(DOCS.noExtraction)
    const record = await repositories.documents.get(DOCS.noExtraction)
    expect(record?.ocrFields).toHaveLength(0)

    renderOcrReview(repositories, `/back-office/ocr-review?q=${systemNo}`)
    await openRow(systemNo)

    expect(await screen.findByText(/No extraction was run over this document/)).toBeInTheDocument()
  })
})

describe('FR-16 — extraction never silent-commits', () => {
  it('refuses the submit while a reading is unconfirmed, and says how many', async () => {
    const systemNo = await reference(DOCS.policyPdf)
    const record = await repositories.documents.get(DOCS.policyPdf)
    const waiting = record!.ocrFields.filter((field) => !field.confirmed).length
    expect(waiting).toBeGreaterThan(1)

    renderOcrReview(repositories, `/back-office/ocr-review?q=${systemNo}`)
    await openRow(systemNo)

    const submit = await screen.findByRole('button', { name: 'Record these confirmations' })
    expect(submit).toBeDisabled()

    // The count is stated, not left to be discovered by clicking a dead button.
    expect(
      screen.getByText(`${waiting} extracted values need confirming before this can be saved.`),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        `${waiting} of these values still need a person. Nothing is on the record until they have one.`,
      ),
    ).toBeInTheDocument()
  })

  it('lets the submit through only once every reading has been confirmed', async () => {
    const systemNo = await reference(DOCS.policyPdf)
    const record = await repositories.documents.get(DOCS.policyPdf)
    const user = await openWith(systemNo)

    const confirms = screen.getAllByRole('button', { name: 'Confirm' })
    expect(confirms).toHaveLength(record!.ocrFields.length)

    for (const button of confirms.slice(0, -1)) {
      await user.click(button)
    }
    expect(screen.getByRole('button', { name: 'Record these confirmations' })).toBeDisabled()

    await user.click(screen.getAllByRole('button', { name: 'Confirm' })[0]!)
    expect(screen.getByRole('button', { name: 'Record these confirmations' })).toBeEnabled()
  })

  it('refuses on the desk as well, in the domain own sentence, and writes nothing', () => {
    // The provider guards the form; the desk is what writes, and a write should
    // refuse on its own account rather than on the good behaviour of the
    // component around it.
    const desk = ocrReviewDesk(repositories)
    const outcome = desk.accept({
      documentId: DOCS.policyPdf,
      verdicts: [
        { name: 'insurerNo', value: 'HE-OPS-1', extracted: 'HE-OPS-1', confirmed: true, actorId: WHO.priya },
        { name: 'startDate', value: '2026-09-01', extracted: '2026-09-01', confirmed: false, actorId: WHO.priya },
      ],
      now: WALKTHROUGH_NOW,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toMatch(
      /Confirm the extracted values before saving: startDate/,
    )
    expect(desk.verdictsFor(DOCS.policyPdf)).toHaveLength(0)
  })

  it('records the verdicts once every one of them is confirmed', () => {
    const desk = ocrReviewDesk(repositories)
    const outcome = desk.accept({
      documentId: DOCS.policyPdf,
      verdicts: [
        { name: 'insurerNo', value: 'HE-OPS-1', extracted: 'HE-OPS-1', confirmed: true, actorId: WHO.priya },
        { name: 'startDate', value: '2026-09-02', extracted: '2026-09-01', confirmed: true, actorId: WHO.priya },
      ],
      now: WALKTHROUGH_NOW,
    })

    expect(outcome.ok).toBe(true)
    const recorded = desk.verdictsFor(DOCS.policyPdf)
    expect(recorded).toHaveLength(2)
    // The original read is kept beside what the person typed over it.
    expect(recorded[1]).toMatchObject({ value: '2026-09-02', extracted: '2026-09-01' })
  })
})

describe('accepting is gated', () => {
  it('writes nothing when the gate is cancelled', async () => {
    const systemNo = await reference(DOCS.pan)
    const user = await openWith(systemNo)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Record these confirmations' }))

    // The gate is up. Cancel closes a dialog that never called anything.
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(ocrReviewDesk(repositories).verdictsFor(DOCS.pan)).toHaveLength(0)
  })

  it('records through the gate, and says what did not change as well as what did', async () => {
    const systemNo = await reference(DOCS.pan)
    const user = await openWith(systemNo)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Record these confirmations' }))
    await user.click(await screen.findByRole('button', { name: 'Record them' }))

    await waitFor(() => {
      expect(ocrReviewDesk(repositories).verdictsFor(DOCS.pan)).toHaveLength(1)
    })

    expect(await screen.findByText('Every extraction here has been confirmed.')).toBeInTheDocument()
    expect(screen.getByText('1 value a person has vouched for')).toBeInTheDocument()
    // The honest hole: the documents repository is read-only, so the document's
    // own review state is unchanged and the screen says so where a person would
    // look for the effect.
    expect(
      screen.getByText(/documents repository is read-only in this MVP/),
    ).toBeInTheDocument()

    const after = await repositories.documents.get(DOCS.pan)
    expect(after?.reviewState).toBe('submitted')
  })
})

describe('Aadhaar — last four, and never more', () => {
  it('masks at extraction, whatever the field is called on an Aadhaar document', () => {
    // §9: masking happens at extraction, not at display. `<OcrField>` writes its
    // value into a `data-extracted` attribute, so extraction is the last moment
    // this can be done at all.
    expect(maskExtractedValue('aadhaar', 'idNumber', SPACED_AADHAAR)).toBe('4102')
    expect(maskExtractedValue('aadhaar', 'idNumber', HYPHENATED_AADHAAR)).toBe('4102')
    expect(maskExtractedValue('aadhaar', 'idNumber', FULL_AADHAAR)).toBe('4102')
    expect(maskExtractedValue('aadhaar', 'aadhaarLast4', SPACED_AADHAAR)).toBe('4102')

    // An already-masked read is left alone, and a field that is not an identity
    // number is not silently truncated — a policy number is allowed its digits.
    expect(maskExtractedValue('aadhaar', 'aadhaarLast4', '4102')).toBe('4102')
    expect(maskExtractedValue('policy_pdf', 'insurerNo', '2825 1049 7731 00')).toBe(
      '2825 1049 7731 00',
    )
  })

  it('renders four digits even when the data layer hands the screen twelve', async () => {
    const poisoned = poisonedDocuments(repositories)
    const systemNo = await reference(DOCS.pan)

    renderOcrReview(poisoned, `/back-office/ocr-review?q=${systemNo}`)
    await openRow(systemNo)
    await screen.findByRole('button', { name: 'Confirm' })

    const pieces = textAndAttributes(document.body)
    const haystack = pieces.join('\n')

    for (const planted of [FULL_AADHAAR, SPACED_AADHAAR, HYPHENATED_AADHAAR]) {
      expect(haystack, 'the review drawer rendered a full Aadhaar number').not.toContain(planted)
    }

    // The catch-all: no long digit run anywhere, in a text node or an attribute.
    for (const piece of pieces) {
      expect(piece.match(LONG_DIGIT_RUN)).toBeNull()
    }

    // And what it does show is the tail, which is the only representation the
    // product allows.
    expect(screen.getAllByDisplayValue('4102').length).toBeGreaterThan(0)
  })

  it('never lets the document body text reach the screen', async () => {
    // `extractedText` is `document-content` (§14.1). The harness plants a whole
    // Aadhaar card's worth of it; nothing on this screen may render a word.
    const poisoned = poisonedDocuments(repositories)
    const systemNo = await reference(DOCS.pan)

    renderOcrReview(poisoned, `/back-office/ocr-review?q=${systemNo}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('row', { name: new RegExp(systemNo) }))
    await screen.findByRole('button', { name: 'Confirm' })

    expect(screen.queryByText(/GOVERNMENT OF INDIA/)).toBeNull()
  })
})

describe('the pure read', () => {
  it('calls a document with no extraction none, not reviewed', () => {
    expect(reviewProgressOf([])).toBe('none')
  })
})

/** Opens one document's drawer and hands back the user-event session. */
async function openWith(systemNo: string) {
  renderOcrReview(repositories, `/back-office/ocr-review?q=${systemNo}`)
  return openRow(systemNo)
}
