/**
 * The mock policy-document extractor — canvas 3.6, "PDF uploaded -> OCR fills".
 *
 * There is no OCR engine in M0, and this file is careful to be a stand-in rather
 * than a pretence. It holds a small table of what three fixture policy schedules
 * say, keyed by the policy the document belongs to, and hands those readings
 * back as `IssuanceExtraction`s for `<OcrField>` to put in front of a person.
 *
 * Two rules shaped every decision here, and both are worth stating because both
 * had a tempting alternative:
 *
 *   **It never reads a figure the platform already holds.** The obvious mock is
 *   `finalPremium: amountDraft(policy.finalPremium)` — one line, always in step
 *   with the record, and completely dishonest. A screen that shows a person the
 *   platform's own number, dressed as something read off the insurer's paper,
 *   invites them to confirm the platform's arithmetic back into the record. That
 *   is D3 broken by theatre rather than by code, and it is exactly the failure
 *   the record-only rule exists to prevent. So the figures live in the table
 *   below, written once against the fixture documents, and a policy with no page
 *   here extracts nothing at all.
 *
 *   **It returns text, never `Money`.** What comes out is the digit string as
 *   printed. It becomes an amount only after a person has confirmed it, and only
 *   through `parseAmountDraft` — the same translation the typed control uses.
 *   There is no second way for an amount to enter this product, and this module
 *   is not one.
 *
 * The `product` argument is a check, not a source. A page in the table records
 * which product's schedule it was written against, so uploading an Iffco-Tokio
 * schedule against a Tata AIG policy reads nothing rather than reading the wrong
 * insurer's numbers into the wrong record. The wrong document produces silence,
 * which a person can see, instead of plausible values, which they cannot.
 *
 * Everything here is deterministic: the same policy yields the same readings and
 * the same confidences on every run, so a test can assert on them.
 */

import type { Policy, Product } from '../../data/repo'
import { ISSUANCE_FIELDS } from './entry-types'
import type { IssuanceExtraction, IssuanceFieldName } from './entry-types'

/**
 * What one fixture policy schedule says, as printed on it.
 *
 * The premium is a plain digit string rather than the grouped `18,450.00` a real
 * schedule prints, because the extractor's number reader normalises grouping
 * before it hands a value on — and because a value a person confirms has to be
 * a value `parseAmountDraft` can read back without them retyping it.
 */
export type MockPolicyPage = {
  /** The product code printed on the schedule. Checked against the policy's product. */
  readonly productCode: string
  readonly insurerNo: string
  readonly finalPremium: string
  readonly startDate: string
  readonly expiryDate: string
}

/**
 * The documents the mock can read, keyed by the policy each belongs to.
 *
 * Three rows, and each is the paper behind one canvas 3.6 scenario. They are
 * written down here rather than derived from the record for the reason in the
 * file's opening note: a derived premium is still a premium the platform worked
 * out, whatever the screen says it is.
 */
export const MOCK_POLICY_PAGES: Readonly<Record<string, MockPolicyPage>> = {
  'pol-draft-0219': {
    productCode: 'TA-TVG',
    insurerNo: 'TA-TVG-2026-004417',
    finalPremium: '4820.00',
    startDate: '2026-09-01',
    expiryDate: '2027-08-31',
  },
  'pol-draft-0224': {
    productCode: 'HE-OPS',
    insurerNo: 'HE-OPS-2026-118342',
    finalPremium: '18450.00',
    startDate: '2026-09-01',
    expiryDate: '2027-08-31',
  },
  'pol-draft-0230': {
    productCode: 'IT-FHP',
    insurerNo: 'IT-FHP-2026-771205',
    finalPremium: '26310.00',
    startDate: '2026-08-01',
    expiryDate: '2027-07-31',
  },
}

/**
 * How sure the extractor says it is, per field.
 *
 * Shown by `<OcrField>` and acted on by nothing. There is deliberately no
 * threshold anywhere in this module: a rule that waves through a reading above
 * some confidence is the silent commit FR-16 forbids, dressed as a convenience.
 * A premium reads lower than a policy number because printed money carries
 * separators and a currency mark, and it stays lower whatever a person decides.
 */
export const MOCK_CONFIDENCE: Readonly<Record<IssuanceFieldName, number>> = {
  [ISSUANCE_FIELDS.insurerNo]: 0.97,
  [ISSUANCE_FIELDS.finalPremium]: 0.88,
  [ISSUANCE_FIELDS.startDate]: 0.94,
  [ISSUANCE_FIELDS.expiryDate]: 0.91,
}

const FIELD_LABEL: Readonly<Record<IssuanceFieldName, string>> = {
  [ISSUANCE_FIELDS.insurerNo]: 'Insurer policy number',
  [ISSUANCE_FIELDS.finalPremium]: 'Final premium, as printed',
  [ISSUANCE_FIELDS.startDate]: 'Policy start date',
  [ISSUANCE_FIELDS.expiryDate]: 'Policy expiry date',
}

/** The page for this policy, when the mock has one. */
export function pageFor(policy: Policy): MockPolicyPage | null {
  return MOCK_POLICY_PAGES[policy.id] ?? null
}

/**
 * True when the page in hand belongs to the product the policy was entered on.
 *
 * A `null` product is not a mismatch: it means the caller had nothing to check
 * against, and inventing a failure from a missing fact would be as wrong as
 * inventing a reading from one.
 */
function belongsTo(page: MockPolicyPage, product: Product | null): boolean {
  return product === null || page.productCode === product.code
}

/**
 * What the uploaded document says, as four unconfirmed readings.
 *
 * An empty list is a real answer and the common one: no page, or the wrong
 * insurer's paper. `extractorNote` says which, in words for the person holding
 * the document.
 */
export function extractIssuance(
  policy: Policy,
  product: Product | null,
): readonly IssuanceExtraction[] {
  const page = pageFor(policy)
  if (!page || !belongsTo(page, product)) return []

  const readings: Readonly<Record<IssuanceFieldName, string>> = {
    [ISSUANCE_FIELDS.insurerNo]: page.insurerNo,
    [ISSUANCE_FIELDS.finalPremium]: page.finalPremium,
    [ISSUANCE_FIELDS.startDate]: page.startDate,
    [ISSUANCE_FIELDS.expiryDate]: page.expiryDate,
  }

  return Object.values(ISSUANCE_FIELDS).map((name) => ({
    name,
    label: FIELD_LABEL[name],
    extraction: { value: readings[name], confidence: MOCK_CONFIDENCE[name] },
  }))
}

/**
 * What the extractor did, in one sentence the panel prints under the upload.
 *
 * Being a mock is a fact about this build, and hiding it would make the screen
 * lie about where a number came from. Every branch here says plainly what was
 * read, or why nothing was.
 */
export function extractorNote(policy: Policy, product: Product | null): string {
  const page = pageFor(policy)

  if (!page) {
    return `The mock extractor holds no page for ${policy.systemNo}, so it read nothing from this upload. Type the insurer's figures into the entry form instead: a mock that made them up would be making up a premium.`
  }

  if (!belongsTo(page, product)) {
    return `This document is a ${page.productCode} schedule and the policy was entered on ${product?.code ?? 'another product'}. Nothing was read: the wrong paper extracts nothing rather than the wrong figures.`
  }

  const schedule = product ? `${product.name} policy schedule` : 'policy schedule'
  return `Read by the mock extractor from the ${schedule}. Every value is unconfirmed until a person says otherwise, and none of them is on the record yet.`
}
