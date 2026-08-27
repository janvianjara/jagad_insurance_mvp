import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { customerDesk } from '../customers/data/customer-desk'
import { loadOutstanding } from './queue-config'
import {
  RAKESH,
  WHO,
  freshRepositories,
  renderCustomers,
  signIn,
} from '../customers/test-harness'

/**
 * Canvas flow 3 — "KYC -> Login -> Payment -> Issue" — rows 1 and 2.
 *
 *   3.1  Won deal            -> KYC completed (staff + consent link) -> profile 100%, consent recorded
 *   3.2  KYC completes       -> credentials recipe fires             -> username sent on WhatsApp
 *
 * These are the acceptance criteria for the step, written as the canvas writes
 * them: a situation, a trigger, and the outcome a back-office user expects. They
 * render the real screens against the real mock repositories, so a scenario
 * passing here means the walkthrough works.
 *
 * Rakesh Patel is the walkthrough record: KYC part-filled, a consent link out
 * and unanswered, an Aadhaar verified in the vault and a PAN whose extraction
 * nobody has confirmed. Getting him to complete needs BOTH halves, which is
 * exactly what row 3.1 says.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

async function panel(title: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

/** Confirms every outstanding extraction and saves them. */
async function reviewExtractions() {
  const user = userEvent.setup()
  const section = await panel('Extracted values — confirm each one')
  // The block registers on mount, one tick after the panel paints.
  await within(section).findByRole('status')
  for (const button of within(section).getAllByRole('button', { name: 'Confirm' })) {
    await user.click(button)
  }
  await user.click(within(section).getByRole('button', { name: 'Save the confirmed values' }))
}

async function recordReceived(item: string) {
  const user = userEvent.setup()
  const line = document.querySelector(`[data-checklist-item="${item}"]`) as HTMLElement
  await user.click(within(line).getByRole('button', { name: 'Record received' }))
}

/** Moves the `<SchemaForm>` to a stage the way a person does — through its strip. */
async function openStage(label: string) {
  const user = userEvent.setup()
  const stages = await screen.findByRole('list', { name: 'Stages' })
  const button = within(stages)
    .getAllByRole('button')
    .find((node) => (node.textContent ?? '').includes(label))
  if (!button) throw new Error(`The consent form has no "${label}" stage.`)
  await user.click(button)
}

/**
 * Walks the consent page's schema form and sends it.
 *
 * The form is the configured KYC schema, so the stages here are the stages an
 * admin published — the test walks what is configured rather than what this
 * feature hard-coded, which is the point of a schema-driven form.
 */
async function fillConsentPage() {
  const user = userEvent.setup()

  await openStage('Address')
  await user.type(await screen.findByLabelText('Address'), '14 Ghod Dod Road, Athwalines')
  await user.selectOptions(screen.getByLabelText('City'), 'surat')

  await openStage('Documents')
  await user.selectOptions(screen.getByLabelText('Identity proof'), 'aadhaar')
  await user.upload(
    screen.getByLabelText('Identity proof copy'),
    new File(['proof'], 'aadhaar.jpg', { type: 'image/jpeg' }),
  )
  await user.upload(
    screen.getByLabelText('Address proof copy'),
    new File(['proof'], 'electricity-bill.pdf', { type: 'application/pdf' }),
  )

  await openStage('Consent')
  await user.click(
    screen.getByLabelText(/consented to the agency holding these documents/i),
  )

  await user.click(screen.getByRole('button', { name: 'Review and send' }))
  await user.click(await screen.findByRole('button', { name: 'Yes, send them' }))
}

describe('canvas 3 — KYC, consent and credentials', () => {
  it('3.1 a won deal completes KYC through the desk and the consent link, and consent is recorded', async () => {
    const desk = customerDesk(repositories)

    // --- the back office half -------------------------------------------
    const staff = renderCustomers(repositories, `/customers/${RAKESH}?tab=kyc`)

    expect(await screen.findByText('KYC part-filled')).toBeInTheDocument()

    // The checklist comes from the product's configuration, and it knows what is
    // missing: two of the four items are on file.
    expect(await screen.findByText('2 of 4 on file')).toBeInTheDocument()

    // Completion is blocked, and the block is the machine's own sentence —
    // never "action failed", and never a rule this screen invented.
    expect(screen.getByRole('button', { name: 'Complete KYC' })).toBeDisabled()
    expect(
      screen.getByText(/Still missing: Passport photograph, Address proof\./),
    ).toBeInTheDocument()

    await recordReceived('Passport photograph')
    expect(await screen.findByText('3 of 4 on file')).toBeInTheDocument()

    await reviewExtractions()

    // The address proof is the customer's to supply. Staff alone cannot finish,
    // which is precisely what canvas 3.1's "staff + consent link" means.
    expect(await screen.findByText(/Still missing: Address proof\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete KYC' })).toBeDisabled()
    staff.unmount()

    // --- the customer half ----------------------------------------------
    const consent = await repositories.customers.consent(RAKESH)
    if (!consent) throw new Error('Rakesh has no consent link to open.')

    renderCustomers(repositories, `/consent/${consent.token}`)
    expect(await screen.findByRole('heading', { name: 'Namaste Rakesh' })).toBeInTheDocument()

    await fillConsentPage()

    // Profile 100%, consent recorded — canvas 3.1's outcome, in the customer's
    // own words on their own phone.
    expect(await screen.findByText('Thank you, Rakesh')).toBeInTheDocument()
    expect(screen.getByText(/your file is complete/i)).toBeInTheDocument()

    const after = await repositories.customers.get(RAKESH)
    expect(after?.kycState).toBe('complete')
    expect(after?.consentState).toBe('submitted')

    // And it went through the machine on the consent route, not by a screen
    // setting a status string.
    const completion = repositories.store
      .events()
      .find((event) => event.name === 'kyc.completed')
    expect(completion?.detail?.route).toBe('consent_link')

    const dossier = await desk.dossier(RAKESH)
    expect(dossier?.submission?.supplied).toContain('Address proof')
  })

  it('3.2 completing KYC fires the credentials recipe on its own — there is nothing to press', async () => {
    const desk = customerDesk(repositories)

    renderCustomers(repositories, `/customers/${RAKESH}?tab=kyc`)
    await screen.findByText('KYC part-filled')

    await reviewExtractions()
    await recordReceived('Passport photograph')
    await recordReceived('Address proof')

    // There is no credentials control anywhere on this screen, before or after.
    expect(screen.queryByRole('button', { name: /credential/i })).toBeNull()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Complete KYC' }))
    await user.click(await screen.findByRole('button', { name: 'Complete and issue credentials' }))

    // The recipe is on the same machine edge as the completion, so the event is
    // emitted by the transition rather than by a second call somebody could skip.
    const emitted = repositories.store.events().map((event) => event.name)
    expect(emitted).toContain('kyc.completed')
    expect(emitted).toContain('credentials.generated')
    expect(emitted).toContain('message.sent')

    // The message log records what went out, and to whom. No password anywhere.
    const dossier = await desk.dossier(RAKESH)
    const credential = dossier?.credentials.find((entry) => entry.customerId === RAKESH)
    expect(credential?.username).toBe('rakesh.patel')
    expect(credential?.channel).toBe('whatsapp')

    const message = dossier?.messages.find((entry) => entry.templateKey === 'credentials.issued')
    expect(message?.toName).toBe('Rakesh Patel')
    expect(message?.state).toBe('sent')
    expect(JSON.stringify(message)).not.toMatch(/password/i)

    // And the receipt says so on screen.
    expect(
      await screen.findByText(/username rakesh\.patel sent on whatsapp/i),
    ).toBeInTheDocument()
  })

  it('blocks the OCR review from saving while an extraction is unconfirmed (FR-16)', async () => {
    const user = userEvent.setup()
    renderCustomers(repositories, `/customers/${RAKESH}?tab=kyc`)

    const section = await panel('Extracted values — confirm each one')

    expect(
      await within(section).findByText(/extracted value needs confirming before this can be saved/i),
    ).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Save the confirmed values' })).toBeDisabled()

    await user.click(within(section).getByRole('button', { name: 'Confirm' }))
    expect(within(section).getByRole('button', { name: 'Save the confirmed values' })).toBeEnabled()
  })

  it('keeps the original read when a person types over an extraction, and blocks again', async () => {
    const user = userEvent.setup()
    renderCustomers(repositories, `/customers/${RAKESH}?tab=kyc`)

    const section = await panel('Extracted values — confirm each one')
    await within(section).findByRole('status')
    await user.click(within(section).getByRole('button', { name: 'Confirm' }))
    expect(within(section).getByRole('button', { name: 'Save the confirmed values' })).toBeEnabled()

    // Editing withdraws confirmation: a correction still wants a second look.
    await user.type(within(section).getByLabelText('PAN'), 'X')
    expect(within(section).getByRole('button', { name: 'Save the confirmed values' })).toBeDisabled()

    // And the extractor's own read is still on screen.
    expect(within(section).getByText('ABCPP1234K')).toBeInTheDocument()
  })

  it('the KYC queue holds only the files that still owe work', async () => {
    // The URL owns the view, search included, so this is the queue Rakesh is in.
    renderCustomers(repositories, '/back-office/kyc?q=Patel')

    expect(await screen.findByText('Rakesh Patel')).toBeInTheDocument()
    const table = screen.getByRole('grid', { name: 'KYC completion' })

    // Not one row on the page is a completed file. That is the queue's promise,
    // and it is a property of every row rather than of the one we looked for.
    expect(within(table).queryAllByText('KYC complete')).toHaveLength(0)
    expect(within(table).getAllByText(/KYC (not started|part-filled)/).length).toBeGreaterThan(0)
  })

  it('empties rather than widens when a URL asks the KYC queue for completed files', async () => {
    const desk = customerDesk(repositories)

    // An empty filter selection means "filter nothing" to the repository, so a
    // narrowing that intersects to nothing has to be answered, not passed on.
    const asked = await loadOutstanding(desk, { filters: { kycState: ['complete'] } })
    expect(asked.rows).toHaveLength(0)
    expect(asked.total).toBe(0)

    const jayesh = await repositories.customers.get('cus-jayesh-kapadia')
    expect(jayesh?.kycState).toBe('complete')

    const unfiltered = await loadOutstanding(desk, {})
    expect(unfiltered.rows.some((row) => row.id === 'cus-jayesh-kapadia')).toBe(false)
  })
})
