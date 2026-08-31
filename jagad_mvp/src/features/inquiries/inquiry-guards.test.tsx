import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { inquiryIntake } from './data/intake'
import { WHO, freshRepositories, renderInquiries, signIn } from './test-harness'

/**
 * The §9 bullets that belong to the screens, and the queue promises §5 makes.
 *
 * §9 states four things about an inquiry that a machine test alone cannot prove,
 * because each of them is about what somebody can see: reassignment must stay
 * inside the category group, escalation must carry the whole trail, unrouted must
 * be visible and alerted rather than dropped, and every event must appear on the
 * timeline. These are those four, plus the rule that a blocked move shows the
 * machine's own sentence rather than a generic failure.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

function panel(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title }).closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

function queueRows(): HTMLElement[] {
  const grid = screen.getByRole('grid', { name: 'Inquiries' })
  return within(grid)
    .getAllByRole('row')
    .filter((row) => row.hasAttribute('data-row-id'))
}

describe('§9 — reassignment stays inside the same category group', () => {
  it('proposes only the category group, and says so in the preview', async () => {
    const user = userEvent.setup()
    // INQ-1046 is a Motor inquiry whose allowance has run out.
    renderInquiries(repositories, '/inquiries/inq-1046')

    await user.click(await screen.findByRole('button', { name: 'Auto-reassign to the next person' }))

    const gate = await screen.findByText('Reassign INQ-1046 to Kiran Solanki')
    const preview = gate.closest('section') as HTMLElement
    expect(within(preview).getByText('Motor — unchanged')).toBeInTheDocument()
    expect(within(preview).getByText(/Reassignment stays inside the Motor group/)).toBeInTheDocument()
  })

  it('refuses a reassignment out of the group, in the machine words', async () => {
    const intake = inquiryIntake(repositories)
    const outcome = await intake.reassign('inq-1046', {
      actorId: WHO.vivek,
      // Sneha covers renewals, not the Motor group.
      nextOwnerId: WHO.nikunj,
      nextOwnerCategoryGroupId: 'cat-travel',
      tatMinutes: 60,
      now: new Date('2026-08-26T09:30:00.000Z'),
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toContain('Reassignment stays inside the category group')
    expect(outcome.guard).toBe('reassignmentStaysInCategoryGroup')
  })
})

describe('§9 — escalation carries the full assignment history, not just the item', () => {
  it('previews the whole trail before sending, and hands it over in full', async () => {
    const user = userEvent.setup()
    // INQ-1042 was reassigned once; two people have held it.
    renderInquiries(repositories, '/inquiries/inq-1042')

    await user.click(await screen.findByRole('button', { name: 'Escalate with the full history' }))

    const preview = (
      await screen.findByText('Escalate INQ-1042 to Nikunj Shah')
    ).closest('section') as HTMLElement
    expect(within(preview).getByText('2 holders, in full')).toBeInTheDocument()
    expect(within(preview).getByText(/not just the item/)).toBeInTheDocument()

    await user.click(within(preview).getByRole('button', { name: 'Escalate' }))

    const carried = await screen.findByRole('list', {
      name: 'Assignment history carried with this escalation',
    })
    const holders = within(carried).getAllByRole('listitem')
    expect(holders).toHaveLength(2)
    expect(holders[0]).toHaveTextContent('Kiran Solanki')
    expect(holders[1]).toHaveTextContent('Nita Shah')
    // The reason each handover happened travels with it.
    expect(carried).toHaveTextContent('TAT elapsed without confirmation')
  })
})

describe('§9 — unrouted is a visible state with an alert, never a silent drop', () => {
  it('keeps an unresolvable inquiry in the queue, alerted, and reachable by filter', async () => {
    renderInquiries(repositories, '/inquiries?status=unrouted')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 inquiry is unrouted')

    // Still a row in the queue. Nothing was dropped to make room for the alert.
    await waitFor(() => expect(queueRows().length).toBe(1))
    expect(queueRows()[0]).toHaveTextContent('INQ-1041')
    expect(queueRows()[0]).toHaveTextContent('Unrouted')
  })

  it('parks a newly captured inquiry that routing cannot resolve, with the alert raised in the same move', async () => {
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries/new')

    await user.type(await screen.findByLabelText(/^Name/), 'Pinakin Doshi')
    await user.type(screen.getByLabelText(/^Mobile/), '9825110098')
    // The admin covers every category, so nothing is prefilled and nothing is guessed.
    await user.click(screen.getByRole('button', { name: 'Save inquiry' }))

    expect(await screen.findByRole('heading', { name: 'Pinakin Doshi' })).toBeInTheDocument()
    expect(within(panel('The record')).getByText('No category matched')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Send to unrouted and alert the admin' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Park and alert' }))

    expect(await screen.findByText('Unrouted')).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Unrouted — the admin has been alerted')
    expect(screen.getByText('Unrouted — no category matched')).toBeInTheDocument()
  })
})

describe('§9 — the timeline shows every event', () => {
  it('renders a line for the capture, each hold and the escalation, with the clocks that go with them', async () => {
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries/inq-1042')

    await user.click(await screen.findByRole('button', { name: 'Escalate with the full history' }))
    await user.click(await screen.findByRole('button', { name: 'Escalate' }))

    const trail = await screen.findByRole('list', { name: 'Assignment trail' })
    const lines = [...trail.querySelectorAll(':scope > li')]
    expect(lines.map((line) => line.getAttribute('data-kind'))).toEqual([
      'created',
      'assigned',
      'reassigned',
      'escalated',
    ])
    // Every line carries how long that step took.
    for (const line of lines) {
      expect(line.textContent).toMatch(/waiting/)
    }
  })
})

describe('a blocked transition shows the machine reason, not a generic error', () => {
  it('disables reassignment while the allowance is still running and prints why', async () => {
    // INQ-1045 was assigned 35 minutes ago against a 60 minute allowance.
    renderInquiries(repositories, '/inquiries/inq-1045')

    const reassign = await screen.findByRole('button', {
      name: 'Auto-reassign to the next person',
    })
    expect(reassign).toBeDisabled()
    expect(screen.getByText(/The TAT has not elapsed yet — it runs until/)).toBeInTheDocument()
    expect(reassign).toHaveAttribute('aria-describedby', 'reassign-blocked')
  })
})

describe('the dev clock advance makes a TAT lapse demonstrable', () => {
  it('moves the reading forward until the allowance is spent and reassignment unblocks', async () => {
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries/inq-1045')

    expect(await screen.findByRole('button', { name: 'Auto-reassign to the next person' })).toBeDisabled()

    const clock = screen.getByRole('group', { name: 'Demo clock' })
    await user.click(within(clock).getByRole('button', { name: '+1 hr' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Auto-reassign to the next person' })).toBeEnabled(),
    )
    expect(screen.getAllByText(/breached by/).length).toBeGreaterThan(0)
    expect(within(clock).getByText('+60 min ahead')).toBeInTheDocument()
  })

  it('holds a hand-picked assignee until the allowance is spent, then offers the next person', async () => {
    const user = userEvent.setup()
    // INQ-1044 is unassigned. Nita takes it by hand rather than by routing.
    renderInquiries(repositories, '/inquiries/inq-1044')

    await user.click(await screen.findByRole('button', { name: 'Assign' }))
    await user.selectOptions(screen.getByLabelText(/^Assign to/), WHO.nita)
    await user.click(screen.getByRole('button', { name: 'Assign and notify' }))
    expect(await screen.findByText('Assigned')).toBeInTheDocument()

    // Picking the person by hand buys no exemption: it sits with Nita, and the
    // machine says so, until the allowance runs out.
    const reassign = await screen.findByRole('button', {
      name: 'Auto-reassign to the next person',
    })
    expect(reassign).toBeDisabled()
    expect(screen.getByText(/The TAT has not elapsed yet — it runs until/)).toBeInTheDocument()

    // Assigned at the clock's own instant, so it takes two hours to be past a
    // sixty-minute allowance rather than exactly level with it.
    const clock = screen.getByRole('group', { name: 'Demo clock' })
    await user.click(within(clock).getByRole('button', { name: '+1 hr' }))
    await user.click(within(clock).getByRole('button', { name: '+1 hr' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Auto-reassign to the next person' }),
      ).toBeEnabled(),
    )
    expect(screen.getAllByText(/breached by/).length).toBeGreaterThan(0)
  })
})

describe('the convert-to-quotation CTA', () => {
  it('converts an accepted inquiry behind the gate and opens the composer', async () => {
    const user = userEvent.setup()
    // INQ-1032 is accepted and waiting to become a quotation.
    renderInquiries(repositories, '/inquiries/inq-1032')

    await user.click(await screen.findByRole('button', { name: 'Convert to quotation' }))
    const preview = (
      await screen.findByText('Convert INQ-1032 into a quotation')
    ).closest('section') as HTMLElement
    await user.click(within(preview).getByRole('button', { name: 'Convert' }))

    expect(
      await screen.findByRole('heading', { name: 'Quotation composer' }),
    ).toBeInTheDocument()
  })
})

describe('§5 — the queue pins unassigned and TAT-at-risk rows, and assigns in bulk', () => {
  it('puts breached rows first, then unassigned ones, and marks them pinned', async () => {
    renderInquiries(repositories, '/inquiries')

    await waitFor(() => expect(queueRows().length).toBeGreaterThan(4))
    const top = queueRows().slice(0, 5)

    expect(top[0]).toHaveTextContent('INQ-1046')
    expect(top[1]).toHaveTextContent('INQ-1042')
    expect(top[2]).toHaveTextContent('INQ-1044')
    expect(top[3]).toHaveTextContent('INQ-1040')
    expect(top[4]).toHaveTextContent('INQ-1041')
    for (const row of top) expect(row).toHaveTextContent('Pinned')

    // A row in no trouble is not pinned.
    const calm = queueRows().find((row) => row.textContent?.includes('INQ-1031'))
    expect(calm).toBeDefined()
    expect(calm).not.toHaveTextContent('Pinned')
  })

  it('routes a selection through ConfirmGate, and Cancel writes nothing', async () => {
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries')

    await waitFor(() => expect(queueRows().length).toBeGreaterThan(0))
    await user.click(screen.getByRole('checkbox', { name: 'Select row inq-1044' }))
    await user.click(await screen.findByRole('button', { name: 'Assign' }))

    const gate = await screen.findByRole('dialog')
    expect(within(gate).getByText('Kiran Solanki · TAT 60 min')).toBeInTheDocument()

    await user.click(within(gate).getByRole('button', { name: 'Cancel' }))
    // Cancel wrote nothing: the row is still unassigned.
    await waitFor(() => {
      const row = queueRows().find((candidate) => candidate.textContent?.includes('INQ-1044'))
      expect(row).toHaveTextContent('Unassigned')
    })

    await user.click(await screen.findByRole('button', { name: 'Assign' }))
    const second = await screen.findByRole('dialog')
    await user.click(within(second).getByRole('button', { name: 'Assign and notify' }))

    // The receipt in the gate, and the toast that says the same thing.
    expect((await screen.findAllByText('1 routed and notified')).length).toBeGreaterThan(0)
    const closes = within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })
    // The footer button, not the modal's own dismiss cross.
    await user.click(closes.find((button) => button.textContent?.trim() === 'Close') as HTMLElement)

    await waitFor(() => {
      const row = queueRows().find((candidate) => candidate.textContent?.includes('INQ-1044'))
      expect(row).toHaveTextContent('Kiran Solanki')
    })
  })

  it('assigns a selection to the person named in the gate, and previews them before writing', async () => {
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries')

    await waitFor(() => expect(queueRows().length).toBeGreaterThan(0))
    await user.click(screen.getByRole('checkbox', { name: 'Select row inq-1044' }))
    await user.click(await screen.findByRole('button', { name: 'Assign' }))

    // Routing's own pick, until somebody says otherwise.
    const gate = await screen.findByRole('dialog')
    expect(within(gate).getByText('Kiran Solanki · TAT 60 min')).toBeInTheDocument()

    // Naming somebody redraws the preview before anything is written.
    await user.selectOptions(within(gate).getByLabelText(/^Assign to/), WHO.nita)
    expect(within(gate).getByText('Nita Shah · TAT 60 min')).toBeInTheDocument()
    expect(within(gate).queryByText('Kiran Solanki · TAT 60 min')).not.toBeInTheDocument()

    await user.click(within(gate).getByRole('button', { name: 'Assign and notify' }))
    expect((await screen.findAllByText('1 assigned to Nita Shah')).length).toBeGreaterThan(0)

    const closes = within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })
    await user.click(closes.find((button) => button.textContent?.trim() === 'Close') as HTMLElement)

    await waitFor(() => {
      const row = queueRows().find((candidate) => candidate.textContent?.includes('INQ-1044'))
      expect(row).toHaveTextContent('Nita Shah')
    })
  })
})
