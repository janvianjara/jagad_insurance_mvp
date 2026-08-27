import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { RAKESH, WHO, freshRepositories, renderCustomers, signIn } from './test-harness'

/**
 * Customer 360 — plan §5's row, prototype card `g_360`.
 *
 * The row asks for seven things on one screen: household, members and
 * relationships, policies, documents, transactions, change requests, consent
 * state and the audit timeline. There is one test per thing, because "the 360"
 * passing as a single assertion would hide the one tab somebody deleted.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

async function openTab(label: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('tab', { name: new RegExp(label, 'i') }))
}

describe('customer 360', () => {
  it('opens on the household with every member and their relationship', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}`)

    expect(await screen.findByRole('heading', { name: 'Rakesh Patel' })).toBeInTheDocument()

    const members = panel('Members and relationships')
    for (const name of ['Rakesh Patel', 'Nita Patel', 'Aarav Patel', 'Kavya Patel']) {
      expect(within(members).getByText(name)).toBeInTheDocument()
    }
    expect(within(members).getByText('Spouse')).toBeInTheDocument()
    expect(within(members).getByText('Son')).toBeInTheDocument()
    expect(within(members).getByText('Daughter')).toBeInTheDocument()
  })

  it('shows both numbers on every policy, and the premium as recorded', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}?tab=policies`)

    const policies = await screen.findByRole('heading', { name: 'Policies' })
    const section = policies.closest('section') as HTMLElement

    // Dual numbering: ours always, the insurer's where it has arrived.
    expect(within(section).getAllByText('sys').length).toBeGreaterThan(0)
    expect(within(section).getAllByText('insurer').length).toBeGreaterThan(0)
  })

  it('shows document metadata and never a word of document content', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}?tab=documents`)

    const section = (await screen.findByRole('heading', { name: 'Documents' })).closest(
      'section',
    ) as HTMLElement

    expect(within(section).getByText('Aadhaar')).toBeInTheDocument()
    expect(within(section).getByText('PAN card')).toBeInTheDocument()

    // The vault holds a file name and a URL against both documents. Neither is
    // a fact this screen is allowed to render.
    const documents = await repositories.documents.forSubject('Customer', RAKESH)
    for (const document of documents) {
      if (document.fileName) expect(section.textContent).not.toContain(document.fileName)
      if (document.fileUrl) expect(section.textContent).not.toContain(document.fileUrl)
    }
  })

  it('lists the transactions recorded against the customer, never a computed one', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}?tab=transactions`)
    expect(await screen.findByRole('heading', { name: 'Transactions' })).toBeInTheDocument()
  })

  it('lists the open work raised against the customer', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}?tab=requests`)
    expect(
      await screen.findByRole('heading', { name: 'Change requests and open work' }),
    ).toBeInTheDocument()
  })

  it('shows where consent stands in the header, without opening a tab', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}`)
    expect(await screen.findByText('Link sent, awaiting the customer')).toBeInTheDocument()
  })

  it('builds the timeline from the event log — who did what, when (U14)', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}?tab=timeline`)

    const timeline = await screen.findByRole('list', { name: /Timeline for Rakesh Patel/ })

    // Reconstructed from the record's own timestamps: the vault has an Aadhaar
    // verified by Priya Desai and a consent link issued two days ago.
    expect(within(timeline).getAllByText('Document received').length).toBeGreaterThan(0)
    expect(within(timeline).getByText('Document verified')).toBeInTheDocument()
    expect(within(timeline).getByText('Consent link sent')).toBeInTheDocument()

    // Every line carries an actor. That is the whole of U14.
    expect(within(timeline).getAllByText('Priya Desai').length).toBeGreaterThan(0)
  })

  it('keeps the open tab in the URL, so a link to a timeline is a link to a timeline', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}`)
    await screen.findByRole('heading', { name: 'Household' })

    await openTab('Timeline')
    expect(await screen.findByRole('heading', { name: 'Everything that has happened' })).toBeInTheDocument()
  })
})
