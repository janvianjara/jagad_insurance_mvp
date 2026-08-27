import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { dealHasLineItems, reasonOf } from '../../domain/workflows'
import { CAST, WHO, freshRepositories, renderPolicies, signIn } from './test-harness'

/**
 * Policy entry — canvas 3.6, §9's policy machine, FR-07.4.
 *
 * Four scenarios, and each is a promise the plan makes in words rather than a
 * behaviour of this component. So each is asserted against the thing that
 * actually owns the rule: the deal block against `dealHasLineItems`' own
 * sentence, the placement filter against what the options offer, the numbering
 * against the record the repository wrote, and the premium against the figures
 * on the policy afterwards.
 *
 * The screens render against the real mock repositories through the harness. No
 * test below imports a fixture: every record is reached the way a screen reaches
 * it, so a scenario passing here means the walkthrough works.
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

async function inGate(user: User, label: string) {
  const gate = document.querySelector('[data-confirm-gate]')
  if (!gate) throw new Error('No confirmation gate is open.')
  await user.click(within(gate as HTMLElement).getByRole('button', { name: label }))
}

/** The options a `<select>` is currently offering, by their visible names. */
function optionsOf(label: RegExp): string[] {
  const control = screen.getByLabelText(label)
  return within(control).getAllByRole('option').map((option) => option.textContent ?? '')
}

/** Every policy on file, so a new one can be told apart from the fixtures. */
async function policyIds(): Promise<Set<string>> {
  const page = await repositories.policies.list({ page: 1, pageSize: 500 })
  return new Set(page.rows.map((row) => row.id))
}

async function policyAddedSince(before: Set<string>) {
  const page = await repositories.policies.list({ page: 1, pageSize: 500 })
  const added = page.rows.filter((row) => !before.has(row.id))
  expect(added).toHaveLength(1)
  return added[0]
}

/** Enough of the deal's proposal form to be saved part-done, and no more. */
async function typeSomething(user: User) {
  await user.type(await screen.findByLabelText(/Proposer name/), 'Falguni Shah')
}

describe('policy entry', () => {
  it('pre-populates the line items from the deal it was opened with, and blocks a deal that has none', async () => {
    const opened = renderPolicies(repositories, `/policies/new?dealId=${CAST.deal}`)

    // Both accepted columns are carried across, and the first is already the one
    // being entered — the point of arriving with a deal is not choosing again.
    const items = await screen.findByRole('heading', { name: 'From this deal' })
    const panel = items.closest('section') as HTMLElement
    expect(within(panel).getByText('Tata AIG Travel Guard')).toBeInTheDocument()
    expect(within(panel).getByText('Tata AIG MediCare Premier')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Being entered' })).toBeInTheDocument()

    // The placement came with them, so the form for that product is on screen.
    expect(screen.getByLabelText(/^Agency/)).toHaveValue('agy-jagad-general')
    expect(screen.getByLabelText(/^Product/)).toHaveValue('prd-ta-tvg')
    expect(await screen.findByLabelText(/Proposer name/)).toBeInTheDocument()

    opened.unmount()

    // The other half of §9's bullet: the deal with nothing on it. The block is a
    // sentence somebody can act on, and it is the machine's own.
    renderPolicies(repositories, `/policies/new?dealId=${CAST.emptyDeal}`)

    const blocked = await screen.findByRole('alert')
    expect(blocked).toHaveAttribute('data-deal-blocked', '')
    expect(blocked).toHaveTextContent(reasonOf(dealHasLineItems({ lineItems: [] })))
    expect(screen.queryByLabelText(/Proposer name/)).toBeNull()
  })

  it('offers only the companies and products the selected agency is appointed for', async () => {
    const user = userEvent.setup()
    renderPolicies(repositories, '/policies/new')

    await screen.findByRole('heading', { name: 'Placement' })

    // The broker that holds the Tata AIG appointment.
    await user.selectOptions(screen.getByLabelText(/^Agency/), 'agy-jagad-general')

    expect(optionsOf(/^Company/).join(' | ')).toMatch(/Tata AIG/)
    expect(optionsOf(/^Company/).join(' | ')).not.toMatch(/IFFCO/)

    await user.selectOptions(screen.getByLabelText(/^Company/), 'cmp-tata-aig')
    expect(optionsOf(/^Product/).join(' | ')).toMatch(/Travel Guard \(TA-TVG\)/)

    // The same person, the other appointment. The offer changes with it, and the
    // product chosen under the old scope is not left sitting there looking valid.
    await user.selectOptions(screen.getByLabelText(/^Agency/), 'agy-jagad-motor')

    expect(optionsOf(/^Company/).join(' | ')).toMatch(/IFFCO/)
    expect(optionsOf(/^Company/).join(' | ')).not.toMatch(/Tata AIG/)
    expect(screen.getByLabelText(/^Company/)).toHaveValue('')
    expect(optionsOf(/^Product/).join(' | ')).not.toMatch(/Travel Guard/)

    // What the motor broker is appointed for is what it offers, and nothing else.
    await user.selectOptions(screen.getByLabelText(/^Company/), 'cmp-iffco-tokio')
    const products = optionsOf(/^Product/).join(' | ')
    expect(products).toMatch(/Family Health Protector \(IT-FHP\)/)
    expect(products).not.toMatch(/Jeevan/)
  })

  it('numbers a proposal POL-DRAFT and a direct entry POL, because a direct entry is a policy the insurer has already issued', async () => {
    const user = userEvent.setup()

    const proposal = renderPolicies(repositories, `/policies/new?dealId=${CAST.deal}`)
    await screen.findByRole('heading', { name: 'Placement' })
    await typeSomething(user)

    const beforeProposal = await policyIds()
    await user.click(screen.getByRole('button', { name: 'Save what is recorded' }))
    await inGate(user, 'Save the entry')
    await screen.findByRole('heading', { name: 'Entries still to finish' })

    const raised = await policyAddedSince(beforeProposal)
    expect(raised.systemNo).toMatch(/^POL-DRAFT-\d+$/)
    expect(raised.status).toBe('draft')

    proposal.unmount()
    window.localStorage.clear()

    // The same form, the other path. The insurer has already issued this one, so
    // there is no proposal to raise and it takes the issued series from birth.
    renderPolicies(repositories, `/policies/new?dealId=${CAST.deal}`)
    await screen.findByRole('heading', { name: 'Placement' })
    await user.click(screen.getByRole('radio', { name: /Direct entry/ }))
    await typeSomething(user)

    const beforeDirect = await policyIds()
    await user.click(screen.getByRole('button', { name: 'Save what is recorded' }))
    await inGate(user, 'Save the entry')
    await screen.findByRole('heading', { name: 'Entries still to finish' })

    const direct = await policyAddedSince(beforeDirect)
    expect(direct.systemNo).toMatch(/^POL-\d+$/)
    expect(direct.systemNo).not.toMatch(/DRAFT/)

    // And the entry says which path it came in on, because `issue` reads it back
    // off the draft: a direct entry with no draft would look like a proposal.
    const entry = await repositories.policies.draft(direct.id)
    expect(entry?.entryPath).toBe('direct')
  })

  it('records every premium figure exactly as typed and derives none of them', async () => {
    const user = userEvent.setup()
    renderPolicies(repositories, `/policies/new?dealId=${CAST.deal}`)

    // The health line item, whose published form rolls its components up — which
    // is the only shape where the derived total and the typed one can disagree.
    await screen.findByRole('heading', { name: 'From this deal' })
    const items = screen.getByText('Tata AIG MediCare Premier').closest('li') as HTMLElement
    await user.click(within(items).getByRole('button', { name: 'Enter this one' }))

    await user.type(await screen.findByLabelText(/Proposer name/), 'Falguni Shah')
    await user.type(screen.getByLabelText(/^Mobile/), '9825033311')
    setDate(/Date of birth/, '1979-04-12')
    await user.selectOptions(screen.getByLabelText(/^City/), 'surat')

    await goToStage(user, /Cover/)
    await user.type(screen.getByLabelText(/Sum insured/), '1000000')
    setDate(/Risk start date/, '2026-09-01')
    setDate(/Expiry date/, '2027-08-31')

    await goToStage(user, /Premium/)
    await user.type(screen.getByLabelText(/Base premium/), '12000')
    await user.type(screen.getByLabelText(/^Loading/), '800')
    await user.type(screen.getByLabelText(/^GST/), '2304')
    await user.selectOptions(screen.getByLabelText(/Premium mode/), 'annual')

    await goToStage(user, /Nominee/)
    await user.type(screen.getByLabelText(/Nominee name/), 'Dipika Shah')
    await user.selectOptions(screen.getByLabelText(/^Relationship/), 'spouse')

    await user.click(screen.getByRole('button', { name: 'Review the premium' }))

    // The block carries the typed components forward and derives the only two
    // figures the product allows: Net is their sum, Final is Net plus the typed
    // GST. Both are read-only outputs, not inputs anybody could have filled.
    const derivedNet = document.querySelector('[data-rollup="net"] output') as HTMLElement
    const derivedFinal = document.querySelector('[data-rollup="final"] output') as HTMLElement
    expect(derivedNet).toHaveTextContent('12,800')
    expect(derivedFinal).toHaveTextContent('15,104')

    // The insurer's document says something else, and the insurer's document is
    // what the policy carries. Nothing copies the derived figure into this one.
    const typed = screen.getByLabelText(/Final premium/)
    expect(typed).toHaveValue('')
    await user.type(typed, '15100')

    const before = await policyIds()
    await user.click(screen.getByRole('button', { name: 'Record this policy' }))
    await inGate(user, 'Record it')
    await screen.findByRole('heading', { name: 'Policy file' })

    const recorded = await policyAddedSince(before)
    expect(recorded.finalPremium?.paise).toBe(1_510_000)
    expect(recorded.gstAmount?.paise).toBe(230_400)
    expect(recorded.sumInsured?.paise).toBe(100_000_000)
    // Net was never recorded, because nobody typed one. A derived total is a
    // cross-check for the eye; it is not evidence and it is not stored as any.
    expect(recorded.netPremium).toBeNull()
  })
})
