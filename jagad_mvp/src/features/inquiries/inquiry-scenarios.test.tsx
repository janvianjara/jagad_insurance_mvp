import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { WHO, freshRepositories, renderInquiries, signIn } from './test-harness'

/**
 * Canvas flow 1 — "Inquiry -> TAT -> Assignment" — one test per row.
 *
 * These six are the acceptance criteria for the module, written as the canvas
 * writes them: a situation, a trigger, and the outcome a sales manager expects.
 * They render the real screens against the real mock repositories, so a scenario
 * passing here means the walkthrough works, not that a helper returns the right
 * object.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

/** A `<Panel>` is a section titled by its heading; this is how a test scopes to one. */
function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

/** Opens the gate for the named action and presses its Confirm. */
async function confirmAction(actionLabel: string, confirmLabel: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: actionLabel }))
  const gate = await screen.findByRole('button', { name: confirmLabel })
  await user.click(gate)
}

describe('canvas 1 — inquiry, TAT and assignment', () => {
  it('1.1 an inquiry arrives from the website and routing assigns it, notifies, and starts the TAT clock', async () => {
    // INQ-1044: from the website, Health, routing has not run yet.
    renderInquiries(repositories, '/inquiries/inq-1044')

    expect(await screen.findByRole('heading', { name: 'Urvashi Naik' })).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()

    await confirmAction('Run routing', 'Route and notify')

    // Assigned to the matching person in the Health group.
    expect(await screen.findByText('Assigned')).toBeInTheDocument()
    const record = panel('The record')
    expect(within(record).getByText('Kiran Solanki')).toBeInTheDocument()

    // Notified, and logged in the trail.
    expect(screen.getByText('Assigned by routing')).toBeInTheDocument()
    expect(screen.getByText(/Kiran Solanki notified\./)).toBeInTheDocument()

    // The TAT timer is running, and its allowance came from configuration.
    expect(
      within(record).getByText('60 minutes, from the Health category in configuration'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/due in/).length).toBeGreaterThan(0)
  })

  it('1.2 the assignee confirms inside the TAT, so it is accepted, they own it, and the clock stops', async () => {
    // INQ-1045: assigned 35 minutes ago against a 60 minute allowance.
    renderInquiries(repositories, '/inquiries/inq-1045')

    expect(await screen.findByRole('heading', { name: 'Tejas Amin' })).toBeInTheDocument()
    expect(screen.getAllByText(/due in/).length).toBeGreaterThan(0)

    await confirmAction('Confirm and accept', 'Confirm')

    expect(await screen.findByText('Accepted')).toBeInTheDocument()
    const record = panel('The record')
    expect(within(record).getByText('Kiran Solanki')).toBeInTheDocument()

    // The clock stopped, and the acceptance is on the timeline.
    expect(screen.getByText('clock stopped')).toBeInTheDocument()
    expect(screen.queryByText(/due in/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Accepted — the assignee owns it and the clock stopped'),
    ).toBeInTheDocument()
  })

  it('1.3 the TAT passes with no confirmation, so it auto-reassigns to the next person in the category and both are notified', async () => {
    // INQ-1046: assigned 130 minutes ago against a 60 minute allowance.
    renderInquiries(repositories, '/inquiries/inq-1046')

    expect(await screen.findByRole('heading', { name: 'Rina Chokshi' })).toBeInTheDocument()
    expect(screen.getAllByText(/breached by/).length).toBeGreaterThan(0)

    await confirmAction('Auto-reassign to the next person', 'Reassign and notify')

    expect(await screen.findByText('Reassigned')).toBeInTheDocument()

    // Next in the Motor group, and the group did not widen.
    const record = panel('The record')
    expect(within(record).getByText('Kiran Solanki')).toBeInTheDocument()
    expect(within(record).getByText('Motor')).toBeInTheDocument()

    // Both notified, and both holds are on the timeline.
    const trail = screen.getByRole('list', { name: 'Assignment trail' })
    expect(within(trail).getByText('Assigned by routing')).toBeInTheDocument()
    expect(
      within(trail).getByText('Auto-reassigned to the next person in the category'),
    ).toBeInTheDocument()
    expect(within(trail).getByText(/Nita Shah and Kiran Solanki notified\./)).toBeInTheDocument()
  })

  it('1.4 the TAT lapses a second time, so escalation hands the sales manager the full history', async () => {
    // INQ-1042: reassigned once, second allowance already spent.
    renderInquiries(repositories, '/inquiries/inq-1042')

    expect(await screen.findByRole('heading', { name: 'Sagar Bhavsar' })).toBeInTheDocument()

    await confirmAction('Escalate with the full history', 'Escalate')

    expect(await screen.findByText('Escalated')).toBeInTheDocument()

    // The sales manager named by the escalation recipe, not by this screen.
    const record = panel('The record')
    expect(within(record).getByText('Nikunj Shah')).toBeInTheDocument()

    // §9: the escalation carries the FULL assignment history, not just the item.
    const carried = screen.getByRole('list', {
      name: 'Assignment history carried with this escalation',
    })
    expect(within(carried).getByText('Kiran Solanki')).toBeInTheDocument()
    expect(within(carried).getByText('Nita Shah')).toBeInTheDocument()
    expect(within(carried).getAllByRole('listitem')).toHaveLength(2)
  })

  it('1.5 routing cannot resolve a category, so the inquiry lands in the unrouted queue with an admin alert and is never lost', async () => {
    // The queue says so out loud.
    const queue = renderInquiries(repositories, '/inquiries')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 inquiry is unrouted')
    expect(alert).toHaveTextContent(/held here and alerted rather than dropped/)
    expect(await screen.findByText('Ketan Zaveri')).toBeInTheDocument()
    queue.unmount()

    // And so does the record itself.
    renderInquiries(repositories, '/inquiries/inq-1041')
    expect(await screen.findByRole('heading', { name: 'Ketan Zaveri' })).toBeInTheDocument()
    const recordAlert = await screen.findByRole('alert')
    expect(recordAlert).toHaveTextContent('Unrouted — the admin has been alerted')
    expect(recordAlert).toHaveTextContent(/No category matches this inquiry/)
    expect(screen.getByText('Unrouted — no category matched')).toBeInTheDocument()
  })

  it('1.6 a sub-agent in the field saves a name and a mobile only, and the inquiry is created, linked to them, and enters routing', async () => {
    await signIn(repositories, WHO.meera)
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries/new')

    // Two fields. Nothing else is touched.
    await user.type(await screen.findByLabelText(/^Name/), 'Hemal Trivedi')
    await user.type(screen.getByLabelText(/^Mobile/), '9825110099')
    await user.click(screen.getByRole('button', { name: 'Save inquiry' }))

    // It exists, on the platform's own numbering, and it is linked to her.
    expect(await screen.findByRole('heading', { name: 'Hemal Trivedi' })).toBeInTheDocument()
    expect(screen.getByText('INQ-1047')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()

    const record = panel('The record')
    expect(within(record).getByText('Meera Joshi')).toBeInTheDocument()
    expect(within(record).getByText('Health')).toBeInTheDocument()

    // And it has entered routing: a destination and an allowance are resolved.
    expect(screen.getByRole('button', { name: 'Run routing' })).toBeInTheDocument()
    expect(
      within(record).getByText('60 minutes, from the Health category in configuration'),
    ).toBeInTheDocument()
  })
})
