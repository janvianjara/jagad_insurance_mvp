import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { WALKTHROUGH_NOW, WHO, freshRepositories, renderRenewals, signIn } from './test-harness'

/**
 * Canvas flow 5 (n26 to n31) and the §9 renewal machine, one named test per rule.
 *
 * These render the real screens against the real mock repositories, so a
 * scenario passing here means the walkthrough works.
 */

const DAY_MS = 86_400_000

const isoDay = (value: Date) => value.toISOString().slice(0, 10)

/**
 * A term that starts after the instant the harness pins, so this scenario walks
 * the ordinary renewal path.
 *
 * Typing that date as a literal is what made scenario 5.5 a calendar bomb:
 * `2026-08-29` was in the future when the test was written and in the past by
 * the end of that month, at which point `startDate < today` opened the
 * backdating branch and the confirm gate the scenario waits for stopped
 * rendering. Nothing about the renewal logic had changed; the wall clock had
 * moved. The backdating path is covered by two tests of its own, which type a
 * deliberately far-past date for the same reason this one must not.
 */
function termAfter(now: Date): { readonly starts: string; readonly ends: string } {
  const starts = new Date(now.getTime() + 3 * DAY_MS)
  return { starts: isoDay(starts), ends: isoDay(new Date(starts.getTime() + 364 * DAY_MS)) }
}

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.sneha)
})

function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

async function expectStatus(label: string) {
  const header = screen.getByRole('banner')
  expect(await within(header).findByText(label)).toBeInTheDocument()
}

async function confirmAction(actionLabel: string, confirmLabel: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: actionLabel }))
  await user.click(await screen.findByRole('button', { name: confirmLabel }))
}

/**
 * Rows of one kind. The kind cell carries `data-kind`, which is what lets a test
 * ask the same question a reader asks: which of these is a renewal?
 */
function rowsOfKind(kind: 'renewal' | 'instalment'): HTMLElement[] {
  return [...document.querySelectorAll(`[data-kind="${kind}"]`)]
    .map((node) => node.closest('tr'))
    .filter((row): row is HTMLTableRowElement => row !== null)
}

async function rowFor(policyNo: string, kind: 'renewal' | 'instalment'): Promise<HTMLElement> {
  await screen.findAllByText(policyNo)
  const row = rowsOfKind(kind).find((candidate) => within(candidate).queryByText(policyNo) !== null)
  if (!row) throw new Error(`No ${kind} row carries ${policyNo}.`)
  return row
}

/** The open `<ConfirmGate>`, so a preview is not confused with the form above it. */
function gate(): HTMLElement {
  const node = document.querySelector('[data-confirm-gate="true"]')
  if (!(node instanceof HTMLElement)) throw new Error('No confirm gate is open.')
  return node
}

describe('§9 — an instalment due date is not a renewal date', () => {
  it('shows the two as visibly different kinds of item, and says what each one means', async () => {
    renderRenewals(repositories, '/renewals')

    // POL-4441 expires on 31 August: a renewal.
    const renewal = await rowFor('POL-4441', 'renewal')
    expect(within(renewal).getByText('Renewal')).toBeInTheDocument()
    expect(within(renewal).getByText(/^Expires/)).toBeInTheDocument()
    expect(
      within(renewal).getByText(
        'The policy term ends on this date. Nothing after it is covered unless it is renewed.',
      ),
    ).toBeInTheDocument()

    // POL-4402 is the case that makes the rule bite: it has BOTH a renewal task
    // (its term ends in February 2027) and an instalment sitting in grace right
    // now. The same policy, two clocks, and the queue keeps them apart.
    const instalment = await rowFor('POL-4402', 'instalment')
    expect(within(instalment).getByText('Instalment due')).toBeInTheDocument()
    expect(within(instalment).getByText(/In force/)).toBeInTheDocument()
    expect(within(instalment).getAllByText(/not expiring/).length).toBeGreaterThan(0)
    expect(
      within(instalment).getByText(
        'A payment falls due inside a term that is still running. The policy is in force and it is not expiring.',
      ),
    ).toBeInTheDocument()

    const alsoARenewal = await rowFor('POL-4402', 'renewal')
    expect(within(alsoARenewal).getByText(/^Expires/)).toBeInTheDocument()

    expect(
      screen.getByText('Two clocks run on this desk, and they are not the same'),
    ).toBeInTheDocument()
  })

  it('offers ownership on a renewal and refuses it on an instalment, which has no owner because it is not a task', async () => {
    renderRenewals(repositories, '/renewals')

    const renewal = await rowFor('POL-4441', 'renewal')
    // Its status and its owner both read "In the pool": nobody has taken it.
    expect(within(renewal).getAllByText('In the pool')).toHaveLength(2)

    const instalment = await rowFor('POL-4402', 'instalment')
    expect(within(instalment).getByText('No owner — a payment')).toBeInTheDocument()
  })

  it('refuses to take an instalment from the pool, and says why before anything is written', async () => {
    const user = userEvent.setup()
    // The selection lives in the URL, like every other piece of queue state.
    renderRenewals(repositories, '/renewals?sel=ins-4402-07')

    await user.click(await screen.findByRole('button', { name: 'Take from the pool' }))

    expect(await screen.findByText('Not a renewal task — nothing to take')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Take and own' }))

    expect(
      await screen.findByText(
        /that is an instalment falling due inside a running term, not a renewal task/,
      ),
    ).toBeInTheDocument()
  })

  it('filters the desk down to one kind straight off the URL', async () => {
    renderRenewals(repositories, '/renewals?kind=instalment')

    expect(await screen.findByText('POL-4402')).toBeInTheDocument()
    expect(screen.queryByText('POL-4441')).not.toBeInTheDocument()
    expect(screen.getByText('1 due item')).toBeInTheDocument()
  })
})

describe('canvas 5 — the renewal task from schedule to outcome', () => {
  it('5.1 refuses to pool a renewal before its lead date, and names the date and the lead from configuration', async () => {
    // RNW-4402 is scheduled against a policy that expires in February 2027.
    renderRenewals(repositories, '/renewals/rnw-4402')

    expect(
      await screen.findByText(
        'This renewal enters the pool on 2027-01-09, 45 days before expiry.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open into the pool' })).toBeDisabled()

    const record = panel('The record')
    expect(
      within(record).getByText('45 days before expiry, from the renewal recipe in configuration'),
    ).toBeInTheDocument()
  })

  it('5.2 is taken from the pool by the person who will work it, and ownership is recorded', async () => {
    const user = userEvent.setup()
    renderRenewals(repositories, '/renewals/rnw-4441')

    await user.click(await screen.findByRole('button', { name: 'Take this renewal from the pool' }))
    expect(await screen.findByText('Taken, not assigned by somebody else')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Take and own' }))

    await expectStatus('Assigned')
    const record = panel('The record')
    expect(within(record).getByText('Sneha Patel')).toBeInTheDocument()
  })

  it('5.3 refuses a bare reminder and sends one carrying the year-wise amounts and the offers', async () => {
    const user = userEvent.setup()
    renderRenewals(repositories, '/renewals/rnw-4437')

    expect(
      await screen.findByText(
        'A renewal reminder carries the current offers alongside the amounts.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send the renewal reminder' })).toBeDisabled()

    // The current term's figure is the one recorded on the policy — read, not derived.
    const reminderPanel = panel('The reminder')
    expect(within(reminderPanel).getByText('from the policy record')).toBeInTheDocument()

    await user.type(
      screen.getByLabelText(/Offers/),
      'No-claim discount carried forward\nTwo-year term at last year price',
    )

    await user.click(screen.getByRole('button', { name: 'Send the renewal reminder' }))
    expect(
      await screen.findByText(/No-claim discount carried forward · Two-year term at last year price/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send the reminder' }))

    await expectStatus('Reminded')
    expect(within(panel('The record')).getByText('1')).toBeInTheDocument()
  })

  it('5.4 sends the reminder again — §9 draws it as reminded xN, the same state sent once more', async () => {
    const user = userEvent.setup()
    // RNW-4431 has had two reminders already.
    renderRenewals(repositories, '/renewals/rnw-4431')

    await user.type(await screen.findByLabelText(/Offers/), 'Same premium as last year')
    await confirmAction('Send the renewal reminder', 'Send the reminder')

    await expectStatus('Reminded')
    const record = panel('The record')
    expect(within(record).getByText('3')).toBeInTheDocument()
  })

  it('5.5 records a renewal as a new term, a new document version and a recalculated commission', async () => {
    const user = userEvent.setup()
    renderRenewals(repositories, '/renewals/rnw-4437')

    expect(
      await screen.findByText('A renewal needs both the new start date and the new end date.'),
    ).toBeInTheDocument()

    const term = termAfter(WALKTHROUGH_NOW)
    await user.type(screen.getByLabelText(/New term starts/), term.starts)
    await user.type(screen.getByLabelText(/New term ends/), term.ends)

    // Dates alone are not a renewal: the commission chain has to be redone.
    expect(
      await screen.findByText('Commission is recalculated on renewal. Run the recalculation before completing.'),
    ).toBeInTheDocument()

    await user.click(screen.getByLabelText(/Commission has been recalculated/))
    await user.click(screen.getByRole('button', { name: 'Record the renewal' }))

    expect(
      await screen.findByText(/a new PDF, never an edit of last year's/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record the new term' }))

    await expectStatus('Renewed')
  })

  it('5.6 records a lapse with its reason, and the win-back list is worked from that reason', async () => {
    const user = userEvent.setup()
    renderRenewals(repositories, '/renewals/rnw-4437')

    expect(
      await screen.findByText(
        'Record why this renewal lapsed. It is what the win-back list is worked from.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record a lapse' })).toBeDisabled()

    await user.type(screen.getByLabelText(/If it lapsed, why/), 'Sold the vehicle in July.')
    await confirmAction('Record a lapse', 'Record the lapse')
    await expectStatus('Lapsed')

    expect(within(panel('Lapsed')).getByText('Sold the vehicle in July.')).toBeInTheDocument()

    await confirmAction('Add to the win-back list', 'Add to win-back')
    await expectStatus('Win-back list')
  })
})

describe('§9 — backdating is permitted, and it is logged in full', () => {
  it('refuses a backdated term whose log is incomplete, naming what is missing', async () => {
    const user = userEvent.setup()
    renderRenewals(repositories, '/renewals/rnw-4437')

    await user.type(await screen.findByLabelText(/New term starts/), '2026-01-01')
    await user.type(screen.getByLabelText(/New term ends/), '2026-12-31')
    await user.click(screen.getByLabelText(/Commission has been recalculated/))

    expect(
      await screen.findByText(
        'Backdating is allowed, and it is logged in full. This backdate is missing the reason.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record the renewal' })).toBeDisabled()
  })

  it('allows the backdated term once the reason is written, and carries the whole log with it', async () => {
    const user = userEvent.setup()
    renderRenewals(repositories, '/renewals/rnw-4437')

    await user.type(await screen.findByLabelText(/New term starts/), '2026-01-01')
    await user.type(screen.getByLabelText(/New term ends/), '2026-12-31')
    await user.click(screen.getByLabelText(/Commission has been recalculated/))
    await user.type(
      screen.getByLabelText(/Why is this term backdated/),
      'Insurer issued the cover note in January and sent the schedule late.',
    )

    await user.click(screen.getByRole('button', { name: 'Record the renewal' }))
    // The whole backdate log is previewed before anything is written.
    expect(
      within(gate()).getByText(/Insurer issued the cover note in January and sent the schedule late\./),
    ).toBeInTheDocument()
    expect(within(gate()).getAllByText(/2026-08-28/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Record the new term' }))

    await expectStatus('Renewed')
  })
})
