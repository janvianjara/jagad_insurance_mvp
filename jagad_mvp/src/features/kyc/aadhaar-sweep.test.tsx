import { cleanup, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import type { Customer, CustomerRepository, DocumentRepository, Member, Policy, PolicyRepository } from '../../data/repo'
import { maskAtExtraction } from './kyc-view'
import { RAKESH, WHO, freshRepositories, renderCustomers, signIn } from '../customers/test-harness'

/**
 * The constitution's hardest line, tested the only way it can honestly be
 * tested: by handing the screens a full Aadhaar number and sweeping everything
 * they render.
 *
 * "Aadhaar: last-4 maximum in staff UI, never the full number anywhere."
 *
 * A test that asserted the fixtures hold no full number would prove nothing —
 * they hold none by design (`Customer.aadhaarNumber` is typed `null` precisely
 * so the classification has something to forbid). What has to be true is
 * stronger: even if the data layer hands a screen twelve digits, the screen
 * renders four. So this file wraps the real repositories in a decorator that
 * poisons every Aadhaar-shaped field with a full number, renders every screen in
 * the feature, and walks the rendered DOM — every text node AND every attribute,
 * because `<OcrField>` writes its extraction into `data-extracted` and a leak
 * into an attribute is a leak.
 *
 * Two sweeps run over each screen:
 *
 *   1. the planted numbers, in all three ways a document prints them, appear
 *      nowhere;
 *   2. no run of twelve or more digits appears anywhere that is not a known
 *      insurer policy number. That is the catch-all: it fails on a full Aadhaar
 *      nobody planted, arriving from a field nobody thought of.
 */

/** Never a real Aadhaar: the checksum is deliberately meaningless. */
const FULL = '432112344102'
const SPACED = '4321 1234 4102'
const HYPHENATED = '4321-1234-4102'
const PLANTED = [FULL, SPACED, HYPHENATED] as const

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

function sweep(where: string, allowedNumbers: readonly string[]): void {
  const pieces = textAndAttributes(document.body)
  const haystack = pieces.join('\n')

  for (const planted of PLANTED) {
    expect(haystack, `${where} rendered a full Aadhaar number`).not.toContain(planted)
  }

  // An insurer number carries letters too (`OG-27-2601-1811-00004402`), so what
  // is allowed is the digit runs INSIDE one, not the whole string.
  const allowed = new Set(
    allowedNumbers.flatMap((value) =>
      (value.match(LONG_DIGIT_RUN) ?? []).map((run) => run.replace(/[\s-]/g, '')),
    ),
  )
  for (const piece of pieces) {
    for (const run of piece.match(LONG_DIGIT_RUN) ?? []) {
      const digits = run.replace(/[\s-]/g, '')
      expect(
        allowed.has(digits),
        `${where} rendered a ${digits.length}-digit run ("${run}") that is not a known insurer policy number`,
      ).toBe(true)
    }
  }
}

/**
 * A data layer that hands over more than it should.
 *
 * Every Aadhaar-shaped field comes back holding the whole number, including the
 * `aadhaarLast4` fields that are supposed to hold four digits and the OCR read
 * on the Aadhaar document. If any screen simply prints what it is given, this
 * test fails.
 */
function poisoned(repositories: MockRepositories): MockRepositories {
  const spoilCustomer = (row: Customer): Customer =>
    ({ ...row, aadhaarNumber: FULL, aadhaarLast4: SPACED }) as unknown as Customer
  const spoilMember = (row: Member): Member =>
    ({ ...row, aadhaarNumber: FULL, aadhaarLast4: HYPHENATED }) as unknown as Member
  const spoilPolicy = (row: Policy): Policy => ({ ...row, nomineeAadhaarLast4: FULL })

  const base = repositories.customers
  const customers: CustomerRepository = {
    ...base,
    async list(query) {
      const page = await base.list(query)
      return { ...page, rows: page.rows.map(spoilCustomer) }
    },
    async forOwner(ownerId, query) {
      const page = await base.forOwner(ownerId, query)
      return { ...page, rows: page.rows.map(spoilCustomer) }
    },
    async get(id) {
      const row = await base.get(id)
      return row === null ? null : spoilCustomer(row)
    },
    async members(customerId) {
      return (await base.members(customerId)).map(spoilMember)
    },
    async household(householdId) {
      const view = await base.household(householdId)
      if (view === null) return null
      return {
        ...view,
        customers: view.customers.map(spoilCustomer),
        members: view.members.map(spoilMember),
      }
    },
  }

  const policies: PolicyRepository = {
    ...repositories.policies,
    async forCustomer(customerId) {
      return (await repositories.policies.forCustomer(customerId)).map(spoilPolicy)
    },
  }

  const documents: DocumentRepository = {
    ...repositories.documents,
    async forSubject(entity, id) {
      const rows = await repositories.documents.forSubject(entity, id)
      return rows.map((row) =>
        row.docType === 'aadhaar'
          ? {
              ...row,
              extractedText: `GOVERNMENT OF INDIA ${SPACED}`,
              ocrFields: [{ name: 'aadhaarLast4', value: SPACED, confirmed: false }],
            }
          : row,
      )
    },
  }

  return { ...repositories, customers, policies, documents }
}

let repositories: MockRepositories
let allowedNumbers: readonly string[]

beforeEach(async () => {
  const real = freshRepositories()
  await signIn(real, WHO.priya)

  // Insurer policy numbers are the one long digit run this product legitimately
  // prints, so the sweep is told what they are rather than being loosened.
  const page = await real.policies.list({ page: 1, pageSize: 10_000 })
  allowedNumbers = page.rows
    .map((policy) => policy.insurerNo)
    .filter((value): value is string => value !== null)

  repositories = poisoned(real)
})

const SCREENS: readonly (readonly [string, string])[] = [
  ['the customer list', '/customers'],
  ['the 360 household tab', `/customers/${RAKESH}?tab=household`],
  ['the 360 policies tab', `/customers/${RAKESH}?tab=policies`],
  ['the 360 documents tab', `/customers/${RAKESH}?tab=documents`],
  ['the 360 transactions tab', `/customers/${RAKESH}?tab=transactions`],
  ['the 360 requests tab', `/customers/${RAKESH}?tab=requests`],
  ['the 360 timeline tab', `/customers/${RAKESH}?tab=timeline`],
  ['the KYC file', `/customers/${RAKESH}?tab=kyc`],
  ['the KYC queue', '/back-office/kyc?q=Patel'],
]

describe('no screen in this feature renders a full Aadhaar number', () => {
  for (const [where, path] of SCREENS) {
    it(`${where} shows the last four digits and no more`, async () => {
      renderCustomers(repositories, path)
      // Wait for real content rather than sweeping a skeleton.
      await screen.findAllByRole('heading')
      sweep(where, allowedNumbers)
    })
  }

  it('the consent page shows the last four digits and no more', async () => {
    const consent = await repositories.customers.consent(RAKESH)
    if (!consent) throw new Error('Rakesh has no consent link.')

    renderCustomers(repositories, `/consent/${consent.token}`)
    await screen.findByRole('heading', { name: 'Namaste Rakesh' })
    sweep('the consent page', allowedNumbers)
  })

  it('masks at extraction, so the full number never reaches an OcrField at all', () => {
    // §9: "Aadhaar is masked to last-4 on extraction." `<OcrField>` writes its
    // extraction into a data attribute, so extraction is the last moment this
    // can be done — and it is done here, in one function, by the domain's own
    // masking rule.
    expect(maskAtExtraction('aadhaarLast4', SPACED)).toBe('4102')
    expect(maskAtExtraction('aadhaarLast4', HYPHENATED)).toBe('4102')
    expect(maskAtExtraction('aadhaarLast4', FULL)).toBe('4102')

    // An already-masked read is left alone, and a field that is not an Aadhaar
    // is not silently truncated — a policy number is allowed its digits.
    expect(maskAtExtraction('aadhaarLast4', '4102')).toBe('4102')
    expect(maskAtExtraction('insurerNo', '2825 1049 7731 00')).toBe('2825 1049 7731 00')
  })

  it('renders the Aadhaar it does hold as a masked identifier, not a bare number', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}?tab=household`)
    await screen.findByRole('heading', { name: 'Rakesh Patel' })

    // Padded to the identifier's real width, so the screen says both what is
    // known and what is deliberately not.
    expect(screen.getAllByText('•••• •••• 4102').length).toBeGreaterThan(0)
    cleanup()
  })
})
