/*
 * Removing a row from the list it is sitting in.
 *
 * Three routes reach the same act and each answers a different question: the
 * correction drawer for "I opened this to fix it and it should not exist", the
 * bulk action for "clear these five duplicates", and the row action tested here
 * for "this one, in front of me, now". The row action is the one that has to be
 * proven not to fight the table: the rows navigate, so a button inside a cell
 * that did not swallow its own click would open the record instead of removing
 * it.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { WHO, freshRepositories, renderInquiries, signIn } from './test-harness'

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

describe('discarding an inquiry from the queue row', () => {
  it('offers Discard on the row, takes a reason, and the row leaves the list', async () => {
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries')

    // Wait for the rows themselves, not merely for the grid: the grid exists
    // while it is still a skeleton, and counting then reads fewer rows than the
    // loaded list has, which makes the comparison below run backwards.
    const buttons = await screen.findAllByRole('button', { name: /^Discard INQ-/ })
    const before = within(screen.getByRole('grid', { name: 'Inquiries' })).getAllByRole('row').length
    expect(before).toBeGreaterThan(1)

    const [firstDiscard] = buttons
    const subject = (firstDiscard.getAttribute('aria-label') ?? '').replace('Discard ', '')
    await user.click(firstDiscard)

    // The dialog names the record, so nobody removes the row above the one they meant.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(subject)

    // A reason is required: it is what the record says afterwards about why it went.
    await user.selectOptions(within(dialog).getByLabelText(/Why/), 'duplicate')

    // Two steps, deliberately: removing a row is an outward act, so it goes
    // through the same confirmation gate as every other one in the product.
    await user.click(within(dialog).getByRole('button', { name: 'Review the discard' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Discard it' }))

    // The queue re-reads and the row is gone from the default view.
    expect(screen.queryByRole('button', { name: `Discard ${subject}` })).toBeNull()

    const after = within(screen.getByRole('grid', { name: 'Inquiries' })).getAllByRole('row').length
    expect(after).toBeLessThan(before)
  })

  it('does not follow the row to its record when the action is pressed', async () => {
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries')

    const [firstDiscard] = await screen.findAllByRole('button', { name: /^Discard INQ-/ })
    await user.click(firstDiscard)

    // Still on the queue, with the dialog over it — not navigated to the record.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Inquiries' })).toBeInTheDocument()
  })
})
