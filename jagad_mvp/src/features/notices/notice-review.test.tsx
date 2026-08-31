import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { BATCH, ROW, WHO, freshRepositories, renderNotices, signIn } from './test-harness'

/**
 * Canvas 5.4 and 5.5, and the two invariants they sit on.
 *
 * §9 gives an unmatched row exactly two ways out — a manual link, recorded as
 * somebody's, or a rejection with a reason — and the review screen offers both
 * and nothing else. FR-16 then applies on top: the values on a row are the ones
 * the customer's letter will carry, so the link form cannot submit while any of
 * them is still an unconfirmed read. The confirmation travels on the link
 * command itself; there is no separate write that marks a value checked, and
 * nothing marks one because a person scrolled past it.
 */

let repositories: MockRepositories

const LINKED_POLICY = 'POL-4437'

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

async function openRow(rowId: string, title: RegExp) {
  renderNotices(repositories, `/renewals/notices/${BATCH}?record=${rowId}`)
  return (await screen.findByRole('dialog', { name: title })) as HTMLElement
}

describe('FR-16 — the link form cannot submit on an unconfirmed read', () => {
  it('says how many values are waiting and leaves the control dead', async () => {
    const drawer = await openRow(ROW.unmatched, /TA-HLT-0114552/)

    const submit = within(drawer).getByRole('button', { name: 'Confirm and link this row' })
    expect(submit).toBeDisabled()
    await waitFor(() =>
      expect(drawer).toHaveTextContent(/3 extracted values need confirming before this can be saved/),
    )
  })

  it('shows what the extractor read, flagged until a person says so', async () => {
    const drawer = await openRow(ROW.unmatched, /TA-HLT-0114552/)

    expect(within(drawer).getByLabelText('Policy number, as printed')).toHaveValue('TA-HLT-0114552')
    expect(within(drawer).getAllByText('Extracted, needs a person')).toHaveLength(3)
  })
})

describe('§9 — the manual link is the way out of unmatched', () => {
  it('links the row, records who made it, and carries the confirmations with it', async () => {
    const user = userEvent.setup()
    const drawer = await openRow(ROW.unmatched, /TA-HLT-0114552/)

    for (const confirm of within(drawer).getAllByRole('button', { name: 'Confirm' })) {
      await user.click(confirm)
    }

    const submit = within(drawer).getByRole('button', { name: 'Confirm and link this row' })
    expect(submit).toBeDisabled()

    await user.type(within(drawer).getByRole('combobox'), LINKED_POLICY)
    await user.click(await within(drawer).findByRole('option', { name: new RegExp(LINKED_POLICY) }))

    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    await waitFor(async () => {
      const row = await repositories.noticeBatches.row(ROW.unmatched)
      expect(row?.state).toBe('matched')
      expect(row?.matchedPolicyId).toBe('pol-4437')
      expect(row?.manuallyLinkedBy).toBe(WHO.vivek)
      // The confirmations arrived on the link command; nothing else set them.
      expect(row?.ocrFields.every((field) => field.confirmed)).toBe(true)
    })
  })

  it('lets the batch go out once the rows in the send are clean', async () => {
    const user = userEvent.setup()

    await repositories.noticeBatches.linkRow(ROW.unmatched, {
      actorId: WHO.vivek,
      matchedPolicyId: 'pol-4437',
      manuallyLinkedBy: WHO.vivek,
      confirmedFields: ['noticePolicyNo', 'noticeCustomerName', 'noticeExpiryDate'],
    })

    renderNotices(repositories, `/renewals/notices/${BATCH}?sel=${ROW.clean},${ROW.unmatched}`)

    await user.click(await screen.findByRole('button', { name: 'Send renewal notices' }))
    const dialog = await screen.findByRole('dialog', { name: /Send 2 renewal notices/ })

    const confirm = within(dialog).getByRole('button', { name: 'Send the notices' })
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    await waitFor(async () => {
      expect((await repositories.noticeBatches.get(BATCH))?.state).toBe('sent')
    })
  })

  it('rejects a row with the reason on the record, and only from Confirm', async () => {
    const user = userEvent.setup()
    const drawer = await openRow(ROW.unmatched, /TA-HLT-0114552/)

    const reject = within(drawer).getByRole('button', { name: 'Reject this row' })
    expect(reject).toBeDisabled()

    await user.type(
      within(drawer).getByLabelText('Why this row is being rejected'),
      'Sits on another agency code; not ours to renew.',
    )
    await user.click(reject)

    // Cancel writes nothing.
    await user.click(within(drawer).getByRole('button', { name: 'Cancel' }))
    expect((await repositories.noticeBatches.row(ROW.unmatched))?.state).toBe('unmatched')

    await user.click(within(drawer).getByRole('button', { name: 'Reject this row' }))
    await user.click(within(drawer).getByRole('button', { name: 'Reject the row' }))

    await waitFor(async () => {
      const row = await repositories.noticeBatches.row(ROW.unmatched)
      expect(row?.state).toBe('rejected')
      expect(row?.rejectReason).toBe('Sits on another agency code; not ours to renew.')
    })
  })
})

describe('§9 — reminders carry year-wise amounts', () => {
  it('quotes the notice’s figure and the one on the policy we hold, side by side', async () => {
    const drawer = await openRow(ROW.clean, /TA-HLT-0092214/)

    const years = within(drawer)
      .getByRole('heading', { name: 'Year-wise amounts' })
      .closest('section') as HTMLElement

    expect(within(years).getByText('This year, printed on the notice')).toBeInTheDocument()
    expect(within(years).getByText('Last year, on the policy we hold')).toBeInTheDocument()
    expect(years).toHaveTextContent(/does not compare\s+them/)
  })
})

describe('a matched row nobody has checked', () => {
  it('says why it is held out of the send rather than failing quietly', async () => {
    const drawer = await openRow(ROW.unchecked, /TA-TRV-0331808/)

    expect(within(drawer).getByText('This row is held out of any send')).toBeInTheDocument()
    expect(drawer).toHaveTextContent(/nobody has checked/)
  })
})
