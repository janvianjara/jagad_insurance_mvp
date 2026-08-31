import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { claimDesk } from './data/claim-desk'
import { AGENTS, WHO, freshRepositories, renderClaims, signIn } from './test-harness'

/**
 * The §9 claim bullets, one named test each.
 *
 * The canvas rows live in `claim-scenarios.test.tsx`. These are the three
 * sentences §9 states as prose — settlement is typed and never derived, close
 * needs both a settlement and a company remark, and every status change fires a
 * customer message unless the agent's direct-updates toggle is off — plus the
 * queue's URL contract.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.amit)
})

function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

async function confirmAction(actionLabel: string, confirmLabel: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: actionLabel }))
  await user.click(await screen.findByRole('button', { name: confirmLabel }))
}

describe('§9 — the settlement is typed from the insurer advice, never derived', () => {
  it('offers no figure of its own, refuses until one is typed, and records exactly what was typed', async () => {
    const user = userEvent.setup()
    renderClaims(repositories, '/claims/clm-0417')

    // Out of the query loop and back with the insurer, where a settlement can land.
    await confirmAction('Answer the query and re-file', 'Send the explanation')

    // The control starts empty. Unrecorded is not zero, and there is no suggestion.
    const amount = await screen.findByLabelText(/Settled amount/)
    expect(amount).toHaveValue('')

    expect(
      screen.getByRole('button', { name: 'Record the settlement from the insurer advice' }),
    ).toBeDisabled()
    expect(
      screen.getByText(
        'Type the settled amount from the insurer advice before recording the settlement.',
      ),
    ).toBeInTheDocument()

    await user.type(amount, '48250')
    await user.type(screen.getByLabelText(/Deduction/), '3100')

    // The provenance is asked for as well as the figure.
    expect(
      screen.getByText('Record the insurer advice reference the settled figure was taken from.'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Insurer advice reference/), 'ADV-417-B')

    await confirmAction('Record the settlement from the insurer advice', 'Record the settlement')

    const settled = panel('Settled')
    expect(within(settled).getByText('₹48,250.00')).toBeInTheDocument()
    expect(within(settled).getByText('₹3,100.00')).toBeInTheDocument()
    expect(within(settled).getByText('ADV-417-B')).toBeInTheDocument()
    expect(within(settled).getByText('Insurer advice')).toBeInTheDocument()
  })

  it('refuses a figure whose provenance says it was derived, at the repository boundary', async () => {
    const desk = claimDesk(repositories)
    const claim = await desk.get('clm-0417')
    if (!claim) throw new Error('CLM-0417 is missing from the fixtures.')

    const refiled = await desk.advance('clm-0417', 'filed_with_insurer', { actorId: WHO.amit })
    expect(refiled.ok).toBe(true)

    const outcome = await desk.advance('clm-0417', 'settlement_recorded', {
      actorId: WHO.amit,
      settlement: {
        amount: { paise: 4_825_000, currency: 'INR' } as never,
        deduction: null,
        source: 'derived',
        insurerAdviceRef: 'ADV-417-B',
      },
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe(
      'The settled amount is marked as derived. Settlement and deduction are typed from the insurer advice, never worked out from the claimed figure.',
    )

    // A refusal writes nothing: the claim is exactly where it was.
    const after = await desk.get('clm-0417')
    expect(after?.state).toBe('filed_with_insurer')
  })
})

describe('§9 — close requires both a settlement record and a company remark', () => {
  it('names which of the two is missing rather than saying the action failed', async () => {
    renderClaims(repositories, '/claims/clm-0418')

    expect(await screen.findByText('CLM-0418')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close the claim' })).toBeDisabled()

    // The settlement is on the record; the remark is not, and the sentence says so.
    expect(
      screen.getByText(
        'Add the company remark before closing. It is what the insurer rating is built from, so an unremarked close costs the agency the data.',
      ),
    ).toBeInTheDocument()
  })

  it('carries the remark onto the record, where the insurer rating is built from it', async () => {
    const user = userEvent.setup()
    renderClaims(repositories, '/claims/clm-0418')

    await user.type(
      await screen.findByLabelText(/How did the company handle this claim/),
      'Paid in eighteen days, one query, courteous claim manager.',
    )
    await confirmAction('Close the claim', 'Close')

    const remark = panel('Company remark')
    expect(
      within(remark).getByText('Paid in eighteen days, one query, courteous claim manager.'),
    ).toBeInTheDocument()
  })
})

describe('FR-11 — every status change fires a customer message', () => {
  it('sends to the customer when the sourcing agent has direct updates on, and records that it did', async () => {
    renderClaims(repositories, '/claims/clm-0411')

    expect(await screen.findByText('CLM-0411')).toBeInTheDocument()
    const updates = panel('Customer updates')
    expect(within(updates).getByText(/is messaged with the claim number/)).toBeInTheDocument()

    await confirmAction('Pick up', 'Pick up and inform the agent')

    const log = within(panel('Customer updates')).getByRole('list', { name: 'Status messages' })
    expect(within(log).getByText('Sent to customer')).toBeInTheDocument()
    expect(within(log).queryByText('Reroute logged')).not.toBeInTheDocument()
  })

  it('reroutes to the agent and logs the reroute when the direct-updates toggle is off', async () => {
    const desk = claimDesk(repositories)
    // Meera Joshi is the sub-agent whose direct-updates toggle is OFF (canvas 6.4).
    const created = await desk.intimate({
      actorId: WHO.amit,
      policyId: 'pol-4425',
      customerId: 'cus-rakesh-patel',
      agentId: AGENTS.meera,
      claimType: 'file',
      policyActive: true,
      policyStatus: 'issued',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    renderClaims(repositories, `/claims/${created.record.id}`)

    await screen.findByRole('heading', { name: 'Customer updates' })
    const updates = panel('Customer updates')
    expect(
      await within(updates).findByText(
        /Direct updates are off for Meera Joshi, so this status message routes to them/,
      ),
    ).toBeInTheDocument()

    await confirmAction('Pick up', 'Pick up and inform the agent')

    const log = within(panel('Customer updates')).getByRole('list', { name: 'Status messages' })
    expect(within(log).getByText('Rerouted to agent')).toBeInTheDocument()
    expect(within(log).getByText('Reroute logged')).toBeInTheDocument()
  })
})

describe('the claim queue', () => {
  it('is reconstructible from its URL and states its own plural', async () => {
    renderClaims(repositories, '/claims?state=query_open')

    // The filter came off the address bar, not off a control this screen holds.
    expect(await screen.findByText('CLM-0417')).toBeInTheDocument()
    expect(screen.queryByText('CLM-0411')).not.toBeInTheDocument()
    expect(screen.getByText('1 claim')).toBeInTheDocument()
  })

  it('pins the blocked and unowned claims above the rest', async () => {
    const desk = claimDesk(repositories)
    const blocked = await desk.advance('clm-0414', 'blocked', {
      actorId: WHO.amit,
      agentNotified: true,
    })
    expect(blocked.ok).toBe(true)

    renderClaims(repositories, '/claims')

    await screen.findByText('CLM-0414')
    const table = screen.getByRole('grid', { name: 'Claims' })
    const firstRow = within(table).getAllByRole('row')[1]
    expect(within(firstRow).getByText('CLM-0414')).toBeInTheDocument()
    expect(within(firstRow).getByText('Pinned')).toBeInTheDocument()
  })
})

describe('permissions', () => {
  it('lets a role without the claims grant read a claim without offering a move', async () => {
    await signIn(repositories, WHO.sneha)
    renderClaims(repositories, '/claims/clm-0411')

    expect(await screen.findByText('CLM-0411')).toBeInTheDocument()
    expect(
      screen.getByText('Your role can read this claim but not move it on. The claims desk owns the file.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick up' })).toBeDisabled()
  })
})
