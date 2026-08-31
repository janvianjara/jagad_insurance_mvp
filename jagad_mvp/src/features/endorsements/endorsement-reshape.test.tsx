import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { PREMIUM_FIELD_NAMES } from '../../domain/workflows'
import type { MockRepositories } from '../../data/mock'
import { renderedFieldsOf, shapeFor } from './form-shape'
import { ENDORSEMENT, WHO, freshRepositories, renderEndorsements, signIn } from './test-harness'

/**
 * §9's sharpest endorsement bullet: "Non-financial types must render no premium
 * fields at all."
 *
 * It is proved three ways here, because one way would leave a hole. The shape
 * that builds the form offers no money field for a correction; the capture and
 * detail screens draw no currency mark anywhere, which is the observable form of
 * the same claim — `<RecordOnlyAmount>` and `<Money>` both print one, so a page
 * with no rupee sign on it has neither a money control nor a money display; and
 * the endorsement the form actually raises comes back holding both figures null,
 * which means the machine accepted the `renderedFields` the screen reported and
 * would have refused had a premium field been on it.
 *
 * The contrast matters as much as the claim: the same screen, told the change is
 * financial, grows the premium block. A form that never shows money is not
 * evidence of a rule.
 */

let repositories: MockRepositories

const CORRECTION_REASON = 'Nominee spelt Neeta on the schedule; the KYC reads Nita.'
/** The rupee mark `<RecordOnlyAmount>` and `<Money>` both print. */
const CURRENCY_MARK = '₹'

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

describe('the shape that builds the form', () => {
  it('offers a correction no money field, and cannot be edited into offering one', () => {
    const correction = shapeFor('non_financial')

    expect(correction.premiumFields).toEqual([])
    const rendered = renderedFieldsOf(correction)
    const premiumNames: readonly string[] = PREMIUM_FIELD_NAMES
    expect(rendered.filter((name) => premiumNames.includes(name))).toEqual([])
  })

  it('offers a financial change the premium delta, and a cancellation none before the claims check', () => {
    expect(shapeFor('financial').premiumFields).toEqual(['premiumDelta'])
    expect(shapeFor('cancellation').premiumFields).toEqual([])
    expect(shapeFor('cancellation').runsClaimsCheck).toBe(true)
  })
})

describe('§9 — the capture form reshapes by type', () => {
  it('renders no premium field, and no amount at all, for a correction', async () => {
    const { container } = renderEndorsements(
      repositories,
      '/endorsements/new?policyId=pol-4388&type=non_financial',
    )

    await screen.findByRole('heading', { name: 'Correction' })

    expect(screen.queryByRole('heading', { name: 'Premium delta' })).toBeNull()
    expect(screen.queryByLabelText('Premium delta')).toBeNull()
    expect(screen.queryByLabelText('Refund amount')).toBeNull()
    expect(screen.queryByLabelText('Insurer advice reference')).toBeNull()
    expect(container.textContent).not.toContain(CURRENCY_MARK)
  })

  it('grows the premium block the moment the same form is told the change is financial', async () => {
    const user = userEvent.setup()
    const { container } = renderEndorsements(
      repositories,
      '/endorsements/new?policyId=pol-4388&type=non_financial',
    )

    await screen.findByRole('heading', { name: 'Correction' })
    await user.click(screen.getByRole('radio', { name: /^Financial/ }))

    await screen.findByRole('heading', { name: 'Premium delta' })
    expect(screen.getByLabelText('Premium delta')).toBeInTheDocument()
    expect(container.textContent).toContain(CURRENCY_MARK)
  })

  it('drops the money it was holding when the type moves back to a correction', async () => {
    const user = userEvent.setup()
    const { container } = renderEndorsements(
      repositories,
      '/endorsements/new?policyId=pol-4388&type=financial',
    )

    await screen.findByRole('heading', { name: 'Financial change' })
    await user.type(screen.getByLabelText('Premium delta'), '6412')
    expect(container.textContent).toContain(CURRENCY_MARK)

    await user.click(screen.getByRole('radio', { name: /^Non-financial/ }))

    await screen.findByRole('heading', { name: 'Correction' })
    expect(screen.queryByLabelText('Premium delta')).toBeNull()
    expect(container.textContent).not.toContain(CURRENCY_MARK)
  })

  it('raises a correction the machine accepts, holding neither figure', async () => {
    const user = userEvent.setup()
    renderEndorsements(repositories, '/endorsements/new?policyId=pol-4388&type=non_financial')

    await screen.findByRole('heading', { name: 'Correction' })
    await user.click(screen.getByRole('checkbox', { name: /Nominee name/ }))
    await user.type(screen.getByLabelText('Why it is being raised'), CORRECTION_REASON)
    await user.click(screen.getByRole('button', { name: 'Raise endorsement' }))

    await waitFor(async () => {
      const held = await repositories.endorsements.forPolicy('pol-4388')
      const raised = held.find((row) => row.reason === CORRECTION_REASON)
      expect(raised).toBeDefined()
      // The machine let it onto the non-financial path, which it only does when
      // the fields the form reported hold no premium name.
      expect(raised?.state).toBe('non_financial')
      expect(raised?.delta.amount).toBeNull()
      expect(raised?.refund.amount).toBeNull()
    })
  })
})

describe('§9 — a change too large for an endorsement', () => {
  it('is refused with the guard’s own sentence and a way to issue fresh instead', async () => {
    const user = userEvent.setup()
    renderEndorsements(repositories, '/endorsements/new?policyId=pol-4388&type=financial')

    await screen.findByRole('heading', { name: 'Financial change' })
    await user.click(screen.getByRole('checkbox', { name: /Sum insured/ }))
    await user.type(screen.getByLabelText('Why it is being raised'), 'The policy is moving to a new owner.')

    await user.click(
      screen.getByRole('checkbox', { name: /swaps the insured person or asset outright/ }),
    )

    const refusal = (
      await screen.findByText('This is more than an endorsement can carry')
    ).closest('[role="alert"]') as HTMLElement
    expect(refusal).toHaveTextContent(/more than an endorsement can carry/)
    expect(refusal).toHaveTextContent(/Issue a fresh policy instead/)
    expect(within(refusal).getByRole('link', { name: 'Start a fresh policy instead' })).toHaveAttribute(
      'href',
      '/policies/new',
    )
    expect(screen.getByRole('button', { name: 'Raise endorsement' })).toBeDisabled()
  })
})

describe('§9 — the detail screen reshapes too', () => {
  it('shows a correction no amount anywhere on the page', async () => {
    const { container } = renderEndorsements(repositories, `/endorsements/${ENDORSEMENT.correction}`)

    await screen.findByRole('heading', { name: 'No money on this endorsement' })
    expect(screen.queryByLabelText('Premium delta')).toBeNull()
    expect(screen.queryByLabelText('Refund amount')).toBeNull()
    expect(container.textContent).not.toContain(CURRENCY_MARK)
  })

  it('shows a financial endorsement its typed delta, with the insurer document beside it', async () => {
    const { container } = renderEndorsements(repositories, `/endorsements/${ENDORSEMENT.versioned}`)

    await screen.findByRole('heading', { name: 'Premium delta' })
    expect(container.textContent).toContain(CURRENCY_MARK)
    expect(screen.getByText('Typed from the insurer figure')).toBeInTheDocument()
    expect(screen.getByText('HE-END-2026-774102')).toBeInTheDocument()
  })
})
