import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import type { Policy } from '../../data/repo'
import { IssuancePanel } from './IssuancePanel'
import { MOCK_POLICY_PAGES } from './ocr-extract'
import { policyDesk } from './data/policy-desk'
import type { PolicyDesk } from './data/policy-desk'
import { CAST, WALKTHROUGH_NOW, WHO, freshRepositories, renderInApp, signIn } from './test-harness'

/**
 * Canvas flow 3, row 3.6 — "Company issues policy · PDF uploaded · OCR fills;
 * staff confirm; both numbers stored; customer messaged" — and the two §9 gates
 * that stand in front of it.
 *
 * These are written as the canvas writes them: a situation, a trigger, and the
 * outcome the back office expects. They drive the real panel against the real
 * mock repositories, so a green run here means a person can walk the row.
 *
 * The three fixture policies were each chosen for the one thing it can prove:
 *
 *   POL-DRAFT-0219  Falguni Shah, KYC complete, proposal path. The full walk:
 *                   raise, send, issue.
 *   POL-DRAFT-0224  Hitesh Mehta, KYC pending, already sent. Only the KYC gate
 *                   can refuse it, so a refusal here is that gate and nothing else.
 *   POL-DRAFT-0230  Nilesh Bhatt, KYC complete, direct path. It skips proposal —
 *                   and until the premium is confirmed it also proves the second
 *                   gate, because its `finalPremium` starts null.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`The fixtures have no ${what}.`)
  return value
}

type Opened = {
  readonly desk: PolicyDesk
  readonly policy: Policy
}

/** Renders the panel for a fixture policy, wired to the same desk the tests read. */
async function openIssuance(policyId: string): Promise<Opened> {
  const desk = policyDesk(repositories)
  const policy = must(await repositories.policies.get(policyId), `policy ${policyId}`)
  const draft = await repositories.policies.draft(policyId)
  const customer = must(await repositories.customers.get(policy.customerId), 'customer')
  const product = await repositories.products.get(policy.productId)

  renderInApp(
    repositories,
    <IssuancePanel
      policy={policy}
      draft={draft}
      kycState={customer.kycState}
      product={product}
      desk={desk}
      now={WALKTHROUGH_NOW}
    />,
  )

  return { desk, policy }
}

async function panel(title: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

const REVIEW_PANEL = 'What the document says — confirm each value'

/** Drops the insurer's PDF on the panel, the way a person does. */
async function uploadPolicyPdf() {
  const user = userEvent.setup()
  await user.upload(
    screen.getByLabelText(/Policy document/),
    // Content nobody reads: the panel takes the name and the size and stops.
    new File(['policy schedule'], 'policy-schedule.pdf', { type: 'application/pdf' }),
  )
}

/** Confirms `count` of the extracted values, or all of them when count is absent. */
async function confirmExtractions(count?: number) {
  const user = userEvent.setup()
  const section = await panel(REVIEW_PANEL)
  // The fields register with the form one tick after the panel paints.
  await within(section).findByRole('status')
  const buttons = within(section).getAllByRole('button', { name: 'Confirm' })
  for (const button of buttons.slice(0, count ?? buttons.length)) {
    await user.click(button)
  }
}

async function recordConfirmations() {
  const user = userEvent.setup()
  const section = await panel(REVIEW_PANEL)
  await user.click(within(section).getByRole('button', { name: 'Record these confirmations' }))
}

/** Presses a move and confirms it in the gate that opens. */
async function confirmMove(move: string, gateLabel: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: move }))
  await user.click(await screen.findByRole('button', { name: gateLabel }))
}

function issuedEventsFor(policyId: string): readonly string[] {
  return repositories.store
    .events()
    .filter((event) => event.subject?.id === policyId)
    .map((event) => event.name)
}

describe('canvas 3.6 — the company issues the policy', () => {
  it('3.6 the uploaded policy document fills the fields, a person confirms them, and both numbers are stored on a live policy', async () => {
    const { desk } = await openIssuance(CAST.proposalDraft)
    const page = MOCK_POLICY_PAGES[CAST.proposalDraft]

    // --- the document -------------------------------------------------
    await uploadPolicyPdf()
    expect(await screen.findByText('policy-schedule.pdf')).toBeInTheDocument()

    const attachment = must((await desk.dossier(CAST.proposalDraft))?.files[0], 'attached file')
    expect(attachment.fileName).toBe('policy-schedule.pdf')
    // Name and size are the whole record. There is nowhere for the text to go.
    expect(Object.keys(attachment)).not.toContain('content')

    // --- what it filled -----------------------------------------------
    const review = await panel(REVIEW_PANEL)
    expect(within(review).getByDisplayValue(page.insurerNo)).toBeInTheDocument()
    expect(within(review).getByDisplayValue(page.finalPremium)).toBeInTheDocument()
    expect(within(review).getByDisplayValue(page.startDate)).toBeInTheDocument()
    expect(within(review).getByDisplayValue(page.expiryDate)).toBeInTheDocument()

    // Nothing is on the record yet, and the screen says so in lime.
    expect(
      within(review).getByText('4 extracted values need confirming before this can be saved.'),
    ).toBeInTheDocument()

    // --- a person confirms --------------------------------------------
    await confirmExtractions()
    await recordConfirmations()

    const reviewed = must(await desk.dossier(CAST.proposalDraft), 'dossier').reviews
    expect(reviewed).toHaveLength(4)
    expect(reviewed.every((verdict) => verdict.confirmed)).toBe(true)
    // What the document said is kept beside what goes on the record.
    expect(reviewed.map((verdict) => verdict.extracted)).toContain(page.insurerNo)

    // --- the moves the machine allows, in order ------------------------
    await (await userEvent.setup()).click(
      await screen.findByRole('button', { name: 'Raise the proposal' }),
    )
    await confirmMove('Send the proposal to the insurer', 'Send it')
    await confirmMove('Issue this policy', 'Issue it')

    // Scoped to the panel: the toast says the same thing, and the panel is
    // where the record's own account of itself lives.
    const moves = await panel('Next move')
    expect(await within(moves).findByText('Policy live')).toBeInTheDocument()

    // --- both numbers, and the record --------------------------------
    const issued = must(await repositories.policies.get(CAST.proposalDraft), 'policy')
    expect(issued.status).toBe('issued')
    expect(issued.systemNo).toBe('POL-DRAFT-0219')
    expect(issued.insurerNo).toBe(page.insurerNo)
    // 4820.00 as printed, recorded as integer paise. Parsed, never worked out.
    expect(issued.finalPremium?.paise).toBe(482000)
    expect(issued.startDate).toBe(page.startDate)

    expect(screen.getAllByText(page.insurerNo).length).toBeGreaterThan(0)
    expect(screen.getAllByText('POL-DRAFT-0219').length).toBeGreaterThan(0)

    // --- the machine said so, and the customer was told ----------------
    expect(issuedEventsFor(CAST.proposalDraft)).toContain('policy.issued')

    const after = must(await desk.dossier(CAST.proposalDraft), 'dossier')
    const message = must(
      after.messages.find((log) => log.templateKey === 'policy.issued'),
      'issued message',
    )
    expect(message.toName).toBe('Falguni Shah')
    expect(message.channel).toBe('whatsapp')

    // FR-19 is stubbed in M0, and the screen says that rather than pretending.
    expect(after.messages.some((log) => log.templateKey === 'policy.feedback')).toBe(false)
    expect(within(moves).getByText(/The feedback request is stubbed/)).toBeInTheDocument()
  })

  it('refuses to issue while KYC is incomplete, and says which file is holding it up', async () => {
    const { desk } = await openIssuance(CAST.kycPendingSent)

    await uploadPolicyPdf()
    await confirmExtractions()
    await recordConfirmations()

    // The premium is confirmed and the proposal is already sent, so KYC is the
    // only thing left that can refuse — and the panel says so before anybody
    // presses anything.
    const blocker = document.querySelector('[data-blocker="kyc"]')
    expect(blocker?.textContent).toContain("customer's KYC file")

    // The pre-flight warning does not disable the control: the machine at the
    // moment of the write is the authority, so the refusal has to come from it.
    await confirmMove('Issue this policy', 'Issue it')

    // The refusal beside the control is the machine's sentence, unedited. The
    // panel's own pre-flight warning above it says the same thing for the same
    // reason: they read the same fact, and neither of them is a second rule.
    const moves = await panel('Next move')
    expect(await within(moves).findByRole('alert')).toHaveTextContent(
      'KYC is pending. A policy cannot be issued until KYC is complete for the proposer and every member.',
    )

    const untouched = must(await repositories.policies.get(CAST.kycPendingSent), 'policy')
    expect(untouched.status).toBe('sent')
    expect(untouched.insurerNo).toBeNull()
    expect(untouched.finalPremium).toBeNull()

    expect(issuedEventsFor(CAST.kycPendingSent)).not.toContain('policy.issued')
    expect(must(await desk.dossier(CAST.kycPendingSent), 'dossier').messages).toHaveLength(0)
  })

  it('refuses to issue without a Final Premium, and asks for the insurer figure rather than working one out', async () => {
    await openIssuance(CAST.directDraft)

    // Nothing has been read and nothing was typed into the entry, so there is no
    // figure — and the panel will not manufacture one to get past the gate.
    const moves = await panel('Next move')
    expect(
      within(moves).getByText(
        'Final Premium is empty. Type the figure from the insurer before issuing — the platform records premiums, it does not calculate them.',
      ),
    ).toBeInTheDocument()

    const blocker = document.querySelector('[data-blocker="final_premium"]')
    expect(blocker?.textContent).toContain('read off the insurer document')

    const issue = await screen.findByRole('button', { name: 'Issue this policy' })
    expect(issue).toBeDisabled()

    // The premium block's derived roll-up sits on the entry screen and is a
    // cross-check, never a source: there is no control here that offers a figure.
    expect(screen.queryByRole('button', { name: /derive|work it out|use the total/i })).toBeNull()

    const untouched = must(await repositories.policies.get(CAST.directDraft), 'policy')
    expect(untouched.status).toBe('draft')
    expect(untouched.finalPremium).toBeNull()
    expect(issuedEventsFor(CAST.directDraft)).not.toContain('policy.issued')
  })

  it('cannot submit the review while any extracted value is unconfirmed', async () => {
    const { desk } = await openIssuance(CAST.directDraft)

    await uploadPolicyPdf()
    await confirmExtractions(2)

    const review = await panel(REVIEW_PANEL)
    expect(
      within(review).getByText('2 extracted values need confirming before this can be saved.'),
    ).toBeInTheDocument()
    expect(
      within(review).getByRole('button', { name: 'Record these confirmations' }),
    ).toBeDisabled()

    // The block has to hold however the submit arrives, not only through the
    // button: Enter in a text field or a stray `requestSubmit` would walk past a
    // disabled attribute.
    const form = review.querySelector('form')
    fireEvent.submit(must(form, 'review form'))

    expect(must(await desk.dossier(CAST.directDraft), 'dossier').reviews).toHaveLength(0)
    expect(document.querySelector('[data-blocker="unconfirmed_extraction"]')).not.toBeNull()

    // And with nothing recorded, the premium reading is not a premium.
    expect(must(await repositories.policies.get(CAST.directDraft), 'policy').finalPremium).toBeNull()
  })

  it('issues a directly-entered policy without a proposal, because the insurer has already issued it', async () => {
    const { desk } = await openIssuance(CAST.directDraft)
    const page = MOCK_POLICY_PAGES[CAST.directDraft]

    await uploadPolicyPdf()
    await confirmExtractions()
    await recordConfirmations()

    // §9: the direct path skips proposal. The panel offers what the machine
    // allows from `draft` on this path, which is issue and nothing else.
    expect(screen.queryByRole('button', { name: 'Raise the proposal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send the proposal to the insurer' })).toBeNull()

    await confirmMove('Issue this policy', 'Issue it')

    const issued = must(await repositories.policies.get(CAST.directDraft), 'policy')
    expect(issued.status).toBe('issued')
    expect(issued.insurerNo).toBe(page.insurerNo)
    expect(issued.finalPremium?.paise).toBe(2631000)

    const names = issuedEventsFor(CAST.directDraft)
    expect(names).toContain('policy.issued')
    expect(names).not.toContain('policy.proposal_created')
    expect(names).not.toContain('policy.proposal_sent')

    const message = must(
      must(await desk.dossier(CAST.directDraft), 'dossier').messages[0],
      'issued message',
    )
    expect(message.toName).toBe('Nilesh Bhatt')
  })
})
