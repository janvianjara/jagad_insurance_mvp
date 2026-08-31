/*
 * Who can see the correction actions, and what a refusal looks like.
 *
 * Both of these are regression tests for the same report: "there is no edit
 * option". The buttons had in fact been built and mounted on eight screens — but
 * on the account the person was signed in as they did not render, and when they
 * did not render the component returned nothing at all. An absent feature and a
 * refused one looked identical, so the product appeared not to have the feature.
 *
 * Two separate defects sat behind that.
 *
 * **The team scope was inert.** `can()` decides a `level: 'team'` grant by
 * comparing `record.teamId` with the user's, and of the six correctable entities
 * only `Inquiry` carries a `teamId` at all. So on a customer the comparison was
 * always `undefined === 'tem-sales'`, every team-scoped person was refused every
 * record they did not personally own, and a sales manager could correct nothing
 * on their own team's file. The team is now resolved from the record's owner,
 * which is where it actually lives.
 *
 * **A refusal was silent.** It now says which it is.
 */
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { RAKESH, WHO, freshRepositories, renderCustomers, signIn } from './test-harness'

let repositories: MockRepositories

beforeEach(() => {
  repositories = freshRepositories()
})

describe('the correction actions on a customer file', () => {
  it('offers Correct to an administrator', async () => {
    await signIn(repositories, WHO.vivek)
    renderCustomers(repositories, `/customers/${RAKESH}`)

    expect(await screen.findByRole('button', { name: 'Correct' })).toBeInTheDocument()
  })

  it('offers Correct to a team-scoped manager on a file their team holds', async () => {
    // The reported case. Rakesh Patel is owned by Kiran, not by Nikunj, so this
    // passes only because the record's team is resolved through its owner. Read
    // the record's owner off the repository rather than asserting a fixture id,
    // so the test keeps meaning what it says if the seed changes hands.
    const customer = await repositories.customers.get(RAKESH)
    expect(customer?.ownerId).not.toBe(WHO.nikunj)

    await signIn(repositories, WHO.nikunj)
    renderCustomers(repositories, `/customers/${RAKESH}`)

    expect(await screen.findByRole('button', { name: 'Correct' })).toBeInTheDocument()
  })

  it('offers the erasure request rather than a delete, because the file is retained', async () => {
    await signIn(repositories, WHO.vivek)
    renderCustomers(repositories, `/customers/${RAKESH}`)

    expect(await screen.findByRole('button', { name: 'Erasure request' })).toBeInTheDocument()
    // There is no delete on a customer, and the type system is what refuses it.
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull()
    expect(screen.getByText(/never deleted/)).toBeInTheDocument()
  })

  it('says a correction was refused rather than rendering nothing at all', async () => {
    // An empty space is how "you may not" got read as "this does not exist", so
    // the refusal has to speak. Assert the sentence, not the container: the
    // container also exists while the staff read is still in flight, and an
    // aria-busy skeleton is legitimately wordless.
    const page = await repositories.customers.list({ page: 1, pageSize: 200 })
    const notKirans = page.rows.find((row) => row.ownerId !== WHO.kiran)
    expect(notKirans, 'every customer is owned by Kiran, so there is nothing to refuse').toBeDefined()

    await signIn(repositories, WHO.kiran)
    renderCustomers(repositories, `/customers/${notKirans!.id}`)

    expect(await screen.findByText(/not by this account/)).toBeInTheDocument()
  })
})
