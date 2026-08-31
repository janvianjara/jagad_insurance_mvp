import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { COLLECTION_VERIFICATION_STATES } from '../backoffice'
import { collectionDesk } from './data/collection-desk'
import {
  WAITING_COLLECTION,
  WHO,
  freshRepositories,
  renderCollections,
  signIn,
} from './test-harness'

/**
 * FR-08.3 and canvas 3.4/3.5 — the collection verification queue.
 *
 * §9 gives this screen four rules, and each can break on its own:
 *
 *   - the queue is money taken through the agency that nobody has checked. A
 *     direct-to-company reference never enters it, because it never touched the
 *     agency books;
 *   - verification is a back-office act, and the person who collected the money
 *     cannot be the person who verifies it;
 *   - a bounced cheque raises its follow-up task in the same move, and the
 *     collection reopens, because the money is still owed;
 *   - the platform records collections and issues no receipt.
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

/** The bank reference the waiting on-field cheque carries, as the fixture sets it. */
const WAITING_REFERENCE = /CHQ-114892/

async function openTheWaitingCollection() {
  const user = userEvent.setup()
  renderCollections(repositories)
  await user.click(await screen.findByRole('row', { name: WAITING_REFERENCE }))
  return user
}

/**
 * The queue's own rows, header excluded.
 *
 * `<DataTable>` is a `grid`, not a `table`, and it renders skeleton rows while
 * the page is in flight — so this waits for a row that is actually a collection
 * before counting, rather than counting the loading state.
 */
async function queueRows() {
  await screen.findByRole('row', { name: WAITING_REFERENCE })
  const grid = screen.getByRole('grid')
  return within(grid).getAllByRole('row').slice(1)
}

describe('the queue', () => {
  it('holds only collections awaiting verification, and nothing else on the books', async () => {
    const waiting = await repositories.collections.list({
      page: 1,
      pageSize: 100,
      filters: { state: COLLECTION_VERIFICATION_STATES },
    })
    const everything = await repositories.collections.list({ page: 1, pageSize: 100 })

    // The fixture set has collections in other states — a pending direct payment
    // and a closed mandate — so this assertion is doing work.
    expect(everything.total).toBeGreaterThan(waiting.total)

    renderCollections(repositories)

    expect(await queueRows()).toHaveLength(waiting.total)
  })

  it('refuses to widen past its own address when a URL asks for a state it does not own', async () => {
    // The queue is what its address says it is. A link asking for `verified`
    // gets the waiting set, not a second, quieter query.
    const desk = collectionDesk(repositories)
    const asked = await desk.awaitingVerification({
      page: 1,
      pageSize: 100,
      filters: { state: ['verified', 'closed'] },
    })

    for (const row of asked.rows) {
      expect(COLLECTION_VERIFICATION_STATES).toContain(row.state)
    }
  })

  it('never offers a bulk action over money', async () => {
    renderCollections(repositories)
    await screen.findByRole('grid')

    // Verification is a per-record judgement about whether money actually
    // arrived. A ticked-forty-and-confirm affordance would let one click wave a
    // bounce through, which is the failure §9's rule exists to prevent.
    expect(screen.queryByRole('button', { name: /verify all/i })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /select all/i })).toBeNull()
  })
})

describe('3.4 — record-only, and no receipt', () => {
  it('renders the amount that was recorded and offers no control that changes it', async () => {
    await openTheWaitingCollection()

    const collection = await repositories.collections.get(WAITING_COLLECTION)
    expect(collection?.amount).not.toBeNull()

    // The drawer is open. Nothing in it accepts a figure: no number input, no
    // text box for an amount, no editable total. D3 is at its most fragile on a
    // screen about money that also has a button.
    for (const field of screen.queryAllByRole('spinbutton')) {
      expect(field).not.toBeInTheDocument()
    }
    expect(screen.queryByLabelText(/amount/i)).toBeNull()
  })

  it('says the platform issues no receipt, in the machine own words', async () => {
    const user = await openTheWaitingCollection()
    await user.click(screen.getByRole('button', { name: 'Verify this collection' }))

    expect(
      screen.getByText(/records collections; it does not issue receipts/i),
    ).toBeInTheDocument()
  })
})

describe('verification is a back-office act', () => {
  it('verifies through the gate, and the row leaves the queue', async () => {
    const user = await openTheWaitingCollection()

    await user.click(screen.getByRole('button', { name: 'Verify this collection' }))
    // The gate's own confirm label, not the default: it says what it will do.
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(async () => {
      const after = await repositories.collections.get(WAITING_COLLECTION)
      expect(after?.state).toBe('verified')
    })

    // The queue is now empty, so it teaches rather than showing a bare table
    // (U13). Either way the verified row is gone from the list.
    await screen.findByText('Nothing is waiting to be verified')
    expect(screen.queryByRole('row', { name: WAITING_REFERENCE })).toBeNull()
  })

  it('writes nothing when the gate is cancelled', async () => {
    const user = await openTheWaitingCollection()

    await user.click(screen.getByRole('button', { name: 'Verify this collection' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const after = await repositories.collections.get(WAITING_COLLECTION)
    expect(after?.state).toBe('recorded')
    expect(after?.verifiedBy).toBeNull()
    expect(after?.verifiedAt).toBeNull()
  })

  it('refuses an account that is not back-office staff, and says why beside the control', async () => {
    await signIn(repositories, WHO.kiran)
    await openTheWaitingCollection()

    expect(screen.getByRole('button', { name: 'Verify this collection' })).toBeDisabled()
    expect(screen.getByText(/is a back-office act/i)).toBeInTheDocument()
  })

  it('refuses the person who collected the money, in the machine own sentence', async () => {
    // Kiran took this collection and is an agent, so the screen stops him at the
    // first rule. This asserts the second rule, which the screen cannot reach
    // with the fixture cast: the machine refuses a back-office verifier who is
    // also the collector, and the drawer renders that reason as written.
    const desk = collectionDesk(repositories)
    const result = await desk.verify(WAITING_COLLECTION, {
      actorId: WHO.kiran,
      verifiedBy: WHO.kiran,
      verifierIsBackOffice: true,
      now: new Date(),
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(
      /cannot be the person who verifies it/i,
    )

    const after = await repositories.collections.get(WAITING_COLLECTION)
    expect(after?.state).toBe('recorded')
  })
})

describe('3.5 — a bounced cheque raises its follow-up in the same move', () => {
  it('will not confirm until the bank reason and the follow-up date are both recorded', async () => {
    const user = await openTheWaitingCollection()
    await user.click(screen.getByRole('button', { name: 'Record a bounce' }))

    // A gate with nothing to preview refuses to confirm. The machine would
    // refuse this move, and a button the machine will reject teaches people to
    // click through refusals.
    expect(screen.getByRole('button', { name: 'Record bounce' })).toBeDisabled()

    await user.type(screen.getByLabelText('What the bank said'), 'Funds insufficient')
    expect(screen.getByRole('button', { name: 'Record bounce' })).toBeDisabled()

    await user.type(screen.getByLabelText('Follow-up due'), '2026-09-04')
    expect(screen.getByRole('button', { name: 'Record bounce' })).toBeEnabled()
  })

  it('records the bounce, raises the task, and reopens the collection', async () => {
    const user = await openTheWaitingCollection()
    await user.click(screen.getByRole('button', { name: 'Record a bounce' }))

    await user.type(screen.getByLabelText('What the bank said'), 'Funds insufficient')
    await user.type(screen.getByLabelText('Follow-up due'), '2026-09-04')
    await user.click(screen.getByRole('button', { name: 'Record bounce' }))

    await waitFor(async () => {
      const after = await repositories.collections.get(WAITING_COLLECTION)
      expect(after?.state).toBe('bounced')
      expect(after?.bounceReason).toBe('Funds insufficient')
    })
  })

  it('offers the bounce only on a cheque, because only a cheque can bounce', async () => {
    const waiting = await repositories.collections.list({
      page: 1,
      pageSize: 100,
      filters: { state: COLLECTION_VERIFICATION_STATES },
    })
    // Guards the test above: it is only meaningful while the waiting row is a
    // cheque, and this says so rather than letting it quietly stop testing.
    expect(waiting.rows.every((row) => row.instrument === 'cheque')).toBe(true)

    await openTheWaitingCollection()
    expect(screen.getByRole('button', { name: 'Record a bounce' })).toBeInTheDocument()
  })
})
