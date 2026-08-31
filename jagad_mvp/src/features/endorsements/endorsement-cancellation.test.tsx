import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { money } from '../../domain/money'
import type { MockRepositories } from '../../data/mock'
import { ENDORSEMENT, WHO, freshRepositories, renderEndorsements, signIn } from './test-harness'

/**
 * §9's cancellation fork: "The claims-in-period check runs against the
 * platform's own claim data and returns instantly", and a claim inside the
 * period sends the record to `refund_not_eligible`.
 *
 * END-0033 cancels POL-4402, and CLM-0417 was raised against that policy five
 * days ago — inside its term. So the verdict is not a fixture flag this screen
 * reads back: it is computed from the claims the platform holds, which is why
 * the assertion below names the claim.
 *
 * The refund itself is the other half. It is a figure typed off the insurer's
 * document with the reference beside it; there is no control anywhere on this
 * screen that pro-rates one, and the machine refuses a refund that arrives
 * without the document it was read off.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

describe('§9 — the claims-in-period check', () => {
  it('reads the platform’s own claim data and names the claim it found', async () => {
    const verdict = await repositories.endorsements.claimsInPeriod(ENDORSEMENT.cancellation)

    expect(verdict).not.toBeNull()
    expect(verdict?.refundEligible).toBe(false)
    expect(verdict?.claimIds).toContain('clm-0417')
  })

  it('shows the verdict before anybody presses anything', async () => {
    renderEndorsements(repositories, `/endorsements/${ENDORSEMENT.cancellation}`)

    const panel = (await screen.findByRole('heading', { name: 'Claims in the policy period' }))
      .closest('section') as HTMLElement
    expect(within(panel).getByText('A claim fell inside the period')).toBeInTheDocument()
    expect(within(panel).getByText(/no refund is due on\s+cancellation/)).toBeInTheDocument()
    expect(within(panel).getByText('clm-0417')).toBeInTheDocument()
  })

  it('refuses the refund edge in the machine’s words and offers the one that is open', async () => {
    renderEndorsements(repositories, `/endorsements/${ENDORSEMENT.cancellation}`)

    await screen.findByText('A claim fell inside the period')

    const refund = screen.getByRole('button', { name: 'Record the insurer’s refund' })
    expect(refund).toBeDisabled()

    // The machine's own sentence, wired to the control it disabled.
    const reasonId = refund.getAttribute('aria-describedby')
    expect(reasonId).not.toBeNull()
    expect(document.getElementById(reasonId as string)).toHaveTextContent(
      /A claim was made inside this policy period/,
    )
    expect(
      screen.getByRole('button', { name: 'Record that no refund is due' }),
    ).toBeEnabled()
  })

  it('records refund_not_eligible from Confirm, and from nowhere else', async () => {
    const user = userEvent.setup()
    renderEndorsements(repositories, `/endorsements/${ENDORSEMENT.cancellation}`)

    await screen.findByText('A claim fell inside the period')
    await user.click(screen.getByRole('button', { name: 'Record that no refund is due' }))

    // Cancel writes nothing.
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect((await repositories.endorsements.get(ENDORSEMENT.cancellation))?.state).toBe('claims_check')

    await user.click(screen.getByRole('button', { name: 'Record that no refund is due' }))
    await user.click(await screen.findByRole('button', { name: 'Record no refund' }))

    await waitFor(async () => {
      const held = await repositories.endorsements.get(ENDORSEMENT.cancellation)
      expect(held?.state).toBe('refund_not_eligible')
      expect(held?.claimsVerdict?.refundEligible).toBe(false)
      expect(held?.refund.amount).toBeNull()
    })
  })
})

describe('§9 — the refund is a typed insurer figure', () => {
  it('is shown with the document it was read off, never as something worked out', async () => {
    renderEndorsements(repositories, '/endorsements/end-0034')

    await screen.findByRole('heading', { name: 'Refund' })
    expect(screen.getByText('Typed from the insurer figure')).toBeInTheDocument()
    expect(screen.getByText('BA-CANC-2026-118824')).toBeInTheDocument()
  })

  it('is refused by the machine when it arrives without an insurer reference', async () => {
    const outcome = await repositories.endorsements.recordRefund(ENDORSEMENT.cancellation, {
      actorId: WHO.vivek,
      refund: money(4_820),
      source: 'typed_from_insurer',
      insurerReference: '',
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/claim was made inside this policy period|insurer reference/i)
  })
})
