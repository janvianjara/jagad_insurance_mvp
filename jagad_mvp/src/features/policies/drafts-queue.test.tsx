import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { CAST, WHO, freshRepositories, renderPolicies, signIn } from './test-harness'

/**
 * Canvas 3.7 — "a half-finished entry is saved as a draft and appears in the
 * completion queue with what is still missing".
 *
 * The row is written end to end rather than asserted against a fixture, because
 * the promise is a chain and every link of it can break on its own: the form has
 * to keep what was typed, the save has to know which required fields are still
 * empty, the repository has to file the entry beside the policy, and the queue
 * has to say in a person's own words which fields those were. A test that seeded
 * a `PolicyEntryDraft` and read it back would prove only the last link.
 *
 * Nothing here imports a fixture. Every record is reached through a repository,
 * exactly as a screen reaches it.
 */

let repositories: MockRepositories

beforeEach(async () => {
  window.localStorage.clear()
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

afterEach(() => {
  window.localStorage.clear()
})

type User = ReturnType<typeof userEvent.setup>

/** Jumps straight to a stage through the stepper, without validating this one. */
async function goToStage(user: User, label: RegExp) {
  const stages = within(screen.getByRole('list', { name: 'Stages' }))
  await user.click(stages.getByRole('button', { name: label }))
}

/** A native date input takes its value whole; there is nothing to type into. */
function setDate(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

/** Presses a button inside the gate that is open, never one behind it. */
async function inGate(user: User, label: string) {
  const gate = document.querySelector('[data-confirm-gate]')
  if (!gate) throw new Error('No confirmation gate is open.')
  await user.click(within(gate as HTMLElement).getByRole('button', { name: label }))
}

describe('canvas 3.7 — the completion queue', () => {
  it('3.7 a half-finished entry is saved as a draft and appears in the completion queue with what is still missing', async () => {
    const user = userEvent.setup()
    renderPolicies(repositories, `/policies/new?dealId=${CAST.deal}`)

    // The deal decided the agency and the first line item, so the form for that
    // product is already on screen.
    await screen.findByRole('heading', { name: 'Placement' })
    await screen.findByLabelText(/Proposer name/)

    // Everything the proposal form asks except the premium: the figures are on
    // an insurer document that has not arrived, which is the ordinary reason an
    // entry gets left part-done.
    await user.type(screen.getByLabelText(/Proposer name/), 'Falguni Shah')
    await user.type(screen.getByLabelText(/^Mobile/), '9825033311')
    setDate(/Date of birth/, '1979-04-12')

    await goToStage(user, /Cover/)
    await user.type(screen.getByLabelText(/Sum insured/), '1000000')
    setDate(/Risk start date/, '2026-09-01')
    setDate(/Expiry date/, '2027-08-31')

    await goToStage(user, /Nominee/)
    await user.type(screen.getByLabelText(/Nominee name/), 'Dipika Shah')
    await user.selectOptions(screen.getByLabelText(/^Relationship/), 'spouse')

    await user.click(screen.getByRole('button', { name: 'Save what is recorded' }))

    // The gate says what will be written, and names what is still open. Nothing
    // has been recorded at this point.
    const gate = document.querySelector('[data-confirm-gate]') as HTMLElement
    expect(within(gate).getByText('Final premium, Premium mode')).toBeInTheDocument()
    expect((await repositories.policies.completionQueue({ pageSize: 100 })).rows).toHaveLength(6)

    await inGate(user, 'Save the entry')

    // The entry is on the completion queue, at its own address.
    await screen.findByRole('heading', { name: 'Entries still to finish' })

    const saved = (await repositories.policies.completionQueue({ pageSize: 100 })).rows.find(
      (draft) => draft.dealId === CAST.deal && draft.savedBy === WHO.priya,
    )
    expect(saved).toBeDefined()
    expect(saved?.missingFields).toEqual(['finalPremium', 'premiumMode'])

    const policy = await repositories.policies.get(saved?.policyId ?? '')
    expect(policy?.sumInsured?.paise).toBe(100_000_000)
    // Nothing was invented for the figures nobody typed.
    expect(policy?.finalPremium).toBeNull()
    expect(policy?.netPremium).toBeNull()

    // And the row says how much is left and which fields those are, in the
    // words the person saw on the form.
    const names = await screen.findByText('Final premium, Premium mode')
    const cell = names.closest('[data-missing]')
    expect(cell).not.toBeNull()
    expect(cell).toHaveAttribute('data-missing', '2')
    expect(within(cell as HTMLElement).getByText('2 fields')).toBeInTheDocument()
  })
})
