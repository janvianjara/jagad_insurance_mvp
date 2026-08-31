import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { RAKESH, WHO, freshRepositories, renderCustomers, signIn } from './test-harness'

/**
 * The right to ask, and the answer a live contract forces — FR-20.2.
 *
 * Rakesh Patel holds a live policy, so his file cannot be erased today. The
 * acceptance criterion is quoted in the gap analysis and is three things at
 * once: legal-obligation retention, marketing use locked, decision logged. This
 * walks it through the screen a person would actually use.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

describe('a customer file cannot be deleted, and says why', () => {
  it('offers no discard, and says where the answer lives instead', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}`)

    expect(await screen.findByRole('button', { name: 'Erasure request' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument()
    expect(screen.getByText(/never deleted/)).toBeInTheDocument()
  })

  it('answers a request with the obligation named, and locks marketing instead', async () => {
    const user = userEvent.setup()
    renderCustomers(repositories, `/customers/${RAKESH}`)

    await user.click(await screen.findByRole('button', { name: 'Erasure request' }))
    await user.selectOptions(await screen.findByLabelText('Who asked'), 'data_principal')
    await user.type(
      screen.getByLabelText(/What they said/),
      'Asked on the phone to be removed from everything.',
    )
    await user.click(screen.getByRole('button', { name: 'Review the request' }))
    await user.click(screen.getByRole('button', { name: 'Record the request' }))

    // Retained, with the obligation named in the domain's own sentence.
    expect(await screen.findByText('Retained by legal obligation')).toBeInTheDocument()
    expect(screen.getByText(/A live insurance contract is held in this name/)).toBeInTheDocument()
    // And what the person actually gets, said rather than implied.
    expect(
      screen.getByText(/Marketing use and Automated reminders and chasing are switched off/),
    ).toBeInTheDocument()

    // The decision is logged, and nothing was deleted.
    await waitFor(async () => {
      const held = await repositories.eraseRequests.forSubject('Customer', RAKESH)
      expect(held).toHaveLength(1)
      expect(held[0].verdict).toBe('retained_by_obligation')
      expect(held[0].obligations).toContain('live_policy')
    })
    expect(await repositories.customers.get(RAKESH)).not.toBeNull()

    const suppression = await repositories.eraseRequests.suppression('Customer', RAKESH)
    expect(suppression.suppressed).toContain('marketing')
  })
})
