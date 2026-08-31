import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { uploadDesk } from '../upload'
import UploadTokenScreen from '../upload/UploadTokenScreen'
import { WHO, freshRepositories, renderClaims, signIn } from './test-harness'

/**
 * Canvas flow 4 — "Claim File Lifecycle" — one test per row, plus the three §9
 * bullets the canvas states as prose.
 *
 * These render the real screens against the real mock repositories, so a
 * scenario passing here means the walkthrough works rather than that a helper
 * returned the right object.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.amit)
})

/** A `<Panel>` is a section titled by its heading; this is how a test scopes to one. */
function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

/** The status pill lives in the page header; the pipeline strip repeats the words. */
async function expectStatus(label: string) {
  const header = screen.getByRole('banner')
  expect(await within(header).findByText(label)).toBeInTheDocument()
}

async function arm(actionLabel: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: actionLabel }))
}

async function confirmAction(actionLabel: string, confirmLabel: string) {
  const user = userEvent.setup()
  await arm(actionLabel)
  await user.click(await screen.findByRole('button', { name: confirmLabel }))
}

/**
 * The customer's half of row 4.5, rendered as the customer meets it: the real
 * `/upload/:token` page, with no session hydrated, against the same
 * repositories the claims desk is reading.
 */
function renderUploadPage(token: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <MemoryRouter initialEntries={[`/upload/${token}`]}>
        <Routes>
          <Route path="/upload/:token" element={<UploadTokenScreen />} />
        </Routes>
      </MemoryRouter>
    </RepositoriesProvider>,
  )
}

describe('canvas 4 — the claim file lifecycle', () => {
  it('4.1 a claim is intimated on an active policy, which draws a claim number and emails the insurer with the agent copied', async () => {
    const user = userEvent.setup()
    renderClaims(repositories, '/claims/new')

    const policy = await screen.findByLabelText(/Policy/)
    await user.selectOptions(policy, 'pol-4425')

    expect(await screen.findByText('This policy is in force')).toBeInTheDocument()

    await confirmAction('Intimate to the insurer', 'Intimate and notify')

    // The platform's own number, drawn from the claim series the fixtures seeded.
    expect(await screen.findByText('CLM-0420')).toBeInTheDocument()
    await expectStatus('Intimated')

    const record = panel('The record')
    expect(within(record).getByText('POL-4425')).toBeInTheDocument()
    expect(
      within(record).getByText('Kiran Solanki — informed, not the owner'),
    ).toBeInTheDocument()
  })

  it('4.2 a claim raised on a lapsed policy is blocked with the reason written out, and the sourcing agent is notified', async () => {
    // CLM-0414 sits in `raised` against POL-4377, which lapsed in June 2025.
    renderClaims(repositories, '/claims/clm-0414')

    expect(await screen.findByText('CLM-0414')).toBeInTheDocument()

    // The machine's own sentence, under the control it refused.
    expect(
      await screen.findByText('This policy is lapsed, so a claim cannot be intimated against it.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Intimate to the insurer' })).toBeDisabled()

    await confirmAction('Block — the policy is not in force', 'Block and notify the agent')

    await expectStatus('Blocked')
    expect(
      screen.getByText(/Kiran Solanki was notified to handle it with the customer\./),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Blocked — the policy was not in force when this claim was raised/),
    ).toBeInTheDocument()
  })

  it('4.3 the claims team picks the claim up, and the sales agent is informed rather than made the owner', async () => {
    renderClaims(repositories, '/claims/clm-0411')

    expect(await screen.findByText('CLM-0411')).toBeInTheDocument()
    await arm('Pick up')

    // The preview says who gets what before anything is written.
    expect(await screen.findByText('The claims team')).toBeInTheDocument()
    expect(screen.getByText('Kiran Solanki informed, not made the owner')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Pick up and inform the agent' }))

    await expectStatus('Picked up')
  })

  it('4.4 the cashless and file forks never offer each other: a file claim gets the checklist, a cashless one gets the upload link', async () => {
    // CLM-0416 is a reimbursement file claim sitting in picked_up.
    const file = renderClaims(repositories, '/claims/clm-0416')
    expect(await screen.findByText('CLM-0416')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raise the document checklist' })).toBeEnabled()
    // The other arm of the fork is drawn, disabled, with the machine's own reason
    // under it — a control that vanishes teaches nobody why it was never there.
    expect(screen.getByRole('button', { name: 'Send the tokenised upload link' })).toBeDisabled()
    expect(
      screen.getByText(
        'This is a reimbursement file claim, so it goes to the document checklist, not the cashless upload link.',
      ),
    ).toBeInTheDocument()
    file.unmount()

    // CLM-0412 is the cashless one, and its link has already gone out — so its
    // pipeline shows the cashless steps and not the checklist ones.
    renderClaims(repositories, '/claims/clm-0412')
    expect(await screen.findByText('CLM-0412')).toBeInTheDocument()
    const pipeline = screen.getByRole('list', { name: 'Claim pipeline' })
    expect(within(pipeline).getByText('Upload link sent')).toBeInTheDocument()
    expect(within(pipeline).queryByText('Checklist raised')).not.toBeInTheDocument()
  })

  it('4.5 the customer uploads the discharge summary through the link, and it lands on the claim', async () => {
    const user = userEvent.setup()
    const token = 'z'.repeat(32)
    await uploadDesk(repositories).issue({
      actorId: WHO.amit,
      claimId: 'clm-0412',
      token,
      now: new Date(),
    })

    // Before the customer sends anything, the desk cannot say it arrived. The
    // state is read off the file, so there is nothing here to assert into being.
    renderClaims(repositories, '/claims/clm-0412')
    expect(await screen.findByText('CLM-0412')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record the discharge summary' })).toBeDisabled()
    cleanup()

    // The customer's half: the tokenised page, no session, one tap.
    renderUploadPage(token)
    const picker = await screen.findByLabelText(/Discharge summary/i)
    await user.upload(picker, new File(['not read'], 'discharge.pdf', { type: 'application/pdf' }))
    await user.click(await screen.findByRole('button', { name: 'Yes, send it' }))
    expect(await screen.findByText('discharge.pdf')).toBeInTheDocument()
    cleanup()

    // And it has landed on the claim, which the desk can now record. The wait is
    // for the upload ledger read, not for the click: the control is drawn
    // disabled until the file it depends on has been looked at.
    renderClaims(repositories, '/claims/clm-0412')
    expect(await screen.findByText('CLM-0412')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Record the discharge summary' })).toBeEnabled(),
    )
    await confirmAction('Record the discharge summary', 'Record it')

    await expectStatus('Summary received')
  })

  it('4.6 documents collected is refused until the checklist is complete, and names what is missing', async () => {
    // CLM-0402 has the checklist raised and only the claim form on file.
    renderClaims(repositories, '/claims/clm-0402')

    expect(await screen.findByText('CLM-0402')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark documents collected' })).toBeDisabled()
    expect(screen.getByText(/^Still waiting on: /)).toBeInTheDocument()

    const user = userEvent.setup()
    let received = screen.queryAllByRole('button', { name: 'Record received' })
    while (received.length > 0) {
      await user.click(received[0])
      received = screen.queryAllByRole('button', { name: 'Record received' })
    }

    await confirmAction('Mark documents collected', 'Mark collected')
    await expectStatus('Documents collected')
  })

  it('4.7 the insurer query loop can run more than once, and is visible while it is open', async () => {
    renderClaims(repositories, '/claims/clm-0417')

    expect(await screen.findByText('CLM-0417')).toBeInTheDocument()
    expect(screen.getByText(/The loop back to filed can run as many times as the company asks/))
      .toBeInTheDocument()

    await confirmAction('Answer the query and re-file', 'Send the explanation')
    await expectStatus('Filed with insurer')

    // And straight back round: the loop is not a one-shot.
    await confirmAction('Record an insurer query', 'Open the query')
    await expectStatus('Query open')
  })

  it('4.8 close is refused on a settlement with no company remark, and allowed once the remark is written', async () => {
    // CLM-0418 has the settlement recorded and no remark against it.
    renderClaims(repositories, '/claims/clm-0418')

    expect(await screen.findByText('CLM-0418')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close the claim' })).toBeDisabled()
    expect(
      screen.getByText(
        'Add the company remark before closing. It is what the insurer rating is built from, so an unremarked close costs the agency the data.',
      ),
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText(/How did the company handle this claim/),
      'Settled inside three weeks with one query.',
    )

    await confirmAction('Close the claim', 'Close')
    await expectStatus('Closed')
  })
})
