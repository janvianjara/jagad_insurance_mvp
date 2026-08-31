import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { WHO, freshRepositories, renderInquiries, signIn } from './test-harness'

/**
 * Correcting and discarding an inquiry, through the real screen — FR-20.4, .2.
 *
 * INQ-1031 is the walkthrough's worked lead: accepted, spoken to yesterday,
 * nothing downstream of it. It is the record a mistyped mobile number actually
 * happens on, and until this wave there was no path in the product that could
 * put one right.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

describe('correcting what was taken down wrong', () => {
  it('records the change, and Cancel writes nothing on the way there', async () => {
    const user = userEvent.setup()
    const { container } = renderInquiries(repositories, '/inquiries/inq-1031')

    await user.click(await screen.findByRole('button', { name: 'Correct' }))

    const mobile = await screen.findByLabelText('Mobile')
    await user.clear(mobile)
    await user.type(mobile, '9825110099')
    await user.type(
      screen.getByLabelText('Why is this being corrected'),
      'Digit transposed when the number was taken down.',
    )
    await user.click(screen.getByRole('button', { name: 'Review this correction' }))

    // The gate shows the record's own value beside the one being typed.
    const gate = await screen.findByRole('button', { name: 'Record the correction' })
    const preview = container.querySelector('[data-change="contactMobile"]')
    expect(preview).toHaveTextContent('9825110004')
    expect(preview).toHaveTextContent('9825110099')

    // Backing out writes nothing at all.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect((await repositories.inquiries.get('inq-1031'))?.contactMobile).toBe('9825110004')

    await user.click(screen.getByRole('button', { name: 'Review this correction' }))
    await user.click(await screen.findByRole('button', { name: 'Record the correction' }))

    await waitFor(async () => {
      expect((await repositories.inquiries.get('inq-1031'))?.contactMobile).toBe('9825110099')
    })
    expect(gate).not.toBeInTheDocument()

    // The trail carries who changed what, and on what grounds.
    const events = repositories.store.eventsFor('Inquiry', 'inq-1031')
    expect(events.at(-1)?.name).toBe('record.amended')
    expect(events.at(-1)?.detail).toMatchObject({
      fields: 'contactMobile',
      reason: 'Digit transposed when the number was taken down.',
    })
  })
})

describe('discarding a duplicate, and bringing it back', () => {
  it('leaves the queue, says it is discarded on its own screen, and restores', async () => {
    const user = userEvent.setup()
    const detail = renderInquiries(repositories, '/inquiries/inq-1031')

    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    await user.selectOptions(
      await screen.findByLabelText('Why is it being discarded'),
      'duplicate',
    )
    await user.click(screen.getByRole('button', { name: 'Review the discard' }))

    // The gate says which of the two things this is before it is pressed.
    expect(screen.getByText(/reversible and nothing is deleted/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard it' }))

    // The record says so, and says when, by whom and why.
    expect(await screen.findByText('This inquiry is discarded')).toBeInTheDocument()
    expect(screen.getByText(/Duplicate of another record — discarded by Vivek Jagad/)).toBeInTheDocument()
    detail.unmount()

    // Gone from the queue by default, and reachable through the filter — which
    // lives in the URL, so the view survives being reloaded or sent to somebody.
    const live = renderInquiries(repositories, '/inquiries?q=INQ-1031')
    await waitFor(() => expect(screen.queryByText('INQ-1031')).not.toBeInTheDocument())
    live.unmount()

    const discarded = renderInquiries(repositories, '/inquiries?q=INQ-1031&discarded=true')
    expect(await screen.findByText('INQ-1031')).toBeInTheDocument()
    discarded.unmount()

    // And the way back is on the record itself.
    renderInquiries(repositories, '/inquiries/inq-1031')
    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    await user.type(
      await screen.findByLabelText('Why is it coming back'),
      'Discarded in error — it is not a duplicate.',
    )
    await user.click(screen.getByRole('button', { name: 'Review the restore' }))
    await user.click(screen.getByRole('button', { name: 'Restore it' }))

    await waitFor(async () => {
      expect((await repositories.inquiries.get('inq-1031'))?.discard ?? null).toBeNull()
    })
  })
})

describe('the button is not offered to somebody who may not press it', () => {
  it('hides correction and discard from a sub-agent, who holds neither grant', async () => {
    await signIn(repositories, WHO.meera)
    renderInquiries(repositories, '/inquiries/inq-1031')

    // The record still opens — she may view it. What she may not do is absent
    // rather than disabled, so nothing on the screen offers a refusal.
    expect(await screen.findByRole('heading', { name: 'Bhavesh Trivedi' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Correct' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument()
  })
})
