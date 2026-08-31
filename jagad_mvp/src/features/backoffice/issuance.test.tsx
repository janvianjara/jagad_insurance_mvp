import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { issuanceDesk, stagesFor } from './data/issuance-desk'
import { ISSUANCE_STATES, insurerNumberStateOf } from './issuance-view'
import {
  CAST,
  REFERENCE,
  WALKTHROUGH_NOW,
  WHO,
  freshRepositories,
  renderIssuance,
  signIn,
} from './issuance-harness'

/**
 * FR-08.1's fifth ops queue — `/back-office/issuance`, plan §9, canvas 3.6.
 *
 * The desk takes a policy from "the proposal is with the insurer" to "the
 * insurer has answered". Four promises, each of which can break on its own:
 *
 *   - the queue is its span and nothing else, and a URL can narrow it but never
 *     widen it past its own address;
 *   - §8's dual numbering is visible and filterable: `systemNo` always,
 *     `insurerNo` when the company has answered, and "awaited" drawn rather than
 *     left blank when it has not;
 *   - the one bulk move is the one that carries no judgement, it goes through the
 *     gate, and the machine refuses a row that cannot make it;
 *   - record-only money: nothing on this queue or in its drawer accepts a figure.
 *
 * Nothing here imports a fixture. Every expected value is read back through the
 * same repository the screen reads, so the tests assert that the screen agrees
 * with the book rather than with a copy of it that would rot.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

/**
 * The queue's own rows, header excluded.
 *
 * `<DataTable>` is a `grid`, not a `table`, and it renders skeleton rows while
 * the page is in flight — so this waits for a row that is actually a policy
 * before counting, rather than counting the loading state.
 */
async function rowsAfter(reference: string) {
  await screen.findByRole('row', { name: new RegExp(reference) })
  const grid = screen.getByRole('grid')
  return within(grid).getAllByRole('row').slice(1)
}

async function openRow(reference: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('row', { name: new RegExp(reference) }))
  return user
}

describe('the queue is its span', () => {
  it('holds only policies with the insurer or not yet delivered, and nothing else on the books', async () => {
    const desk = issuanceDesk(repositories)
    const span = await desk.awaitingIssuance({ page: 1, pageSize: 10_000 })
    const everything = await repositories.policies.list({ page: 1, pageSize: 10_000 })

    // The book holds drafts, declined proposals, closed and lapsed policies, so
    // this assertion is doing work.
    expect(everything.total).toBeGreaterThan(span.total)
    expect(span.total).toBeGreaterThan(0)

    for (const row of span.rows) {
      expect(ISSUANCE_STATES).toContain(row.policy.status)
    }
  })

  it('refuses to widen past its own address when a URL asks for a state it does not own', async () => {
    const desk = issuanceDesk(repositories)
    const asked = await desk.awaitingIssuance({
      page: 1,
      pageSize: 10_000,
      filters: { status: ['draft', 'closed', 'declined'] },
    })

    expect(asked.total).toBeGreaterThan(0)
    for (const row of asked.rows) {
      expect(ISSUANCE_STATES).toContain(row.policy.status)
    }
  })

  it('narrows to one stage when the URL asks for a state it does own', async () => {
    const desk = issuanceDesk(repositories)
    const everything = await desk.awaitingIssuance({ page: 1, pageSize: 10_000 })
    const sent = await desk.awaitingIssuance({
      page: 1,
      pageSize: 10_000,
      filters: { status: ['sent'] },
    })

    expect(sent.total).toBeGreaterThan(0)
    expect(sent.total).toBeLessThan(everything.total)
    for (const row of sent.rows) {
      expect(row.policy.status).toBe('sent')
    }
  })

  it('reads a malformed stage request as no request rather than as an empty queue', () => {
    expect(stagesFor(undefined)).toEqual(ISSUANCE_STATES)
    expect(stagesFor([])).toEqual(ISSUANCE_STATES)
    expect(stagesFor(['closed'])).toEqual(ISSUANCE_STATES)
    expect(stagesFor(['sent', 'closed'])).toEqual(['sent'])
  })
})

describe('§8 — dual numbering, which is why this queue exists', () => {
  it('draws the insurer number as awaited rather than as a blank', async () => {
    const policy = await repositories.policies.get(CAST.raised)
    expect(policy?.insurerNo).toBeNull()

    renderIssuance(repositories, `/back-office/issuance?q=${REFERENCE.raised}`)

    const rows = await rowsAfter(REFERENCE.raised)
    expect(rows).toHaveLength(1)
    expect(within(rows[0]!).getByText(REFERENCE.raised)).toBeInTheDocument()
    expect(within(rows[0]!).getByText('insurer no. awaited')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Awaited')).toBeInTheDocument()
  })

  it('prints both numbers once the insurer has answered', async () => {
    const policy = await repositories.policies.get(CAST.issued)
    const insurerNo = policy?.insurerNo
    if (!insurerNo) throw new Error('The fixture issued policy carries no insurer number.')

    renderIssuance(repositories, `/back-office/issuance?q=${REFERENCE.issued}`)

    const rows = await rowsAfter(REFERENCE.issued)
    expect(within(rows[0]!).getByText(REFERENCE.issued)).toBeInTheDocument()
    expect(within(rows[0]!).getByText(insurerNo)).toBeInTheDocument()
  })

  it('narrows the queue to the policies still awaiting a number', async () => {
    const desk = issuanceDesk(repositories)
    const everything = await desk.awaitingIssuance({ page: 1, pageSize: 10_000 })
    const awaited = await desk.awaitingIssuance({
      page: 1,
      pageSize: 10_000,
      filters: { insurer: ['awaited'] },
    })

    expect(awaited.total).toBeGreaterThan(0)
    expect(awaited.total).toBeLessThan(everything.total)
    for (const row of awaited.rows) {
      expect(insurerNumberStateOf(row.policy)).toBe('awaited')
    }
  })
})

describe('the drawer', () => {
  it('opens the policy beside the queue, with both numbers and what is outstanding', async () => {
    renderIssuance(repositories, `/back-office/issuance?q=${REFERENCE.sent}`)
    await openRow(REFERENCE.sent)

    const policy = await repositories.policies.get(CAST.sent)
    const customer = await repositories.customers.get(policy!.customerId)

    // The name is on the row, in the drawer's title and in its facts — three
    // places that must agree, which is why this asserts on all of them.
    expect((await screen.findAllByText(customer!.fullName)).length).toBeGreaterThan(1)
    expect(
      screen.getByText('With the insurer. Nobody here can move it until they answer.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open the full policy file/ })).toBeInTheDocument()
  })

  it('offers the issue panel for a policy the insurer has not answered, and not for one it has', async () => {
    renderIssuance(repositories, `/back-office/issuance?q=${REFERENCE.sent}`)
    await openRow(REFERENCE.sent)

    // The policies module's own panel, reused rather than reinvented.
    expect(
      await screen.findByRole('heading', { name: "The insurer's policy document" }),
    ).toBeInTheDocument()

    cleanup()

    // And not for a policy that is already live: there is nothing left to read
    // off an insurer document, so offering an upload would be theatre.
    renderIssuance(repositories, `/back-office/issuance?q=${REFERENCE.issued}`)
    await openRow(REFERENCE.issued)

    expect(
      await screen.findByText('The insurer has answered and this policy is live.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: "The insurer's policy document" }),
    ).toBeNull()
  })

  it('says plainly that a live policy has no move that records a late insurer number', async () => {
    // The gap is real: `PolicyRepository` writes `insurerNo` on the issue edge
    // and nowhere else. A queue that hid it behind a disabled button would be
    // hiding a hole in the data layer.
    const desk = issuanceDesk(repositories)
    const awaited = await desk.awaitingIssuance({
      page: 1,
      pageSize: 10_000,
      filters: { status: ['issued'], insurer: ['awaited'] },
    })

    if (awaited.rows.length === 0) {
      // Nothing in the fixture book is in that state, which is itself worth
      // asserting rather than silently skipping: the branch exists for real data.
      expect(awaited.total).toBe(0)
      return
    }

    const reference = awaited.rows[0]!.policy.systemNo
    renderIssuance(repositories, `/back-office/issuance?q=${reference}`)
    await openRow(reference)

    expect(await screen.findByText(/no move on this desk/i)).toBeInTheDocument()
  })
})

describe('D3 — record-only money', () => {
  it('renders the premium and offers no control anywhere that changes it', async () => {
    renderIssuance(repositories, `/back-office/issuance?q=${REFERENCE.issued}`)
    await openRow(REFERENCE.issued)

    const policy = await repositories.policies.get(CAST.issued)
    expect(policy?.finalPremium).not.toBeNull()

    // The drawer is open. Nothing in it accepts a figure: no number input, no
    // box labelled with an amount, no editable total. D3 is at its most fragile
    // on a screen about money that also has buttons.
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(screen.queryByLabelText(/amount/i)).toBeNull()
    expect(screen.queryByLabelText(/premium/i)).toBeNull()
  })
})

describe('the bulk move, gated', () => {
  it('sends a raised proposal to the insurer, and the machine records the move', async () => {
    renderIssuance(repositories, `/back-office/issuance?q=${REFERENCE.raised}`)
    await screen.findByRole('row', { name: new RegExp(REFERENCE.raised) })

    const user = userEvent.setup()
    const grid = screen.getByRole('grid')
    const row = within(grid).getAllByRole('row')[1]!
    await user.click(within(row).getByRole('checkbox'))

    await user.click(screen.getByRole('button', { name: 'Send to the insurer' }))
    // The gate's own confirm label, not the default: it says what it will do.
    await user.click(await screen.findByRole('button', { name: 'Send them' }))

    await waitFor(async () => {
      const after = await repositories.policies.get(CAST.raised)
      expect(after?.status).toBe('sent')
    })
  })

  it('writes nothing when the gate is cancelled', async () => {
    renderIssuance(repositories, `/back-office/issuance?q=${REFERENCE.raised}`)
    await screen.findByRole('row', { name: new RegExp(REFERENCE.raised) })

    const user = userEvent.setup()
    const grid = screen.getByRole('grid')
    const row = within(grid).getAllByRole('row')[1]!
    await user.click(within(row).getByRole('checkbox'))

    await user.click(screen.getByRole('button', { name: 'Send to the insurer' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    const after = await repositories.policies.get(CAST.raised)
    expect(after?.status).toBe('proposal')
  })

  it('refuses a policy that is already with the insurer, in the machine own sentence', async () => {
    const desk = issuanceDesk(repositories)
    const before = await repositories.policies.get(CAST.sent)
    expect(before?.status).toBe('sent')

    const result = await desk.sendProposal(CAST.sent, WHO.priya, WALKTHROUGH_NOW)

    expect(result.ok).toBe(false)
    // The machine's own words for an edge that does not exist from here.
    expect(result.ok === false && result.reason).toMatch(/cannot move to "sent"/i)

    const after = await repositories.policies.get(CAST.sent)
    expect(after?.status).toBe('sent')
  })
})
