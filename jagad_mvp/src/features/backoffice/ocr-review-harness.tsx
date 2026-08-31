/**
 * The harness the OCR review tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and mounts the queue behind its own address with the screens it
 * links to stubbed.
 *
 * `poisonedDocuments` is the important part and is modelled on the KYC feature's
 * Aadhaar sweep. Asserting that the fixtures hold no full Aadhaar number would
 * prove nothing — they hold none by design. What has to be true is stronger:
 * even when the data layer hands this screen twelve digits, the screen renders
 * four. So a decorator plants a full number on a document that reaches the review
 * queue, and the test sweeps everything the drawer renders.
 *
 * Nothing here imports a fixture. Every record is reached through a repository,
 * exactly as a screen reaches it.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import type { DocumentRecord, DocumentRepository } from '../../data/repo'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { CustomerClockBase } from '../customers/clock'
import OcrReviewQueueScreen from './OcrReviewQueueScreen'

/** The instant the walkthrough is written against. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  /** Back office — the desk this queue is for, and the `document-content` grant. */
  priya: 'usr-priya-desai',
  /** Admin — the whole business. */
  vivek: 'usr-vivek-jagad',
} as const

/**
 * The fixture documents these scenarios are written against.
 *
 * Each is chosen for the one thing it can prove, and the references are read
 * back off the repository in the tests rather than written down here.
 */
export const DOCS = {
  /** Canvas 3.6's insurer policy PDF: four readings, none confirmed. */
  policyPdf: 'doc-pol-draft-0224',
  /** One reading, unconfirmed. The smallest form the rule can be shown on. */
  pan: 'doc-pan-rakesh',
  /** Submitted with nothing extracted. A real row, and an honest empty state. */
  noExtraction: 'doc-qtn-0332',
} as const

/** Never a real Aadhaar: the checksum is deliberately meaningless. */
export const FULL_AADHAAR = '432112344102'
export const SPACED_AADHAAR = '4321 1234 4102'
export const HYPHENATED_AADHAAR = '4321-1234-4102'

export function freshRepositories(): MockRepositories {
  useSessionStore.getState().reset()
  return createMockRepositories({ latency: NO_LATENCY })
}

/** What the shell does at boot, without the shell. */
export async function signIn(repositories: MockRepositories, userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

/**
 * A data layer that hands over more than it should.
 *
 * One document on the review queue becomes an Aadhaar scan whose extracted
 * value is the whole number, spaced the way a document prints it, under a field
 * name that says nothing about Aadhaar. If the screen simply prints what it is
 * given, the sweep fails.
 */
export function poisonedDocuments(repositories: MockRepositories): MockRepositories {
  const spoil = (row: DocumentRecord): DocumentRecord =>
    row.id === DOCS.pan
      ? {
          ...row,
          docType: 'aadhaar',
          extractedText: `GOVERNMENT OF INDIA ${SPACED_AADHAAR}`,
          ocrFields: [{ name: 'idNumber', value: SPACED_AADHAAR, confirmed: false }],
        }
      : row

  const base = repositories.documents
  const documents: DocumentRepository = {
    ...base,
    async awaitingReview(query) {
      const page = await base.awaitingReview(query)
      return { ...page, rows: page.rows.map(spoil) }
    },
    async list(query) {
      const page = await base.list(query)
      return { ...page, rows: page.rows.map(spoil) }
    },
    async get(id) {
      const row = await base.get(id)
      return row === null ? null : spoil(row)
    },
  }

  return { ...repositories, documents }
}

export function renderOcrReview(
  repositories: MockRepositories,
  path = '/back-office/ocr-review',
  now: Date = WALKTHROUGH_NOW,
) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <CustomerClockBase value={now}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/back-office/ocr-review" element={<OcrReviewQueueScreen />} />
              <Route path="/back-office/issuance" element={<h1>Issuance</h1>} />
              <Route path="/policies/:policyId" element={<h1>Policy file</h1>} />
              <Route path="/customers/:customerId" element={<h1>Customer</h1>} />
              <Route path="/quotations/:quotationId" element={<h1>Quotation</h1>} />
              <Route path="/claims/:claimId" element={<h1>Claim</h1>} />
            </Routes>
          </MemoryRouter>
        </CustomerClockBase>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
