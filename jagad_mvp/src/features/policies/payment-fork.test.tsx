import { useEffect, useState } from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import type { CollectionRecord } from '../../data/repo'
import { canIssueReceipt } from '../../domain/workflows'
import { PaymentFork } from './PaymentFork'
import { policyDesk } from './data/policy-desk'
import type { PolicyDesk } from './data/policy-desk'
import { CAST, WALKTHROUGH_NOW, WHO, freshRepositories, renderInApp, signIn } from './test-harness'

/**
 * Canvas flow 3 — "KYC -> Login -> Payment -> Issue" — rows 3.3, 3.4 and 3.5.
 *
 *   3.3  Customer pays company direct -> Reference recorded        -> No money on agency books
 *   3.4  Customer pays agency         -> Collection entry any mode -> Record-only, no slip; cheque watched
 *   3.5  Recorded cheque bounces      -> Marked bounced            -> Follow-up task auto-created
 *
 * These are the step's acceptance criteria written the way the canvas writes
 * them, and they are run against the real mock repositories through the real
 * screen. Nothing here reaches for a fixture: the rows arrive through
 * `desk.dossier`, the writes go through `desk`, and every assertion about what
 * happened is made against the store's own event log or against the record the
 * repository gives back.
 *
 * `col-0002` is the row 3.3 and 3.4 both start from — a pending collection
 * against Hitesh Mehta's policy. The route is a command parameter rather than a
 * property of the row, which is precisely why the same pending row can be
 * recorded either way in two independent tests: the fork is a decision a person
 * makes at the moment of recording, not a fact the row already carried.
 */

const RECEIPT_VERDICT = canIssueReceipt()
const NO_RECEIPT = RECEIPT_VERDICT.ok ? '' : RECEIPT_VERDICT.reason

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

/**
 * The dossier around the fork, which is the job the policy detail screen will do
 * once it exists: hold the rows, hand them down, and re-read after a write
 * rather than patching a copy of the record in place.
 */
function ForkHost({ desk, policyId }: { desk: PolicyDesk; policyId: string }) {
  const [rows, setRows] = useState<readonly CollectionRecord[] | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let live = true
    void desk.dossier(policyId).then((dossier) => {
      if (live && dossier) setRows(dossier.collections)
    })
    return () => {
      live = false
    }
  }, [desk, policyId, revision])

  if (rows === null) return null

  return (
    <PaymentFork
      policyId={policyId}
      collections={rows}
      desk={desk}
      now={WALKTHROUGH_NOW}
      onRecorded={() => setRevision((value) => value + 1)}
    />
  )
}

async function openFork(policyId: string): Promise<PolicyDesk> {
  const desk = policyDesk(repositories)
  renderInApp(repositories, <ForkHost desk={desk} policyId={policyId} />)
  await screen.findByRole('heading', { name: 'Payment and collection' })
  return desk
}

/** The card for one collection, re-queried after every write. */
function row(collectionId: string): HTMLElement {
  const node = document.querySelector(`[data-collection="${collectionId}"]`)
  if (!node) throw new Error(`No collection row is rendered for ${collectionId}.`)
  return node as HTMLElement
}

function eventNames(from: number): readonly string[] {
  return repositories.store.events().slice(from).map((event) => event.name)
}

describe('canvas 3 — the payment fork', () => {
  it('3.3 a payment made straight to the company is recorded as a reference and never touches the agency books', async () => {
    await openFork(CAST.kycPendingSent)
    const user = userEvent.setup()
    const before = repositories.store.events().length

    expect(within(row(CAST.pendingCollection)).getByText('Awaiting the payment')).toBeInTheDocument()

    await user.click(
      within(row(CAST.pendingCollection)).getByRole('radio', { name: /Straight to the company/ }),
    )

    // The screen offers nothing it is about to refuse, and the sentence it shows
    // instead is the guard's own.
    expect(within(row(CAST.pendingCollection)).getByRole('alert')).toHaveTextContent(
      'Record the insurer or bank reference for the direct payment.',
    )

    await user.type(
      within(row(CAST.pendingCollection)).getByLabelText('Insurer or bank reference'),
      'NEFT-889201',
    )
    expect(within(row(CAST.pendingCollection)).getByRole('alert')).toHaveTextContent(
      'Type the amount collected. The platform records what was paid; it never fills the figure in.',
    )

    await user.type(within(row(CAST.pendingCollection)).getByLabelText('Amount paid'), '18400')

    const gate = within(row(CAST.pendingCollection)).getByRole('region', {
      name: 'Record the payment reference',
    })
    expect(within(gate).getByText('Untouched. Nothing is posted.')).toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Record it' }))

    await waitFor(() => {
      expect(row(CAST.pendingCollection).dataset.state).toBe('reference_recorded')
    })

    const record = await repositories.collections.get(CAST.pendingCollection)
    expect(record?.state).toBe('reference_recorded')
    expect(record?.route).toBe('direct_to_company')
    expect(record?.reference).toBe('NEFT-889201')
    expect(record?.amount).toEqual({ paise: 1_840_000, currency: 'INR' })

    // No money on the agency books: the record never acquires an agency, and the
    // event that would have put it on them was never emitted.
    expect(record?.agencyId).toBeNull()
    expect(eventNames(before)).toContain('payment.reference_recorded')
    expect(eventNames(before)).not.toContain('collection.recorded')

    expect(within(row(CAST.pendingCollection)).getByText('Reference recorded')).toBeInTheDocument()
  })

  it('3.4 a collection taken by the agency is recorded in any mode, issues no receipt, and a cheque goes on bounce watch', async () => {
    await openFork(CAST.kycPendingSent)
    const user = userEvent.setup()
    const before = repositories.store.events().length

    // The platform's refusal to produce a slip is stated on the screen, in the
    // workflow's own words, before anything is recorded.
    expect(screen.getByText(NO_RECEIPT)).toBeInTheDocument()

    await user.click(
      within(row(CAST.pendingCollection)).getByRole('radio', { name: /Through the agency/ }),
    )
    await user.selectOptions(
      within(row(CAST.pendingCollection)).getByLabelText('Instrument'),
      'cheque',
    )
    await user.selectOptions(
      within(row(CAST.pendingCollection)).getByLabelText('Where it was taken'),
      'on_field',
    )

    expect(
      row(CAST.pendingCollection).querySelector('[data-bounce-watch]'),
    ).toHaveTextContent('stays on bounce watch until the bank has honoured it')

    expect(within(row(CAST.pendingCollection)).getByRole('alert')).toHaveTextContent(
      'Type the amount collected. The platform records what was paid; it never fills the figure in.',
    )
    await user.type(within(row(CAST.pendingCollection)).getByLabelText('Amount paid'), '24999.50')

    const gate = within(row(CAST.pendingCollection)).getByRole('region', {
      name: 'Record this collection',
    })
    expect(within(gate).getByText('On, until the bank has honoured the cheque.')).toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Record it' }))

    await waitFor(() => {
      expect(row(CAST.pendingCollection).dataset.state).toBe('recorded')
    })

    const record = await repositories.collections.get(CAST.pendingCollection)
    expect(record?.state).toBe('recorded')
    expect(record?.route).toBe('via_agency')
    expect(record?.instrument).toBe('cheque')
    expect(record?.mode).toBe('on_field')
    expect(record?.amount).toEqual({ paise: 2_499_950, currency: 'INR' })

    expect(eventNames(before)).toContain('collection.recorded')
    expect(eventNames(before)).not.toContain('payment.reference_recorded')

    // Record-only: the platform still issues nothing, and the cheque is now the
    // row somebody has to come back to.
    expect(screen.getByText(NO_RECEIPT)).toBeInTheDocument()
    expect(within(row(CAST.pendingCollection)).getByText('On bounce watch')).toBeInTheDocument()
    expect(
      within(row(CAST.pendingCollection)).getByRole('button', { name: 'Mark bounced' }),
    ).toBeInTheDocument()
  })

  it('3.5 a bounced cheque raises the follow-up task on the same move, and the collection reopens', async () => {
    const desk = await openFork(CAST.issued)
    const user = userEvent.setup()
    const before = repositories.store.events().length

    expect(within(row(CAST.chequeCollection)).getByText('On bounce watch')).toBeInTheDocument()
    await user.click(within(row(CAST.chequeCollection)).getByRole('button', { name: 'Mark bounced' }))

    expect(within(row(CAST.chequeCollection)).getByRole('alert')).toHaveTextContent(
      'Record the bank reason for the bounce.',
    )
    await user.type(
      within(row(CAST.chequeCollection)).getByLabelText('What the bank said'),
      'Funds insufficient',
    )

    // Reason alone is not enough: without a date there is no task to raise, and
    // the guard says why in the sentence §9 wrote for it.
    expect(within(row(CAST.chequeCollection)).getByRole('alert')).toHaveTextContent(
      'A bounced cheque raises a follow-up task as part of the same move. Without it the collection quietly stops being chased.',
    )

    fireEvent.change(within(row(CAST.chequeCollection)).getByLabelText('Follow-up due'), {
      target: { value: '2026-09-02' },
    })

    const gate = within(row(CAST.chequeCollection)).getByRole('region', {
      name: 'Mark this cheque bounced',
    })
    expect(within(gate).getByText('Raised, due 2026-09-02')).toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Record the bounce' }))

    await waitFor(() => {
      expect(row(CAST.chequeCollection).dataset.state).toBe('bounced')
    })

    const record = await repositories.collections.get(CAST.chequeCollection)
    expect(record?.state).toBe('bounced')
    expect(record?.bounceReason).toBe('Funds insufficient')

    /*
     * The bounce, and nothing it did not do. This edge used to also emit
     * `task.created` while writing no task, so this assertion passed against a
     * queue that stayed empty. The follow-up is now raised by the
     * `collection.bounceFollowUp` recipe through `TaskRepository.create`; this
     * screen test builds no automation runtime, so the proof that a real row
     * reaches the FR-15 queue lives in `src/data/automation/automation.test.ts`.
     * What the desk still owes this screen is the panel below.
     */
    expect(eventNames(before)).toContain('cheque.bounced')
    expect(eventNames(before)).not.toContain('task.created')

    const dossier = await desk.dossier(CAST.issued)
    expect(dossier?.followUps).toHaveLength(1)
    expect(dossier?.followUps[0]).toMatchObject({
      collectionId: CAST.chequeCollection,
      policyId: CAST.issued,
      dueOn: '2026-09-02',
      raisedBy: WHO.priya,
    })

    expect(row(CAST.chequeCollection).querySelector('[data-reopened]')).toHaveTextContent(
      'This collection has reopened. The money is still owed',
    )
  })
})
