import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { graceEndsOn } from './renewal-view'
import { WHO, freshRepositories, renderRenewals, signIn } from './test-harness'

/**
 * The D-A premium-schedule rules §9 states as prose, and the instalments screen
 * they are read on.
 *
 * Two of them are about arithmetic that must not happen: the instalment amount
 * is typed from the insurer's schedule and is never the annual premium divided
 * by the number of instalments, and the grace window comes from the schedule's
 * own mode rather than from a house constant. Both are asserted against the
 * numbers on screen AND against the records behind them, because a screen that
 * happens to render the right figure while the data says otherwise is the bug.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.sneha)
})

async function rowFor(policyNo: string): Promise<HTMLElement> {
  const cell = await screen.findByText(policyNo)
  const row = cell.closest('tr')
  if (!row) throw new Error(`No instalment row carries ${policyNo}.`)
  return row
}

describe('§9 — the instalment amount is typed, never derived from the annual premium', () => {
  it('renders the figure the insurer typed and not the annual premium divided by twelve', async () => {
    renderRenewals(repositories, '/renewals/instalments')

    const row = await rowFor('POL-4402')

    // The schedule was typed at 1,570.00 a month. The policy's final premium is
    // 18,832.80, which over twelve months would be 1,569.40 — a figure this
    // product must never produce, and one that is nowhere on the screen.
    expect(within(row).getByText('₹1,570.00')).toBeInTheDocument()
    expect(screen.queryByText('₹1,569.40')).not.toBeInTheDocument()
  })

  it('records where the figure came from, and it is not arithmetic', async () => {
    const schedule = await repositories.schedules.forPolicy('pol-4402')
    const policy = await repositories.policies.get('pol-4402')
    if (!schedule || !policy || !policy.finalPremium || !schedule.instalmentAmount) {
      throw new Error('The monthly schedule fixture is missing.')
    }

    expect(schedule.instalmentAmountSource).toBe('typed_from_insurer')

    // The two figures genuinely disagree, which is what makes the rule testable.
    const derived = Math.round(policy.finalPremium.paise / schedule.instalmentCount)
    expect(schedule.instalmentAmount.paise).not.toBe(derived)

    const instalments = await repositories.schedules.instalments(schedule.id)
    for (const instalment of instalments) {
      expect(instalment.amount.paise).toBe(schedule.instalmentAmount.paise)
    }
  })
})

describe("§9 — grace days come from the schedule's mode, not from a constant", () => {
  it('states the window and the mode it came from on the row itself', async () => {
    renderRenewals(repositories, '/renewals/instalments')

    const row = await rowFor('POL-4402')
    expect(within(row).getByText('15 days, from the monthly schedule')).toBeInTheDocument()
  })

  it('gives two schedules two different windows because their modes differ', async () => {
    const monthly = await repositories.schedules.forPolicy('pol-4402')
    const quarterly = await repositories.schedules.forPolicy('pol-4419')
    if (!monthly || !quarterly) throw new Error('The schedule fixtures are missing.')

    expect(monthly.mode).toBe('monthly')
    expect(quarterly.mode).toBe('quarterly')
    expect(monthly.graceDays).toBe(15)
    expect(quarterly.graceDays).toBe(30)
    expect(monthly.graceDays).not.toBe(quarterly.graceDays)

    // And the window on a row is measured with that schedule's own number.
    expect(graceEndsOn('2026-08-24', monthly.graceDays)).toBe('2026-09-08')
    expect(graceEndsOn('2026-08-24', quarterly.graceDays)).toBe('2026-09-23')
  })
})

describe('the instalments screen', () => {
  it('says in words that every policy on it is in force, so nothing here reads as an expiry', async () => {
    renderRenewals(repositories, '/renewals/instalments')

    expect(await screen.findByText('Every policy on this list is in force')).toBeInTheDocument()
    expect(
      screen.getByText(/What is at risk is continuity/),
    ).toBeInTheDocument()
    expect(await screen.findByText('1 instalment')).toBeInTheDocument()
  })

  it('surfaces the failed mandate without claiming a pattern that the record does not show', async () => {
    renderRenewals(repositories, '/renewals/instalments')

    const failed = await screen.findByRole('list', { name: 'Failed mandates' })
    expect(within(failed).getByText('ENACH-HE-4402-8827')).toBeInTheDocument()
    expect(within(failed).getByText('Bank of Baroda')).toBeInTheDocument()

    // One failure inside three months is not the two §9 calls a pattern.
    expect(within(failed).queryByText('Pattern — tell the agent')).not.toBeInTheDocument()
    expect(
      screen.getByText(/It never presents a debit and holds no bank credential/),
    ).toBeInTheDocument()
  })
})

describe('permissions', () => {
  it('lets a role without the renewals grant read a renewal without offering a move', async () => {
    await signIn(repositories, WHO.kiran)
    renderRenewals(repositories, '/renewals/rnw-4441')

    expect(
      await screen.findByText(
        'Your role can read this renewal but not work it. The renewals desk owns the pool.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Take this renewal from the pool' }),
    ).toBeDisabled()
  })
})
